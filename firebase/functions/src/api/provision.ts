/**
 * Account Provisioning API
 *
 * Pre-provision accounts for existing customers so they can
 * log in immediately without going through signup/billing flow.
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as logger from '../utils/logger';

// Lazy initialize
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

function getAuth(): admin.auth.Auth {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.auth();
}

export interface ProvisionRequest {
  email: string;
  name?: string;
  billing_status?: 'active' | 'pending';
  setup_context?: string[];
}

export interface ProvisionResult {
  success: boolean;
  user_id?: string;
  client_id?: string;
  error?: string;
}

/**
 * Generate a temporary password for provisioned accounts
 * Users will need to reset their password on first login
 */
function generateTempPassword(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Provision an account for an existing customer
 *
 * Creates:
 * 1. Firebase Auth user (with temporary password)
 * 2. Client record in Firestore
 * 3. User record linking the two
 *
 * @param request - Provision request with email and options
 * @returns Result with user_id and client_id
 */
export async function provisionAccount(
  request: ProvisionRequest
): Promise<ProvisionResult> {
  const { email, name, billing_status = 'active', setup_context = ['general'] } = request;
  const db = getDb();
  const auth = getAuth();

  logger.info('Provisioning account', { email, billing_status });

  try {
    // Check if user already exists
    let userRecord: admin.auth.UserRecord | null = null;
    try {
      userRecord = await auth.getUserByEmail(email);
      logger.info('User already exists in Firebase Auth', { email, uid: userRecord.uid });
    } catch (err) {
      // User doesn't exist, we'll create them
      if ((err as { code?: string }).code !== 'auth/user-not-found') {
        throw err;
      }
    }

    // Create user if they don't exist
    if (!userRecord) {
      const tempPassword = generateTempPassword();
      userRecord = await auth.createUser({
        email,
        password: tempPassword,
        displayName: name || email.split('@')[0],
      });
      logger.info('Created Firebase Auth user', { email, uid: userRecord.uid });
    }

    // Check if client record already exists
    const existingClientQuery = await db
      .collection('clients')
      .where('email', '==', email)
      .limit(1)
      .get();

    let clientId: string;
    if (!existingClientQuery.empty) {
      // Update existing client
      clientId = existingClientQuery.docs[0].id;
      await db.collection('clients').doc(clientId).update({
        billing_status,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info('Updated existing client record', { clientId, billing_status });
    } else {
      // Create new client record
      const clientRef = await db.collection('clients').add({
        name: name || email.split('@')[0],
        email,
        billing_status,
        setup_context,
        provisioned: true,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      clientId = clientRef.id;
      logger.info('Created client record', { clientId });
    }

    // Create or update user record linking to client
    await db.collection('users').doc(userRecord.uid).set(
      {
        client_id: clientId,
        email,
        provisioned: true,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    logger.info('Created/updated user record', { uid: userRecord.uid, clientId });

    return {
      success: true,
      user_id: userRecord.uid,
      client_id: clientId,
    };
  } catch (error) {
    logger.error('Provision failed', error as Error, { email });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

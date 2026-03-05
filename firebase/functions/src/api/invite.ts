/**
 * Invite Code Management
 *
 * Handles invite code generation, validation, and redemption
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

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

export interface InviteCode {
  code: string;
  created_at: admin.firestore.Timestamp;
  created_by: string;
  expires_at?: admin.firestore.Timestamp;
  max_uses: number;
  uses: number;
  used_by: string[];
  note?: string;
  client_type?: 'retainer' | 'pay_per_query'; // Type of client this invite creates
  trial_credits?: number; // For pay_per_query clients
}

export interface SignupResult {
  success: boolean;
  user_id?: string;
  client_id?: string;
  id_token?: string;
  refresh_token?: string;
  error?: string;
}

/**
 * Generate a short invite code (8 characters, alphanumeric)
 */
export function generateInviteCode(): string {
  // Generate 6 bytes = 48 bits, encode as base36 for alphanumeric
  const bytes = crypto.randomBytes(6);
  const code = bytes.toString('hex').toUpperCase().slice(0, 8);
  return code;
}

/**
 * Create a new invite code
 */
export async function createInviteCode(
  createdBy: string,
  options: {
    maxUses?: number;
    expiresInDays?: number;
    note?: string;
    clientType?: 'retainer' | 'pay_per_query';
    trialCredits?: number;
  } = {}
): Promise<string> {
  const db = getDb();
  const code = generateInviteCode();

  const inviteData: any = {
    code,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by: createdBy,
    max_uses: options.maxUses || 1,
    uses: 0,
    used_by: [],
    client_type: options.clientType || 'retainer', // Default to retainer for backwards compatibility
  };

  if (options.expiresInDays) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    inviteData.expires_at = admin.firestore.Timestamp.fromDate(expiresAt);
  }

  if (options.note) {
    inviteData.note = options.note;
  }

  // For pay_per_query clients, set trial credits
  if (options.clientType === 'pay_per_query') {
    inviteData.trial_credits = options.trialCredits || 10; // Default 10 trial credits
  }

  // Use code as document ID for easy lookup
  await db.collection('invite_codes').doc(code).set(inviteData);

  return code;
}

/**
 * Validate an invite code
 */
export async function validateInviteCode(code: string): Promise<{ valid: boolean; error?: string }> {
  const db = getDb();
  const normalizedCode = code.toUpperCase().trim();

  const doc = await db.collection('invite_codes').doc(normalizedCode).get();

  if (!doc.exists) {
    return { valid: false, error: 'Invalid invite code' };
  }

  const data = doc.data() as InviteCode;

  // Check if expired
  if (data.expires_at && data.expires_at.toDate() < new Date()) {
    return { valid: false, error: 'Invite code has expired' };
  }

  // Check if max uses reached
  if (data.uses >= data.max_uses) {
    return { valid: false, error: 'Invite code has reached maximum uses' };
  }

  return { valid: true };
}

/**
 * Sign up a new user with an invite code
 */
export async function signupWithInvite(
  inviteCode: string,
  email: string,
  password: string
): Promise<SignupResult> {
  const db = getDb();
  const auth = getAuth();
  const normalizedCode = inviteCode.toUpperCase().trim();

  // Validate invite code
  const validation = await validateInviteCode(normalizedCode);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Get invite code details
    const inviteDoc = await db.collection('invite_codes').doc(normalizedCode).get();
    const inviteData = inviteDoc.data() as InviteCode;
    const clientType = inviteData.client_type || 'retainer';
    const trialCredits = inviteData.trial_credits || 10;

    // Create Firebase Auth user
    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false,
    });

    // Create client record based on invite type
    const clientData: any = {
      name: email.split('@')[0],
      email,
      client_type: clientType,
      setup_context: ['general'],
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      invited_by_code: normalizedCode,
    };

    // Configure based on client type
    if (clientType === 'retainer') {
      // Retainer clients: subscription-based, pending payment
      clientData.billing_status = 'pending'; // Requires payment to activate
    } else if (clientType === 'pay_per_query') {
      // Pay-per-query clients: credit-based, active immediately with trial credits
      clientData.billing_status = 'active'; // Active with trial credits
      clientData.credits = {
        balance: trialCredits,
        trial_credits_given: trialCredits,
        trial_credits_used: false,
      };
      clientData.kb_query_cost = 1;
      clientData.human_query_cost = 5;
    }

    const clientRef = await db.collection('clients').add(clientData);

    // Create user → client mapping
    await db.collection('users').doc(userRecord.uid).set({
      client_id: clientRef.id,
      email,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      invited_by_code: normalizedCode,
    });

    // Mark invite code as used
    await db.collection('invite_codes').doc(normalizedCode).update({
      uses: admin.firestore.FieldValue.increment(1),
      used_by: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
    });

    // Generate custom token and exchange for ID token
    const customToken = await auth.createCustomToken(userRecord.uid);

    return {
      success: true,
      user_id: userRecord.uid,
      client_id: clientRef.id,
      // Note: Custom token needs to be exchanged client-side for ID token
      // We'll return a flag indicating signup success
    };
  } catch (error: any) {
    // Handle specific Firebase Auth errors
    if (error.code === 'auth/email-already-exists') {
      return { success: false, error: 'Email already registered' };
    }
    if (error.code === 'auth/invalid-email') {
      return { success: false, error: 'Invalid email address' };
    }
    if (error.code === 'auth/weak-password') {
      return { success: false, error: 'Password is too weak (min 6 characters)' };
    }

    console.error('Signup error:', error);
    return { success: false, error: 'Failed to create account' };
  }
}

/**
 * List invite codes (admin only)
 */
export async function listInviteCodes(limit: number = 50): Promise<InviteCode[]> {
  const db = getDb();

  const snapshot = await db.collection('invite_codes')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    ...doc.data(),
    code: doc.id,
  })) as InviteCode[];
}

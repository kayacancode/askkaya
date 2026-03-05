/**
 * Telegram Auth Code Generation
 *
 * Generates one-time codes for linking Telegram accounts to AskKaya
 */

import * as admin from 'firebase-admin';
import * as logger from '../utils/logger.js';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Generate a random 8-character auth code
 */
function generateAuthCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar characters
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a one-time auth code for linking Telegram account
 */
export async function createTelegramAuthCode(
  clientId: string,
  idToken: string
): Promise<string> {
  const db = getDb();

  // Generate unique code
  let code = generateAuthCode();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const existingDoc = await db
      .collection('telegram_auth_codes')
      .doc(code)
      .get();

    if (!existingDoc.exists) {
      break;
    }

    code = generateAuthCode();
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique auth code');
  }

  // Store code (expires in 5 minutes)
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + 5 * 60 * 1000
  );

  await db
    .collection('telegram_auth_codes')
    .doc(code)
    .set({
      code,
      client_id: clientId,
      id_token: idToken,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: expiresAt,
      used: false,
    });

  logger.info('Created Telegram auth code', { client_id: clientId, code });

  return code;
}

/**
 * Clean up expired auth codes (called periodically)
 */
export async function cleanupExpiredAuthCodes(): Promise<number> {
  const db = getDb();

  const now = admin.firestore.Timestamp.now();

  const expiredSnapshot = await db
    .collection('telegram_auth_codes')
    .where('expires_at', '<', now)
    .get();

  if (expiredSnapshot.empty) {
    return 0;
  }

  const batch = db.batch();
  expiredSnapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();

  logger.info('Cleaned up expired auth codes', { count: expiredSnapshot.size });

  return expiredSnapshot.size;
}

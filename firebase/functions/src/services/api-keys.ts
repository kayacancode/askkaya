/**
 * API Key Service
 *
 * API key generation and verification for LLM proxy authentication.
 * Keys are stored hashed in Firestore and validated via collectionGroup queries.
 *
 * Ported from: github.com/2389-research/platform-2389
 */

import { createHash, randomBytes } from 'node:crypto';
import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';

/**
 * Lazy initialize Firebase Admin and Firestore
 */
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * API key prefix for all AskKaya keys
 * Format: sk-kaya-{32 hex chars}
 */
const API_KEY_PREFIX = 'sk-kaya-';

/**
 * Generates a cryptographically secure API key
 * Format: sk-kaya-{32 hex chars}
 * Example: sk-kaya-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
 */
export function generateAPIKey(): string {
  const randomPart = randomBytes(16).toString('hex'); // 32 hex chars
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Computes SHA-256 hash of an API key
 */
export function hashAPIKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Extracts the prefix portion of a key for display
 * Returns first 12 characters (e.g., "sk-kaya-a1b2")
 */
export function getKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 12);
}

/**
 * Validates that a string is a properly formatted API key
 */
export function isValidAPIKeyFormat(apiKey: string): boolean {
  // Must start with prefix and have 32 hex chars after
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return false;
  }
  const hexPart = apiKey.substring(API_KEY_PREFIX.length);
  return /^[a-f0-9]{32}$/i.test(hexPart);
}

interface CreateKeyResult {
  key: string;
  keyId: string;
}

/**
 * Creates a new API key for a user
 * @param uid - User ID to create the key for
 * @param name - User-provided name for the key
 * @returns The full API key (shown only once) and document ID
 */
export async function createAPIKey(uid: string, name: string): Promise<CreateKeyResult> {
  const db = getDb();
  const apiKey = generateAPIKey();
  const keyHash = hashAPIKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);

  const keyData = {
    keyHash,
    keyPrefix,
    name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  logger.info(`Creating API key for user: ${uid}`, {
    name,
    keyPrefix,
  });

  const docRef = await db.collection('users').doc(uid).collection('apiKeys').add(keyData);

  logger.info(`Successfully created API key for user: ${uid}`, {
    keyId: docRef.id,
    keyPrefix,
  });

  return {
    key: apiKey,
    keyId: docRef.id,
  };
}

interface VerifyKeyResult {
  valid: boolean;
  uid?: string;
  email?: string;
  keyId?: string;
  error?: string;
}

/**
 * Verifies an API key and returns the associated user ID
 * Uses collectionGroup query to find key by hash across all users
 */
export async function verifyAPIKey(apiKey: string): Promise<VerifyKeyResult> {
  if (!isValidAPIKeyFormat(apiKey)) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const db = getDb();
  const keyHash = hashAPIKey(apiKey);

  try {
    // Use collectionGroup to search across all users' apiKeys subcollections
    const querySnapshot = await db
      .collectionGroup('apiKeys')
      .where('keyHash', '==', keyHash)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return { valid: false, error: 'Invalid API key' };
    }

    const keyDoc = querySnapshot.docs[0];
    const keyData = keyDoc.data();

    // Check if key is revoked
    if (keyData.revokedAt) {
      return { valid: false, error: 'API key has been revoked' };
    }

    // Extract uid from document path: users/{uid}/apiKeys/{keyId}
    const pathParts = keyDoc.ref.path.split('/');
    const uid = pathParts[1]; // users/{uid}/apiKeys/{keyId}

    // Get user email
    let email: string | undefined;
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        email = userDoc.data()?.email;
      }
    } catch (err) {
      logger.warn('Failed to fetch user email for API key verification', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Update lastUsedAt asynchronously (don't block the response)
    keyDoc.ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() }).catch((err) => {
      logger.warn('Failed to update lastUsedAt for API key', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return {
      valid: true,
      uid,
      email,
      keyId: keyDoc.id,
    };
  } catch (error) {
    logger.error('Error verifying API key', error as Error, {});
    return { valid: false, error: 'Failed to verify API key' };
  }
}

/**
 * Lists all API keys for a user (without the actual key values)
 */
export async function listAPIKeys(uid: string) {
  const db = getDb();

  const querySnapshot = await db
    .collection('users')
    .doc(uid)
    .collection('apiKeys')
    .orderBy('createdAt', 'desc')
    .get();

  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      prefix: data.keyPrefix,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      lastUsedAt: data.lastUsedAt?.toDate?.()?.toISOString() || null,
      revoked: !!data.revokedAt,
    };
  });
}

/**
 * Revokes an API key by setting revokedAt timestamp
 * @param uid - User ID who owns the key
 * @param keyId - Document ID of the key to revoke
 * @returns true if successful, false if key not found or already revoked
 */
export async function revokeAPIKey(uid: string, keyId: string): Promise<boolean> {
  const db = getDb();

  const keyRef = db.collection('users').doc(uid).collection('apiKeys').doc(keyId);
  const keyDoc = await keyRef.get();

  if (!keyDoc.exists) {
    logger.warn(`API key not found for revocation: ${keyId}`, { uid });
    return false;
  }

  const keyData = keyDoc.data();
  if (keyData?.revokedAt) {
    logger.warn(`API key already revoked: ${keyId}`, { uid });
    return false;
  }

  await keyRef.update({
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`API key revoked: ${keyId}`, { uid });
  return true;
}

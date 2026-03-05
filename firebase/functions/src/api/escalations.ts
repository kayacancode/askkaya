/**
 * Escalations API
 *
 * Handles fetching and managing user escalations
 */

import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';

// Lazy initialize
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

export interface EscalationResponse {
  id: string;
  query: string;
  status: 'pending' | 'answered' | 'dismissed' | 'closed';
  answer?: string;
  createdAt: string;
  answeredAt?: string;
  confidence?: number;
}

/**
 * Get escalations for a client
 * @param clientId - Client ID to fetch escalations for
 * @param pendingOnly - If true, only return pending escalations
 * @returns List of escalations
 */
export async function getEscalations(
  clientId: string,
  pendingOnly: boolean = false
): Promise<EscalationResponse[]> {
  const db = getDb();

  try {
    let query = db
      .collection('escalations')
      .where('clientId', '==', clientId)
      .orderBy('createdAt', 'desc')
      .limit(50);  // Limit to most recent 50

    if (pendingOnly) {
      query = query.where('status', '==', 'pending') as admin.firestore.Query;
    }

    const snapshot = await query.get();

    const escalations: EscalationResponse[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        query: data.query || '',
        status: data.status || 'pending',
        answer: data.answer,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        answeredAt: data.answeredAt?.toDate?.()?.toISOString(),
        confidence: data.confidence,
      };
    });

    logger.info('Fetched escalations', {
      clientId,
      count: escalations.length,
      pendingOnly,
    });

    return escalations;
  } catch (error) {
    logger.error('Failed to fetch escalations', error as Error, { clientId });
    throw error;
  }
}

/**
 * Get a specific escalation by ID
 * @param escalationId - Escalation ID
 * @param clientId - Client ID (for authorization)
 * @returns Escalation details
 */
export async function getEscalation(
  escalationId: string,
  clientId: string
): Promise<EscalationResponse> {
  const db = getDb();

  try {
    const doc = await db.collection('escalations').doc(escalationId).get();

    if (!doc.exists) {
      throw new Error('Escalation not found');
    }

    const data = doc.data()!;

    // Verify client owns this escalation
    if (data.clientId !== clientId) {
      throw new Error('Access denied');
    }

    return {
      id: doc.id,
      query: data.query || '',
      status: data.status || 'pending',
      answer: data.answer,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      answeredAt: data.answeredAt?.toDate?.()?.toISOString(),
      confidence: data.confidence,
    };
  } catch (error) {
    logger.error('Failed to fetch escalation', error as Error, { escalationId, clientId });
    throw error;
  }
}

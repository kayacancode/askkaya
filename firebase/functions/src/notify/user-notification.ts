/**
 * User Notification System
 *
 * Sends email notifications to users when their escalations are answered
 */

import * as admin from 'firebase-admin';
import { sendEmail } from './email';
import * as logger from '../utils/logger';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Notify user via email when their escalation is answered
 * Called by Firestore trigger when escalation.status changes to 'answered'
 */
export async function notifyUserOfAnswer(
  escalationId: string,
  clientId: string,
  query: string,
  answer: string
): Promise<void> {
  const db = getDb();

  try {
    // Get client info for email
    const clientDoc = await db.collection('clients').doc(clientId).get();

    if (!clientDoc.exists) {
      logger.error('Client not found for escalation notification', undefined, {
        escalationId,
        clientId,
      });
      return;
    }

    const clientData = clientDoc.data();
    const clientEmail = clientData?.email;
    const clientName = clientData?.name || 'there';

    if (!clientEmail) {
      logger.warn('No email address for client', { escalationId, clientId });
      return;
    }

    // Format email
    const subject = '✅ Your AskKaya question has been answered';
    const message = `
Hi ${clientName},

I've personally answered your question:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your question:
${query}

My answer:
${answer}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can also view all your answered questions anytime by running:
  askkaya escalations

Best,
Kaya
    `.trim();

    // Send email
    await sendEmail(clientEmail, subject, message);

    logger.info('Sent escalation answer notification', {
      escalationId,
      clientId,
      email: clientEmail,
    });

    // Update escalation to track notification
    await db.collection('escalations').doc(escalationId).update({
      user_notified: true,
      user_notified_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('Error notifying user of answer', error as Error, {
      escalationId,
      clientId,
    });
  }
}

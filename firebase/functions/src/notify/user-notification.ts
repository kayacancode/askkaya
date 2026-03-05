/**
 * User Notification System
 *
 * Sends email and Telegram notifications to users when their escalations are answered
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from '../utils/logger';

// Initialize Firebase at module level
if (getApps().length === 0) {
  initializeApp();
}

// Get Firestore instance
function getDb() {
  return getFirestore();
}

/**
 * Send a Telegram message to a user
 */
async function sendTelegramMessage(
  chatId: number,
  text: string,
  botToken: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${errorText}`);
  }
}

/**
 * Check if user has Telegram linked and get their chat ID
 */
async function getTelegramChatId(
  db: ReturnType<typeof getFirestore>,
  clientId: string
): Promise<number | null> {
  // Query telegram_users collection for this client_id
  const telegramUsersSnapshot = await db
    .collection('telegram_users')
    .where('client_id', '==', clientId)
    .limit(1)
    .get();

  if (telegramUsersSnapshot.empty) {
    return null;
  }

  const telegramUser = telegramUsersSnapshot.docs[0].data();
  return telegramUser.telegram_id as number;
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

    // Send Telegram notification if user has linked their account
    const botToken = process.env['TELEGRAM_BOT_TOKEN'];
    if (botToken) {
      const chatId = await getTelegramChatId(db, clientId);
      if (chatId) {
        try {
          const telegramMessage = `
✅ <b>Your question has been answered!</b>

<b>Your question:</b>
${query}

<b>My answer:</b>
${answer}

━━━━━━━━━━━━━━━━━━━━━━

View all your escalations:
  askkaya escalations

Best,
Kaya
          `.trim();

          await sendTelegramMessage(chatId, telegramMessage, botToken);

          logger.info('Sent escalation answer notification via Telegram', {
            escalationId,
            clientId,
            telegram_id: chatId,
          });
        } catch (error) {
          logger.error('Failed to send Telegram notification', error as Error, {
            escalationId,
            clientId,
            telegram_id: chatId,
          });
          // Don't fail the whole notification if Telegram fails
        }
      }
    }

    // Update escalation to track notification
    await db.collection('escalations').doc(escalationId).update({
      user_notified: true,
      user_notified_at: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('Error notifying user of answer', error as Error, {
      escalationId,
      clientId,
    });
  }
}

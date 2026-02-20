/**
 * Notification Router
 * 
 * Multi-channel notification routing with fallback chain:
 * 1. Telegram (primary)
 * 2. iMessage (fallback)
 * 3. Email (final fallback)
 */

import { Escalation, NotificationResult } from './types';
import { formatEscalationAlert, sendMessage as sendTelegram } from './telegram';
import { sendMessage as sendIMessage } from './imessage';
import { sendEmail } from './email';

/**
 * Send notification through available channels with fallback
 * Tries channels in priority order until one succeeds
 */
export async function sendNotification(
  escalation: Escalation
): Promise<NotificationResult> {
  // Validate escalation data
  if (!escalation.clientId || !escalation.clientName || !escalation.query) {
    throw new Error('Invalid escalation data: missing required fields');
  }
  
  const formattedMessage = formatEscalationAlert(escalation);
  const errors: string[] = [];
  
  // Try Telegram first
  try {
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    if (telegramChatId) {
      const result = await sendTelegram(telegramChatId, formattedMessage);
      if (result.success) {
        // Update escalation document
        await updateEscalationChannel(escalation.id, 'telegram');
        
        return {
          sent: true,
          channel: 'telegram',
          messageId: result.messageId,
        };
      }
    }
  } catch (error) {
    errors.push(`Telegram: ${(error as Error).message}`);
    console.error('Telegram notification failed:', error);
  }
  
  // Try iMessage as fallback
  try {
    const iMessagePhone = process.env.IMESSAGE_PHONE_NUMBER;
    if (iMessagePhone) {
      const result = await sendIMessage(iMessagePhone, formattedMessage);
      if (result.success) {
        // Update escalation document
        await updateEscalationChannel(escalation.id, 'imessage');
        
        return {
          sent: true,
          channel: 'imessage',
          messageId: result.messageId,
        };
      }
    }
  } catch (error) {
    errors.push(`iMessage: ${(error as Error).message}`);
    console.error('iMessage notification failed:', error);
  }
  
  // Try email as final fallback
  try {
    const supportEmail = process.env.SUPPORT_EMAIL;
    if (supportEmail) {
      const subject = `Escalation: ${escalation.clientName} - ${escalation.id}`;
      const result = await sendEmail(supportEmail, subject, formattedMessage);
      if (result.success) {
        // Update escalation document
        await updateEscalationChannel(escalation.id, 'email');
        
        return {
          sent: true,
          channel: 'email',
          messageId: result.messageId,
        };
      }
    }
  } catch (error) {
    errors.push(`Email: ${(error as Error).message}`);
    console.error('Email notification failed:', error);
  }
  
  // All channels failed
  const errorMessage = `All notification channels failed: ${errors.join('; ')}`;
  console.error('Notification failed for escalation', escalation.id, errorMessage);
  
  return {
    sent: false,
    channel: null,
    error: errorMessage,
  };
}

/**
 * Update escalation document with notification channel used
 */
async function updateEscalationChannel(
  escalationId: string,
  channel: string
): Promise<void> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();
  
  await db.collection('escalations').doc(escalationId).update({
    notificationChannel: channel,
    notificationSentAt: new Date(),
  });
}

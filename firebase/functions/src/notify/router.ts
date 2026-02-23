/**
 * Notification Router
 * 
 * Multi-channel notification routing with fallback chain:
 * 1. Telegram (primary)
 * 2. iMessage (fallback)
 * 3. Email (final fallback)
 */

import * as admin from 'firebase-admin';
import { Escalation, NotificationResult } from './types';
import { formatEscalationAlert, sendMessage as sendTelegram } from './telegram';
import { sendMessage as sendIMessage } from './imessage';
import { sendEmail } from './email';
import * as logger from '../utils/logger';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  try {
    // Try to get the default app
    admin.app();
  } catch {
    // App doesn't exist, initialize it
    admin.initializeApp();
  }
  return admin.firestore();
}

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
        
        logger.logNotification('telegram', true, {
          escalationId: escalation.id,
          messageId: result.messageId,
        });
        
        return {
          sent: true,
          channel: 'telegram',
          messageId: result.messageId,
        };
      }
    }
  } catch (error) {
    errors.push(`Telegram: ${(error as Error).message}`);
    logger.error('Telegram notification failed', error as Error, {
      escalationId: escalation.id,
    });
  }
  
  // Try iMessage as fallback
  try {
    const iMessagePhone = process.env.IMESSAGE_PHONE_NUMBER;
    if (iMessagePhone) {
      const result = await sendIMessage(iMessagePhone, formattedMessage);
      if (result.success) {
        // Update escalation document
        await updateEscalationChannel(escalation.id, 'imessage');
        
        logger.logNotification('imessage', true, {
          escalationId: escalation.id,
          messageId: result.messageId,
        });
        
        return {
          sent: true,
          channel: 'imessage',
          messageId: result.messageId,
        };
      }
    }
  } catch (error) {
    errors.push(`iMessage: ${(error as Error).message}`);
    logger.error('iMessage notification failed', error as Error, {
      escalationId: escalation.id,
    });
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
        
        logger.logNotification('email', true, {
          escalationId: escalation.id,
          messageId: result.messageId,
        });
        
        return {
          sent: true,
          channel: 'email',
          messageId: result.messageId,
        };
      }
    }
  } catch (error) {
    errors.push(`Email: ${(error as Error).message}`);
    logger.error('Email notification failed', error as Error, {
      escalationId: escalation.id,
    });
  }
  
  // All channels failed
  const errorMessage = `All notification channels failed: ${errors.join('; ')}`;
  logger.error('All notification channels failed', undefined, {
    escalationId: escalation.id,
    errors,
  });
  
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
  const db = getDb();

  await db.collection('escalations').doc(escalationId).update({
    notificationChannel: channel,
    notificationSentAt: new Date(),
  });
}

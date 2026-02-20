/**
 * AskKaya Cloud Functions Entry Point
 * 
 * Firebase Cloud Functions v2 for the AskKaya platform
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { sendNotification } from './notify/router';
import { handleTelegramUpdate } from './notify/telegram';
import type { Escalation, TelegramUpdate } from './notify/types';

/**
 * Firestore trigger: Send notification when new escalation is created
 */
export const onEscalationCreated = onDocumentCreated(
  'escalations/{escalationId}',
  async (event) => {
    const escalationData = event.data?.data();
    
    if (!escalationData) {
      console.error('No escalation data in event');
      return;
    }
    
    const escalation: Escalation = {
      id: event.params.escalationId,
      clientId: escalationData.clientId,
      clientName: escalationData.clientName,
      query: escalationData.query,
      contextTags: escalationData.contextTags || [],
      status: escalationData.status || 'pending',
      createdAt: escalationData.createdAt,
    };
    
    try {
      const result = await sendNotification(escalation);
      console.log('Notification sent:', result);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
);

/**
 * HTTP endpoint: Telegram webhook receiver
 */
export const telegramWebhook = onRequest(async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  
  try {
    const update = req.body as TelegramUpdate;
    
    if (!update) {
      res.status(400).send('Invalid request body');
      return;
    }
    
    const result = await handleTelegramUpdate(update);
    
    res.status(200).json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
    });
  }
});

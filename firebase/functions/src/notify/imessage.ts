/**
 * iMessage Bridge Integration
 * 
 * Fallback notification channel using a local iMessage bridge
 * Sends notifications via HTTP webhook to a local bridge service
 */

import { SendMessageResult } from './types';

/**
 * Send a message via iMessage bridge
 * 
 * @param phoneNumber - Phone number to send to (configured in env)
 * @param message - Message text to send
 * @returns Promise resolving to success status
 */
export async function sendMessage(
  phoneNumber: string,
  message: string
): Promise<SendMessageResult> {
  const webhookUrl = process.env.IMESSAGE_WEBHOOK_URL;
  
  if (!webhookUrl) {
    throw new Error('IMESSAGE_WEBHOOK_URL environment variable is not set');
  }
  
  // Use configured phone number if none provided
  const targetPhone = phoneNumber || process.env.IMESSAGE_PHONE_NUMBER;
  
  if (!targetPhone) {
    throw new Error('IMESSAGE_PHONE_NUMBER environment variable is not set and no phone number provided');
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber: targetPhone,
        message,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`iMessage bridge returned ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    return {
      success: true,
      messageId: data.messageId || 'imsg_' + Date.now(),
    };
  } catch (error) {
    throw new Error(`iMessage send failed: ${(error as Error).message}`);
  }
}

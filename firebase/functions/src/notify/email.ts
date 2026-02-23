/**
 * Email Notification Service
 *
 * Final fallback notification channel using email
 */

import { SendMessageResult } from './types';

/**
 * Send an email notification
 *
 * @param to - Email address to send to (configured in env)
 * @param subject - Email subject
 * @param body - Email body
 * @returns Promise resolving to success status
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<SendMessageResult> {
  const emailService = process.env['EMAIL_SERVICE_URL'];

  if (!emailService) {
    throw new Error('EMAIL_SERVICE_URL environment variable is not set');
  }

  // Use configured email if none provided
  const targetEmail = to || process.env.SUPPORT_EMAIL;

  if (!targetEmail) {
    throw new Error('SUPPORT_EMAIL environment variable is not set and no email provided');
  }

  try {
    const response = await fetch(emailService, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: targetEmail,
        subject,
        body,
      }),
    });

    if (!response.ok) {
      throw new Error(`Email service returned ${response.status}`);
    }

    const data = (await response.json()) as { messageId?: string };

    return {
      success: true,
      messageId: data.messageId || 'email_' + Date.now(),
    };
  } catch (error) {
    throw new Error(`Email send failed: ${(error as Error).message}`);
  }
}

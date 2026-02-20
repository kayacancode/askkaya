/**
 * Type definitions for notification system
 */

export interface Escalation {
  id: string;
  clientId: string;
  clientName: string;
  query: string;
  contextTags?: string[];
  status: 'pending' | 'answered' | 'closed';
  createdAt: Date | { toDate?: () => Date };
  notificationChannel?: string;
  notificationSentAt?: Date;
}

export interface SendMessageResult {
  success: boolean;
  messageId: number | string;
}

export interface NotificationResult {
  sent: boolean;
  channel: string | null;
  messageId?: number | string;
  error?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
    };
    from?: {
      id: number;
      first_name: string;
      username?: string;
    };
    date: number;
    text?: string;
    reply_to_message?: {
      message_id: number;
      text?: string;
    };
  };
}

export interface HandleUpdateResult {
  escalationId?: string;
  answer?: string;
  ticketUpdated?: boolean;
  autoLearnTriggered?: boolean;
  kbArticleId?: string;
  ignored?: boolean;
}

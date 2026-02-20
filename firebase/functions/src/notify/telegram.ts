/**
 * Telegram Bot API Integration
 * 
 * Handles sending escalation alerts and processing replies from support team
 */

import { Escalation, SendMessageResult, TelegramUpdate, HandleUpdateResult } from './types';

/**
 * Format an escalation alert message for Telegram
 * Uses Markdown formatting for better readability
 */
export function formatEscalationAlert(escalation: Escalation): string {
  const tags = escalation.contextTags && escalation.contextTags.length > 0
    ? escalation.contextTags.join(', ')
    : 'none';
  
  // Escape special characters for Markdown
  const escapeMarkdown = (text: string): string => {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  };
  
  const clientName = escapeMarkdown(escalation.clientName);
  const query = escapeMarkdown(escalation.query);
  const escId = escapeMarkdown(escalation.id);
  
  return `🚨 *Escalation: ${escId}*

*Client:* ${clientName}
*Query:* ${query}

*Context Tags:* ${tags}

_Reply to this message with the answer to resolve the ticket\\._`;
}

/**
 * Send a message via Telegram Bot API
 * Retries once on failure
 */
export async function sendMessage(
  chatId: string,
  text: string
): Promise<SendMessageResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }
  
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
  };
  
  // Try twice (initial + 1 retry)
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || !data.ok) {
        throw new Error(data.description || 'Telegram API error');
      }
      
      return {
        success: true,
        messageId: data.result.message_id,
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt === 0) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  throw lastError;
}

/**
 * Handle incoming Telegram webhook update
 * Processes replies to escalation alerts
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate
): Promise<HandleUpdateResult> {
  const message = update.message;
  
  // Ignore if not a reply
  if (!message || !message.reply_to_message) {
    return { ignored: true };
  }
  
  // Extract escalation ID from original message
  const originalText = message.reply_to_message.text || '';
  const escIdMatch = originalText.match(/esc_[a-zA-Z0-9_-]+/);
  
  if (!escIdMatch) {
    return { ignored: true };
  }
  
  const escalationId = escIdMatch[0];
  const answer = message.text || '';
  
  if (!answer) {
    throw new Error('Reply message has no text');
  }
  
  // Answer the ticket (mock implementation - will be replaced with actual Firestore call)
  await answerTicket(escalationId, answer);
  
  // Trigger auto-learn
  const kbArticleId = await autoLearn(escalationId, answer);
  
  // Send confirmation
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const confirmationText = `✅ Ticket ${escalationId} updated successfully!\\n\\nAnswer recorded and added to knowledge base\\.`;
    
    await sendMessage(
      message.chat.id.toString(),
      confirmationText
    );
  }
  
  return {
    escalationId,
    answer,
    ticketUpdated: true,
    autoLearnTriggered: true,
    kbArticleId,
  };
}

/**
 * Answer a ticket in Firestore
 * Updates the escalation document with the answer
 */
async function answerTicket(escalationId: string, answer: string): Promise<void> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();
  
  await db.collection('escalations').doc(escalationId).update({
    status: 'answered',
    answer,
    answeredAt: new Date(),
  });
}

/**
 * Auto-learn from answer: create KB article and index it
 */
async function autoLearn(escalationId: string, answer: string): Promise<string> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();
  
  // Get the escalation to extract query and client info
  const escDoc = await db.collection('escalations').doc(escalationId).get();
  const escalation = escDoc.data();
  
  if (!escalation) {
    throw new Error(`Escalation ${escalationId} not found`);
  }
  
  const query = escalation.query;
  const clientId = escalation.clientId;
  
  // Create KB article
  const articleTitle = query.length > 100 
    ? query.substring(0, 97) + '...' 
    : query;
  
  const kbArticle = {
    title: articleTitle,
    content: answer,
    createdAt: new Date(),
    source: 'escalation',
    escalationId,
    clientId,
  };
  
  // Add to KB collection
  const kbRef = await db.collection('kb').add(kbArticle);
  
  // Generate embedding
  const { generateEmbedding } = await import('../services/embeddings');
  const embeddingText = `${articleTitle}\n\n${answer}`;
  const embedding = await generateEmbedding(embeddingText);
  
  // Store embedding
  await db.collection('kb').doc(kbRef.id).update({
    embedding,
    embeddingUpdatedAt: new Date(),
  });
  
  return kbRef.id;
}

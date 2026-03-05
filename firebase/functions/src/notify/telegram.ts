/**
 * Telegram Bot API Integration
 * 
 * Handles sending escalation alerts and processing replies from support team
 */

import { Escalation, SendMessageResult, TelegramUpdate, HandleUpdateResult } from './types';
import { initializeApp, getApps } from 'firebase-admin/app';

// Ensure Firebase Admin is initialized
function ensureFirebaseInit() {
  if (getApps().length === 0) {
    initializeApp();
  }
}

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
  // Include ID in a parseable format: [ID:xxx]
  const escId = escalation.id;

  return `🚨 *Escalation*
\\[ID:${escId}\\]

*Client:* ${clientName}
*Query:* ${query}

*Context Tags:* ${tags}

_Reply to this message to answer\\. Prefixes: PERSONAL: \\(user only\\), GLOBAL: \\(all clients\\), or no prefix \\(this client\\)\\. Type DISMISS to close\\._`;
}

/**
 * Send a message via Telegram Bot API
 * Retries once on failure
 */
export async function sendMessage(
  chatId: string,
  text: string
): Promise<SendMessageResult> {
  const botToken = process.env.TELEGRAM_ADMIN_BOT_TOKEN;

  if (!botToken) {
    throw new Error('TELEGRAM_ADMIN_BOT_TOKEN environment variable is not set');
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
 *
 * - Reply with answer → saves to KB + closes ticket
 * - Reply with "DISMISS" → closes ticket without saving
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate
): Promise<HandleUpdateResult> {
  const message = update.message;

  // Ignore if not a reply
  if (!message || !message.reply_to_message) {
    return { ignored: true };
  }

  // Extract escalation ID from original message [ID:xxx] or ID:xxx
  const originalText = message.reply_to_message.text || '';
  // Try multiple patterns - Markdown might escape brackets differently
  const escIdMatch = originalText.match(/\[ID:([a-zA-Z0-9]+)\]/)
    || originalText.match(/ID:([a-zA-Z0-9]+)/);

  if (!escIdMatch || !escIdMatch[1]) {
    return { ignored: true };
  }

  const escalationId = escIdMatch[1];
  const answer = (message.text || '').trim();

  if (!answer) {
    throw new Error('Reply message has no text');
  }

  const isDismiss = answer.toUpperCase() === 'DISMISS';
  const isGlobal = answer.toUpperCase().startsWith('GLOBAL:');
  const isPersonal = answer.toUpperCase().startsWith('PERSONAL:');
  const isClient = answer.toUpperCase().startsWith('CLIENT:');
  const chatId = message.chat.id.toString();

  if (isDismiss) {
    // Close without saving to KB
    await dismissTicket(escalationId);

    await sendMessage(chatId, `✅ Ticket dismissed\\.`);

    return {
      escalationId,
      answer: '',
      ticketUpdated: true,
      autoLearnTriggered: false,
    };
  }

  // Extract actual answer (remove prefix if present)
  let actualAnswer = answer;
  if (isGlobal) actualAnswer = answer.substring(7).trim();
  else if (isPersonal) actualAnswer = answer.substring(9).trim();
  else if (isClient) actualAnswer = answer.substring(7).trim();

  // Normal flow: answer ticket + auto-learn
  await answerTicket(escalationId, actualAnswer);

  const kbArticleId = await autoLearn(escalationId, actualAnswer, { isGlobal, isPersonal });

  const scope = isGlobal ? 'global' : isPersonal ? 'personal' : 'client\\-specific';
  await sendMessage(
    chatId,
    `✅ Ticket answered and added to KB \\(${scope}\\)\\.`
  );

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
  ensureFirebaseInit();
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();

  await db.collection('escalations').doc(escalationId).update({
    status: 'answered',
    answer,
    answeredAt: new Date(),
  });
}

/**
 * Dismiss a ticket without saving to KB
 */
async function dismissTicket(escalationId: string): Promise<void> {
  ensureFirebaseInit();
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();

  await db.collection('escalations').doc(escalationId).update({
    status: 'dismissed',
    dismissedAt: new Date(),
  });
}

/**
 * Auto-learn from answer: create KB article with pending_embedding status
 * The onKBArticleCreated trigger will generate the embedding
 *
 * @param scope.isGlobal - If true, article is visible to all clients
 * @param scope.isPersonal - If true, article is visible only to the original user (owner_id)
 * Default (neither): article is visible to the client organization (client_id)
 */
async function autoLearn(
  escalationId: string,
  answer: string,
  scope: { isGlobal?: boolean; isPersonal?: boolean } = {}
): Promise<string> {
  ensureFirebaseInit();
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const db = getFirestore();

  // Get the escalation to extract query and client info
  const escDoc = await db.collection('escalations').doc(escalationId).get();
  const escalation = escDoc.data();

  if (!escalation) {
    throw new Error(`Escalation ${escalationId} not found`);
  }

  const query = escalation.query || '';
  const clientId = escalation.clientId;
  const userId = escalation.userId;

  // Create KB article
  const articleTitle = `FAQ: ${query.length > 50 ? query.substring(0, 47) + '...' : query}`;

  // Determine access control based on scope
  let articleAccess: { is_global: boolean; client_id: string | null; owner_id: string | null };

  if (scope.isGlobal) {
    articleAccess = { is_global: true, client_id: null, owner_id: null };
  } else if (scope.isPersonal) {
    articleAccess = { is_global: false, client_id: null, owner_id: userId || null };
  } else {
    // Default: client-level
    articleAccess = { is_global: false, client_id: clientId || null, owner_id: null };
  }

  const kbArticle = {
    title: articleTitle,
    content: answer,
    summary: query,
    source: 'escalation',
    source_id: escalationId,
    lookup_key: `escalation:${escalationId}`,
    tags: ['escalation', 'faq'],
    ...articleAccess,
    status: 'pending_embedding',  // Trigger will generate embedding
    learned_from_escalation: escalationId,
    created_at: FieldValue.serverTimestamp(),
  };

  // Add to kb_articles collection (correct collection name)
  const kbRef = await db.collection('kb_articles').add(kbArticle);

  // Update escalation to mark it as learned
  await db.collection('escalations').doc(escalationId).update({
    auto_learned: true,
    kb_article_id: kbRef.id,
  });

  return kbRef.id;
}

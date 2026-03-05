/**
 * Telegram Bot Handler
 *
 * Handles incoming Telegram messages and relays them to AskKaya query API
 */

import * as admin from 'firebase-admin';
import { processQuery } from '../api/query.js';
import * as logger from '../utils/logger.js';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
}

export interface TelegramUser {
  telegram_id: number;
  client_id: string;
  id_token: string;
  linked_at: admin.firestore.Timestamp;
  telegram_username?: string;
  telegram_first_name?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: admin.firestore.Timestamp;
}

/**
 * Handle incoming Telegram webhook update
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  botToken: string
): Promise<void> {
  const db = getDb();

  if (!update.message?.text) {
    return; // Ignore non-text messages
  }

  const telegramId = update.message.from.id;
  const chatId = update.message.chat.id;
  const text = update.message.text.trim();

  logger.info('Received Telegram message', {
    telegram_id: telegramId,
    text: text.substring(0, 50),
  });

  try {
    // Handle commands
    if (text.startsWith('/')) {
      await handleCommand(telegramId, chatId, text, botToken, db, update.message.from);
      return;
    }

    // Check if user is authenticated
    const userDoc = await db
      .collection('telegram_users')
      .doc(telegramId.toString())
      .get();

    if (!userDoc.exists) {
      await sendMessage(
        chatId,
        'Welcome to AskKaya! 👋\n\nTo get started, link your account:\n\n1. Run this command:\n   askkaya telegram link\n\n2. Send the code here:\n   /auth YOUR_CODE',
        botToken
      );
      return;
    }

    const userData = userDoc.data() as TelegramUser;

    // Get conversation history (last 10 messages)
    const conversationRef = db
      .collection('telegram_conversations')
      .doc(telegramId.toString())
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(10);

    const conversationSnapshot = await conversationRef.get();
    const conversationHistory: ConversationMessage[] = [];

    conversationSnapshot.forEach((doc) => {
      conversationHistory.unshift(doc.data() as ConversationMessage);
    });

    // Build context from conversation history
    let contextPrompt = '';
    if (conversationHistory.length > 0) {
      contextPrompt = '\n\nPrevious conversation:\n';
      conversationHistory.forEach((msg) => {
        contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      contextPrompt += '\nCurrent question:\n';
    }

    const fullQuery = contextPrompt + text;

    // Query AskKaya
    const response = await processQuery(
      userData.client_id,
      fullQuery,
      undefined, // userId - we don't have it from telegram link
      undefined  // image - no image support yet
    );

    // Store user message
    await db
      .collection('telegram_conversations')
      .doc(telegramId.toString())
      .collection('messages')
      .add({
        role: 'user',
        content: text,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Store assistant response
    await db
      .collection('telegram_conversations')
      .doc(telegramId.toString())
      .collection('messages')
      .add({
        role: 'assistant',
        content: response.text,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Send response
    let responseText = response.text;

    // Add escalation notice if escalated
    if (response.escalated) {
      responseText +=
        '\n\n⏳ This question has been escalated to Kaya for a personal response. You\'ll get an email when it\'s ready.';
    }

    // Add confidence indicator if low
    if (response.confidence && response.confidence < 0.7) {
      responseText += `\n\n💡 Confidence: ${Math.round(response.confidence * 100)}%`;
    }

    await sendMessage(chatId, responseText, botToken);

    logger.info('Processed Telegram query', {
      telegram_id: telegramId,
      client_id: userData.client_id,
      escalated: response.escalated,
    });
  } catch (error: any) {
    logger.error('Error handling Telegram message', error as Error, {
      telegram_id: telegramId,
    });

    let errorMessage = 'Sorry, something went wrong. Please try again.';

    if (error.message === 'insufficient_credits') {
      errorMessage =
        '❌ Insufficient credits.\n\nPurchase more credits:\n  askkaya credits buy\n\nCheck balance:\n  askkaya credits balance';
    } else if (error.message === 'Client not found') {
      errorMessage =
        '❌ Your account link is invalid. Please re-link:\n  askkaya telegram link';
    }

    await sendMessage(chatId, errorMessage, botToken);
  }
}

/**
 * Handle bot commands
 */
async function handleCommand(
  telegramId: number,
  chatId: number,
  text: string,
  botToken: string,
  db: admin.firestore.Firestore,
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  }
): Promise<void> {
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case '/start':
      await sendMessage(
        chatId,
        '👋 Welcome to AskKaya!\n\nI\'m your AI-powered knowledge assistant. Ask me anything about your setup, and I\'ll search the knowledge base for answers.\n\n🔗 To get started, link your account:\n\n1. Run this command in your terminal:\n   askkaya telegram link\n\n2. Send the code here:\n   /auth YOUR_CODE\n\nNeed help? Try /help',
        botToken
      );
      break;

    case '/help':
      await sendMessage(
        chatId,
        '📚 AskKaya Bot Commands\n\n/start - Welcome message\n/auth <code> - Link your account\n/clear - Clear conversation history\n/status - Check credits and subscription\n/escalations - View escalated questions\n/help - Show this message\n\nJust send me a message to ask a question!',
        botToken
      );
      break;

    case '/auth':
      if (args.length === 0) {
        await sendMessage(
          chatId,
          '❌ Please provide an auth code.\n\nGet your code by running:\n  askkaya telegram link\n\nThen send:\n  /auth YOUR_CODE',
          botToken
        );
        return;
      }

      const code = args[0].toUpperCase();
      await handleAuth(telegramId, chatId, code, botToken, db, from);
      break;

    case '/clear':
      const userDoc = await db
        .collection('telegram_users')
        .doc(telegramId.toString())
        .get();

      if (!userDoc.exists) {
        await sendMessage(
          chatId,
          '❌ Please link your account first:\n  askkaya telegram link',
          botToken
        );
        return;
      }

      // Delete all messages in conversation
      const messagesRef = db
        .collection('telegram_conversations')
        .doc(telegramId.toString())
        .collection('messages');

      const snapshot = await messagesRef.get();
      const batch = db.batch();
      snapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      await sendMessage(
        chatId,
        '✅ Conversation history cleared.\n\nStart fresh - ask me anything!',
        botToken
      );
      break;

    case '/status':
      await handleStatus(telegramId, chatId, botToken, db);
      break;

    case '/escalations':
      await handleEscalations(telegramId, chatId, botToken, db);
      break;

    default:
      await sendMessage(
        chatId,
        '❓ Unknown command. Try /help to see available commands.',
        botToken
      );
  }
}

/**
 * Handle /auth command
 */
async function handleAuth(
  telegramId: number,
  chatId: number,
  code: string,
  botToken: string,
  db: admin.firestore.Firestore,
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  }
): Promise<void> {
  try {
    // Look up auth code
    const authDoc = await db.collection('telegram_auth_codes').doc(code).get();

    if (!authDoc.exists) {
      await sendMessage(
        chatId,
        '❌ Invalid or expired code.\n\nGenerate a new code:\n  askkaya telegram link',
        botToken
      );
      return;
    }

    const authData = authDoc.data();

    // Check expiration (5 minutes)
    const now = admin.firestore.Timestamp.now();
    const expiresAt = authData?.expires_at;
    if (expiresAt && now.toMillis() > expiresAt.toMillis()) {
      await sendMessage(
        chatId,
        '❌ Code expired.\n\nGenerate a new code:\n  askkaya telegram link',
        botToken
      );
      await authDoc.ref.delete();
      return;
    }

    // Check if already used
    if (authData?.used) {
      await sendMessage(
        chatId,
        '❌ Code already used.\n\nGenerate a new code:\n  askkaya telegram link',
        botToken
      );
      return;
    }

    // Link account
    await db
      .collection('telegram_users')
      .doc(telegramId.toString())
      .set({
        telegram_id: telegramId,
        client_id: authData?.client_id,
        id_token: authData?.id_token,
        linked_at: admin.firestore.FieldValue.serverTimestamp(),
        telegram_username: from.username || null,
        telegram_first_name: from.first_name,
      });

    // Mark code as used
    await authDoc.ref.update({
      used: true,
      used_at: admin.firestore.FieldValue.serverTimestamp(),
      telegram_id: telegramId,
    });

    await sendMessage(
      chatId,
      '✅ Account linked successfully!\n\n🎉 You can now ask me questions about your setup.\n\nTry asking something like:\n  "How do I configure OpenClaw?"\n  "What are my recent escalations?"',
      botToken
    );

    logger.info('Telegram account linked', {
      telegram_id: telegramId,
      client_id: authData?.client_id,
    });
  } catch (error) {
    logger.error('Error handling auth', error as Error, { telegram_id: telegramId });
    await sendMessage(
      chatId,
      '❌ Failed to link account. Please try again.',
      botToken
    );
  }
}

/**
 * Handle /status command
 */
async function handleStatus(
  telegramId: number,
  chatId: number,
  botToken: string,
  db: admin.firestore.Firestore
): Promise<void> {
  const userDoc = await db
    .collection('telegram_users')
    .doc(telegramId.toString())
    .get();

  if (!userDoc.exists) {
    await sendMessage(
      chatId,
      '❌ Please link your account first:\n  askkaya telegram link',
      botToken
    );
    return;
  }

  const userData = userDoc.data() as TelegramUser;

  // Get client info
  const clientDoc = await db.collection('clients').doc(userData.client_id).get();

  if (!clientDoc.exists) {
    await sendMessage(chatId, '❌ Account not found.', botToken);
    return;
  }

  const clientData = clientDoc.data();
  const clientType = clientData?.client_type || 'retainer';

  let statusMessage = '📊 Your AskKaya Status\n\n';

  if (clientType === 'retainer') {
    statusMessage += `Type: Retainer (Subscription)\n`;
    statusMessage += `Billing: ${clientData?.billing_status || 'unknown'}\n`;
    statusMessage += `\nUnlimited queries included in your subscription.`;
  } else if (clientType === 'pay_per_query') {
    const credits = clientData?.credits?.balance || 0;
    const kbCost = clientData?.kb_query_cost || 1;
    const humanCost = clientData?.human_query_cost || 5;

    statusMessage += `Type: Pay-per-query\n`;
    statusMessage += `Credits: ${credits}\n\n`;
    statusMessage += `💰 Costs:\n`;
    statusMessage += `  KB Query: ${kbCost} credit${kbCost !== 1 ? 's' : ''}\n`;
    statusMessage += `  Human Answer: ${humanCost} credits\n\n`;

    if (credits < humanCost) {
      statusMessage += `⚠️ Low credits. Purchase more:\n  askkaya credits buy`;
    }
  }

  await sendMessage(chatId, statusMessage, botToken);
}

/**
 * Handle /escalations command
 */
async function handleEscalations(
  telegramId: number,
  chatId: number,
  botToken: string,
  db: admin.firestore.Firestore
): Promise<void> {
  const userDoc = await db
    .collection('telegram_users')
    .doc(telegramId.toString())
    .get();

  if (!userDoc.exists) {
    await sendMessage(
      chatId,
      '❌ Please link your account first:\n  askkaya telegram link',
      botToken
    );
    return;
  }

  const userData = userDoc.data() as TelegramUser;

  // Get escalations
  const escalationsSnapshot = await db
    .collection('escalations')
    .where('client_id', '==', userData.client_id)
    .orderBy('created_at', 'desc')
    .limit(5)
    .get();

  if (escalationsSnapshot.empty) {
    await sendMessage(
      chatId,
      '📭 No escalations yet.\n\nWhen the system can\'t answer with high confidence, Kaya will respond personally.',
      botToken
    );
    return;
  }

  let message = '📋 Your Recent Escalations\n\n';

  escalationsSnapshot.forEach((doc) => {
    const esc = doc.data();
    const index = escalationsSnapshot.docs.indexOf(doc);
    const status =
      esc.status === 'answered'
        ? '✅ Answered'
        : esc.status === 'dismissed'
          ? '❌ Dismissed'
          : '⏳ Pending';

    message += `${index + 1}. ${status}\n`;

    // Truncate question
    let question = esc.query || '';
    if (question.length > 60) {
      question = question.substring(0, 57) + '...';
    }
    message += `   Q: ${question}\n`;

    if (esc.status === 'answered' && esc.answer) {
      let answer = esc.answer;
      if (answer.length > 60) {
        answer = answer.substring(0, 57) + '...';
      }
      message += `   A: ${answer}\n`;
    }

    message += '\n';
  });

  message += 'View full details in the CLI:\n  askkaya escalations';

  await sendMessage(chatId, message, botToken);
}

/**
 * Send a Telegram message
 */
async function sendMessage(
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

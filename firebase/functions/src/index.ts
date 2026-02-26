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
import * as logger from './utils/logger';

// API imports
import { processQuery, healthCheck } from './api/query';
import { authenticateRequest, authenticateUserOnly, type AuthenticatedRequest, type AuthResponse } from './middleware/auth';
import { handleStripeWebhook, linkClientToStripe, createPaymentLink, getOrCreatePaymentLink } from './billing/stripe';
import { verifyWebhookSignature, parseGitHubPush, type GitHubPushPayload } from './processing/webhook';
import { generateEmbedding } from './services/embeddings';
import {
  ingestItem,
  bulkIngest,
  parseGranolaExport,
  parseTelegramExport,
  type IngestItem,
} from './api/ingest';
import {
  validateInviteCode,
  signupWithInvite,
  createInviteCode,
  listInviteCodes,
} from './api/invite';
import { provisionAccount } from './api/provision';
import { handleMcpRequest } from './mcp/transport';
import * as admin from 'firebase-admin';

// Lazy initialize Firebase Admin and Firestore
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Firestore trigger: Send notification when new escalation is created
 */
export const onEscalationCreated = onDocumentCreated(
  'escalations/{escalationId}',
  async (event) => {
    const escalationId = event.params.escalationId;
    const escalationData = event.data?.data();

    if (!escalationData) {
      logger.error('No escalation data in event', undefined, { escalationId });
      return;
    }

    const escalation: Escalation = {
      id: escalationId,
      clientId: escalationData['clientId'] as string,
      clientName: escalationData['clientName'] as string,
      query: escalationData['query'] as string,
      contextTags: (escalationData['contextTags'] as string[]) || [],
      status: (escalationData['status'] as 'pending' | 'answered' | 'closed') || 'pending',
      createdAt: escalationData['createdAt'] as Date,
    };

    logger.info('Processing escalation', {
      escalationId,
      clientId: escalation.clientId,
    });

    try {
      const result = await sendNotification(escalation);
      const channelUsed = result.channel ?? 'unknown';
      logger.logNotification(channelUsed, result.sent, {
        escalationId,
        messageId: result.messageId,
      });
    } catch (error) {
      logger.error('Failed to send notification', error as Error, {
        escalationId,
        clientId: escalation.clientId,
      });
    }
  }
);

/**
 * HTTP endpoint: Telegram webhook receiver
 */
export const telegramWebhook = onRequest({ invoker: 'public' }, async (req, res) => {
  const startTime = Date.now();

  logger.logRequest(req.method, req.path, {
    userAgent: req.headers['user-agent'],
  });

  // Only accept POST requests
  if (req.method !== 'POST') {
    logger.warn('Invalid method for webhook', {
      method: req.method,
      path: req.path,
    });
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const update = req.body as TelegramUpdate;

    if (!update) {
      logger.warn('Invalid request body', {
        hasBody: !!req.body,
      });
      res.status(400).send('Invalid request body');
      return;
    }

    logger.debug('Processing Telegram update', {
      updateId: update.update_id,
      hasMessage: !!update.message,
    });

    const result = await handleTelegramUpdate(update);

    const durationMs = Date.now() - startTime;
    logger.logRequestComplete(req.method, req.path, 200, durationMs, {
      updateId: update.update_id,
    });

    res.status(200).json({
      ok: true,
      result,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Telegram webhook error', error as Error, {
      durationMs,
    });

    logger.logRequestComplete(req.method, req.path, 500, durationMs);

    res.status(500).json({
      ok: false,
      error: (error as Error).message,
    });
  }
});

/**
 * HTTP endpoint: Query API
 * Authenticated endpoint for processing client queries
 */
export const queryApi = onRequest({ invoker: 'public' }, async (req, res) => {
  const startTime = Date.now();

  logger.logRequest(req.method, req.path, {
    clientId: req.headers['x-client-id'],
  });

  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Run authentication middleware
  const authReq = req as unknown as AuthenticatedRequest;
  const authRes = res as unknown as AuthResponse;

  await authenticateRequest(authReq, authRes, async () => {
    try {
      const { question, image } = req.body as {
        question?: string;
        image?: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' };
      };
      const clientId = req.headers['x-client-id'] as string;
      // Get userId from authenticated user for personal KB access
      const userId = authReq.user?.uid;

      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'Missing or invalid question' });
        return;
      }

      // Validate image if provided
      if (image) {
        if (!image.data || !image.mediaType) {
          res.status(400).json({ error: 'Image must include data (base64) and mediaType' });
          return;
        }
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(image.mediaType)) {
          res.status(400).json({ error: 'Invalid image mediaType. Supported: jpeg, png, gif, webp' });
          return;
        }
      }

      const response = await processQuery(clientId, question, userId, image);

      const durationMs = Date.now() - startTime;
      logger.logRequestComplete(req.method, req.path, 200, durationMs, {
        clientId,
        escalated: response.escalated,
      });

      res.status(200).json(response);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error as Error;

      if (err.message === 'rate_limit_exceeded') {
        logger.logRequestComplete(req.method, req.path, 429, durationMs);
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      if (err.message === 'billing_pending') {
        logger.logRequestComplete(req.method, req.path, 402, durationMs);
        res.status(402).json({
          error: 'billing_pending',
          message: 'Payment required. Please complete your subscription setup.',
        });
        return;
      }

      if (err.message === 'billing_suspended') {
        logger.logRequestComplete(req.method, req.path, 403, durationMs);
        res.status(403).json({ error: 'billing_suspended', message: 'Subscription inactive' });
        return;
      }

      if (err.message === 'api_key_required') {
        logger.logRequestComplete(req.method, req.path, 403, durationMs);
        res.status(403).json({
          error: 'api_key_required',
          message: 'Anthropic API key required. Set your API key with: askkaya config set-api-key YOUR_KEY',
        });
        return;
      }

      logger.error('Query API error', err, { durationMs });
      logger.logRequestComplete(req.method, req.path, 500, durationMs);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

/**
 * HTTP endpoint: Get current user info
 * Returns the authenticated user's profile including their client ID
 */
export const meApi = onRequest({ invoker: 'public' }, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate the request (user only, no client ID required)
  const authReq = req as unknown as AuthenticatedRequest;
  const authRes = res as unknown as AuthResponse;

  await authenticateUserOnly(authReq, authRes, async () => {
    try {
      const user = authReq.user;
      if (!user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const db = getDb();

      // Look up user's client association
      // First check if user has a direct client mapping
      const userDoc = await db.collection('users').doc(user.uid).get();
      let clientId: string | null = null;
      let clientName: string | null = null;

      if (userDoc.exists) {
        const userData = userDoc.data();
        clientId = userData?.client_id || null;
      }

      // If no direct mapping, check if user's email is associated with a client
      if (!clientId && user.email) {
        const clientQuery = await db.collection('clients')
          .where('email', '==', user.email)
          .limit(1)
          .get();

        if (!clientQuery.empty) {
          const clientDoc = clientQuery.docs[0];
          clientId = clientDoc.id;
          clientName = clientDoc.data().name || null;

          // Store the mapping for future lookups
          await db.collection('users').doc(user.uid).set({
            client_id: clientId,
            email: user.email,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }

      // If still no client, create a default personal client for the user
      if (!clientId) {
        const newClientRef = await db.collection('clients').add({
          name: user.email?.split('@')[0] || 'Personal',
          email: user.email,
          billing_status: 'active',
          setup_context: ['general'],
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        clientId = newClientRef.id;
        clientName = user.email?.split('@')[0] || 'Personal';

        // Store the mapping
        await db.collection('users').doc(user.uid).set({
          client_id: clientId,
          email: user.email,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // Get client name if we don't have it yet
      if (!clientName && clientId) {
        const clientDoc = await db.collection('clients').doc(clientId).get();
        clientName = clientDoc.data()?.name || null;
      }

      // Determine user role
      const userData = userDoc.exists ? userDoc.data() : null;
      const isAdmin = userData?.is_admin === true;
      const role = isAdmin ? 'admin' : 'client';

      // Get billing status
      let billingStatus = 'active';
      if (clientId) {
        const clientDoc = await db.collection('clients').doc(clientId).get();
        billingStatus = clientDoc.data()?.billing_status || 'active';
      }

      res.status(200).json({
        user_id: user.uid,
        email: user.email,
        client_id: clientId,
        client_name: clientName,
        role: role,
        billing_status: billingStatus,
      });
    } catch (error) {
      logger.error('meApi error', error as Error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

/**
 * HTTP endpoint: Signup with invite code
 * Creates a new user account if invite code is valid
 */
export const signupApi = onRequest({ invoker: 'public' }, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { invite_code, email, password } = req.body as {
      invite_code?: string;
      email?: string;
      password?: string;
    };

    if (!invite_code || !email || !password) {
      res.status(400).json({
        error: 'Missing required fields',
        required: ['invite_code', 'email', 'password'],
      });
      return;
    }

    const result = await signupWithInvite(invite_code, email, password);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Generate Stripe payment link for the new user
    const priceId = process.env['STRIPE_DEFAULT_PRICE_ID'];
    let paymentUrl: string | undefined;

    if (priceId && result.client_id) {
      try {
        const paymentResult = await createPaymentLink(
          result.client_id,
          email,
          email.split('@')[0], // name from email
          priceId,
          'https://askkaya.com/success?client_id=' + result.client_id,
          'https://askkaya.com/cancel'
        );
        if (paymentResult.success && paymentResult.url) {
          paymentUrl = paymentResult.url;
        }
      } catch (err) {
        logger.warn('Failed to create payment link during signup', { error: (err as Error).message });
        // Don't fail signup if payment link fails - they can get it later
      }
    }

    res.status(201).json({
      success: true,
      user_id: result.user_id,
      client_id: result.client_id,
      payment_url: paymentUrl,
      message: paymentUrl
        ? 'Account created! Complete payment to activate your subscription.'
        : 'Account created successfully. Contact support to set up billing.',
    });
  } catch (error) {
    logger.error('Signup error', error as Error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * HTTP endpoint: Validate invite code
 * Check if an invite code is valid without using it
 */
export const validateInviteApi = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: 'Missing invite code' });
    return;
  }

  const result = await validateInviteCode(code);
  res.status(200).json(result);
});

/**
 * HTTP endpoint: Generate invite codes (admin only)
 * Requires authentication
 */
export const generateInviteApi = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const authReq = req as unknown as AuthenticatedRequest;
  const authRes = res as unknown as AuthResponse;

  await authenticateUserOnly(authReq, authRes, async () => {
    try {
      const { count = 1, max_uses = 1, expires_in_days, note } = req.body as {
        count?: number;
        max_uses?: number;
        expires_in_days?: number;
        note?: string;
      };

      // Limit batch generation
      const generateCount = Math.min(count, 10);
      const codes: string[] = [];

      for (let i = 0; i < generateCount; i++) {
        const code = await createInviteCode(authReq.user!.uid, {
          maxUses: max_uses,
          expiresInDays: expires_in_days,
          note,
        });
        codes.push(code);
      }

      res.status(201).json({
        success: true,
        codes,
        count: codes.length,
      });
    } catch (error) {
      logger.error('Generate invite error', error as Error);
      res.status(500).json({ error: 'Failed to generate invite codes' });
    }
  });
});

/**
 * HTTP endpoint: Link client to Stripe customer (admin only)
 *
 * POST /linkStripeApi
 * Body: { client_id: string, stripe_customer_id: string }
 */
export const linkStripeApi = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  logger.logRequest(req.method, req.path);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate (admin only)
  await authenticateUserOnly(
    req as AuthenticatedRequest,
    res as unknown as AuthResponse,
    async () => {
      try {
        const { client_id, stripe_customer_id } = req.body;

        if (!client_id || !stripe_customer_id) {
          res.status(400).json({ error: 'client_id and stripe_customer_id are required' });
          return;
        }

        const result = await linkClientToStripe(client_id, stripe_customer_id);

        if (!result.success) {
          res.status(400).json({ success: false, error: result.error });
          return;
        }

        res.status(200).json(result);
      } catch (error) {
        logger.error('Link Stripe error', error as Error);
        res.status(500).json({ error: 'Failed to link client to Stripe' });
      }
    }
  );
});

/**
 * HTTP endpoint: Create Stripe payment link for a client
 *
 * POST /createPaymentLinkApi
 * Body: { client_id: string, price_id: string, success_url?: string, cancel_url?: string }
 */
export const createPaymentLinkApi = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  logger.logRequest(req.method, req.path);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate (admin only)
  await authenticateUserOnly(
    req as AuthenticatedRequest,
    res as unknown as AuthResponse,
    async () => {
      try {
        const {
          client_id,
          price_id,
          success_url = 'https://askkaya.com/success',
          cancel_url = 'https://askkaya.com/cancel',
        } = req.body;

        if (!client_id || !price_id) {
          res.status(400).json({ error: 'client_id and price_id are required' });
          return;
        }

        // Get client details
        const clientDoc = await getDb().collection('clients').doc(client_id).get();
        if (!clientDoc.exists) {
          res.status(404).json({ error: 'Client not found' });
          return;
        }

        const clientData = clientDoc.data()!;
        const result = await createPaymentLink(
          client_id,
          clientData.email || '',
          clientData.name || '',
          price_id,
          success_url,
          cancel_url
        );

        if (!result.success) {
          res.status(400).json({ success: false, error: result.error });
          return;
        }

        res.status(200).json(result);
      } catch (error) {
        logger.error('Create payment link error', error as Error);
        res.status(500).json({ error: 'Failed to create payment link' });
      }
    }
  );
});

/**
 * HTTP endpoint: Set Anthropic API key for client
 * Allows users to set their own API key to avoid using Kaya's credits
 *
 * POST /setApiKeyApi
 * Body: { api_key: string }
 */
export const setApiKeyApi = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  logger.logRequest(req.method, req.path);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate user
  await authenticateUserOnly(
    req as AuthenticatedRequest,
    res as unknown as AuthResponse,
    async () => {
      try {
        const user = (req as AuthenticatedRequest).user;
        if (!user) {
          res.status(401).json({ error: 'Not authenticated' });
          return;
        }

        const { api_key } = req.body;

        if (!api_key || typeof api_key !== 'string') {
          res.status(400).json({ error: 'api_key is required' });
          return;
        }

        // Basic validation - Anthropic keys start with 'sk-ant-'
        if (!api_key.startsWith('sk-ant-')) {
          res.status(400).json({ error: 'Invalid API key format. Anthropic keys start with sk-ant-' });
          return;
        }

        // Get user's client ID
        const userDoc = await getDb().collection('users').doc(user.uid).get();
        const clientId = userDoc.data()?.client_id;

        if (!clientId) {
          res.status(400).json({ error: 'No client associated with this account' });
          return;
        }

        // Update the client record with the API key
        await getDb().collection('clients').doc(clientId).update({
          anthropic_api_key: api_key,
          api_key_updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info('API key updated', { clientId });

        res.status(200).json({
          success: true,
          message: 'API key saved successfully. You can now use AskKaya with your own credits.',
        });
      } catch (error) {
        logger.error('Set API key error', error as Error);
        res.status(500).json({ error: 'Failed to save API key' });
      }
    }
  );
});

/**
 * HTTP endpoint: Provision account for existing customer (admin only)
 * Creates Firebase Auth user and client record without requiring signup flow
 *
 * POST /provisionApi
 * Body: { email: string, name?: string, billing_status?: 'active' | 'pending' }
 */
export const provisionApi = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  logger.logRequest(req.method, req.path);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate (admin only)
  await authenticateUserOnly(
    req as AuthenticatedRequest,
    res as unknown as AuthResponse,
    async () => {
      try {
        // Check if user is admin
        const user = (req as AuthenticatedRequest).user;
        if (!user) {
          res.status(401).json({ error: 'Not authenticated' });
          return;
        }

        const userDoc = await getDb().collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data()?.is_admin !== true) {
          res.status(403).json({ error: 'Admin access required' });
          return;
        }

        const { email, name, billing_status = 'active' } = req.body;

        if (!email || typeof email !== 'string') {
          res.status(400).json({ error: 'Email is required' });
          return;
        }

        const result = await provisionAccount({
          email,
          name,
          billing_status: billing_status as 'active' | 'pending',
        });

        if (!result.success) {
          res.status(400).json({ success: false, error: result.error });
          return;
        }

        res.status(201).json(result);
      } catch (error) {
        logger.error('Provision error', error as Error);
        res.status(500).json({ error: 'Failed to provision account' });
      }
    }
  );
});

/**
 * HTTP endpoint: Billing setup for current user
 * Generates a payment link for the authenticated user's subscription
 *
 * POST /billingSetupApi
 * Body: { client_id?: string } - optional, uses authenticated user's client if not provided
 */
export const billingSetupApi = onRequest({ invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  logger.logRequest(req.method, req.path);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate user
  await authenticateUserOnly(
    req as AuthenticatedRequest,
    res as unknown as AuthResponse,
    async () => {
      try {
        const user = (req as AuthenticatedRequest).user;
        if (!user) {
          res.status(401).json({ error: 'Not authenticated' });
          return;
        }

        // Get client ID from request body or user's profile
        let clientId = req.body?.client_id;

        if (!clientId) {
          // Look up user's client ID
          const userDoc = await getDb().collection('users').doc(user.uid).get();
          clientId = userDoc.data()?.client_id;
        }

        if (!clientId) {
          res.status(400).json({ error: 'No client associated with this account' });
          return;
        }

        // Get client details
        const clientDoc = await getDb().collection('clients').doc(clientId).get();
        if (!clientDoc.exists) {
          res.status(404).json({ error: 'Client not found' });
          return;
        }

        const clientData = clientDoc.data()!;
        const priceId = process.env['STRIPE_DEFAULT_PRICE_ID'];

        if (!priceId) {
          res.status(500).json({ error: 'Payment system not configured' });
          return;
        }

        const result = await createPaymentLink(
          clientId,
          clientData.email || user.email || '',
          clientData.name || '',
          priceId,
          'https://askkaya.com/success?client_id=' + clientId,
          'https://askkaya.com/cancel'
        );

        if (!result.success) {
          res.status(400).json({ success: false, error: result.error });
          return;
        }

        res.status(200).json(result);
      } catch (error) {
        logger.error('Billing setup error', error as Error);
        res.status(500).json({ error: 'Failed to generate payment link' });
      }
    }
  );
});

/**
 * HTTP endpoint: Health check
 */
export const healthApi = onRequest({ invoker: 'public' }, (req, res) => {
  logger.logRequest(req.method, req.path);

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const health = healthCheck();
  res.status(200).json(health);
});

/**
 * HTTP endpoint: Stripe webhook receiver
 */
export const stripeWebhook = onRequest({ invoker: 'public' }, async (req, res) => {
  const startTime = Date.now();

  logger.logRequest(req.method, req.path, {
    hasSignature: !!req.headers['stripe-signature'],
  });

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // Get raw body - Firebase Functions v2 provides rawBody
    const rawBody = (req as { rawBody?: Buffer }).rawBody ?? req.body;

    const result = await handleStripeWebhook({
      body: rawBody,
      headers: req.headers as { [key: string]: string | undefined },
    });

    const durationMs = Date.now() - startTime;
    logger.logRequestComplete(req.method, req.path, 200, durationMs);

    res.status(200).json(result);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Stripe webhook error', error as Error, { durationMs });
    logger.logRequestComplete(req.method, req.path, 400, durationMs);

    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

/**
 * HTTP endpoint: KB Ingestion API
 * Accepts content from various sources (Granola, Telegram, manual, etc.)
 *
 * POST /ingestApi
 * Body: { items: IngestItem[] } or { source: 'granola'|'telegram', data: ... }
 */
export const ingestApi = onRequest({ invoker: 'public' }, async (req, res) => {
  const startTime = Date.now();

  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  logger.logRequest(req.method, req.path, {
    source: req.body?.source,
    itemCount: req.body?.items?.length,
  });

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // Optional: Authenticate request (can be made mandatory)
    // const authHeader = req.headers.authorization;
    // if (authHeader) { /* verify token */ }

    const body = req.body;
    let items: IngestItem[] = [];

    // Handle different input formats
    if (body.items && Array.isArray(body.items)) {
      // Direct items array
      items = body.items;
    } else if (body.source === 'granola' && body.data) {
      // Granola export format
      items = parseGranolaExport(body.data);
    } else if (body.source === 'telegram' && body.data) {
      // Telegram export format
      items = parseTelegramExport(body.data);
    } else if (body.content) {
      // Single item
      items = [body as IngestItem];
    } else {
      res.status(400).json({
        error: 'Invalid request format',
        expected: 'items array, source+data, or single item with content',
      });
      return;
    }

    if (items.length === 0) {
      res.status(400).json({ error: 'No items to ingest' });
      return;
    }

    // Perform bulk ingestion
    const result = await bulkIngest(getDb(), items);

    const durationMs = Date.now() - startTime;
    logger.logRequestComplete(req.method, req.path, 200, durationMs, {
      total: result.total,
      created: result.created,
      updated: result.updated,
    });

    res.status(200).json(result);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Ingestion error', error as Error, { durationMs });
    logger.logRequestComplete(req.method, req.path, 500, durationMs);

    res.status(500).json({ error: 'Ingestion failed' });
  }
});

/**
 * HTTP endpoint: GitHub webhook receiver for KB ingestion
 */
export const githubWebhook = onRequest({ invoker: 'public' }, async (req, res) => {
  const startTime = Date.now();

  logger.logRequest(req.method, req.path, {
    event: req.headers['x-github-event'],
  });

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // Verify signature
    const signature = req.headers['x-hub-signature-256'] as string;
    const secret = process.env['GITHUB_WEBHOOK_SECRET'] ?? '';
    const payload = JSON.stringify(req.body);

    if (!verifyWebhookSignature(payload, signature, secret)) {
      logger.warn('Invalid GitHub webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Only process push events
    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      res.status(200).json({ message: 'Event ignored', event });
      return;
    }

    // Parse push payload
    const pushPayload = req.body as GitHubPushPayload;
    const filesToProcess = parseGitHubPush(pushPayload);

    logger.info('Processing GitHub push', {
      repo: pushPayload.repository.full_name,
      filesCount: filesToProcess.length,
    });

    // Queue files for processing (create Firestore documents)
    const batch = getDb().batch();
    for (const file of filesToProcess) {
      const docRef = getDb().collection('kb_processing_queue').doc();
      batch.set(docRef, {
        path: file.path,
        target: file.target,
        repository: pushPayload.repository.full_name,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    const durationMs = Date.now() - startTime;
    logger.logRequestComplete(req.method, req.path, 200, durationMs, {
      filesQueued: filesToProcess.length,
    });

    res.status(200).json({
      received: true,
      filesQueued: filesToProcess.length,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('GitHub webhook error', error as Error, { durationMs });
    logger.logRequestComplete(req.method, req.path, 500, durationMs);

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Firestore trigger: Process queued KB articles
 * Generates embeddings when new articles are queued
 */
export const onKBQueueItemCreated = onDocumentCreated(
  'kb_processing_queue/{itemId}',
  async (event) => {
    const itemId = event.params.itemId;
    const data = event.data?.data();

    if (!data) {
      logger.error('No data in KB queue item', undefined, { itemId });
      return;
    }

    const path = data['path'] as string;
    const target = data['target'] as string | { clientId: string };
    const repository = data['repository'] as string;

    logger.info('Processing KB queue item', {
      itemId,
      path,
      target,
    });

    try {
      // Update status to processing
      await event.data?.ref.update({ status: 'processing' });

      // In a real implementation, we'd fetch the file content from GitHub API
      // For now, we'll create a placeholder article
      const isGlobal = target === 'global';
      const clientId = typeof target === 'object' ? target.clientId : null;

      // Create KB article
      const articleRef = await getDb().collection('kb_articles').add({
        title: path.split('/').pop()?.replace('.md', '') ?? 'Untitled',
        source: 'github',
        source_url: `https://github.com/${repository}/blob/main/${path}`,
        is_global: isGlobal,
        client_id: clientId,
        status: 'pending_embedding',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update queue item with reference
      await event.data?.ref.update({
        status: 'completed',
        articleId: articleRef.id,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('KB article created', {
        itemId,
        articleId: articleRef.id,
      });
    } catch (error) {
      logger.error('KB processing failed', error as Error, { itemId });
      await event.data?.ref.update({
        status: 'failed',
        error: (error as Error).message,
      });
    }
  }
);

/**
 * Firestore trigger: Generate embeddings for KB articles
 * Triggered when articles are created with status 'pending_embedding'
 */
export const onKBArticleCreated = onDocumentCreated(
  'kb_articles/{articleId}',
  async (event) => {
    const articleId = event.params.articleId;
    const data = event.data?.data();

    if (!data) {
      logger.error('No data in KB article', undefined, { articleId });
      return;
    }

    // Only process articles with pending_embedding status
    if (data['status'] !== 'pending_embedding') {
      return;
    }

    const title = data['title'] as string || '';
    const content = data['content'] as string || '';

    logger.info('Generating embedding for KB article', { articleId, title });

    try {
      // Combine title and content for embedding
      const textForEmbedding = `${title}\n\n${content}`;
      const embedding = await generateEmbedding(textForEmbedding);

      // Update article with embedding
      await event.data?.ref.update({
        embedding,
        status: 'active',
        embedding_generated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('Embedding generated for KB article', {
        articleId,
        embeddingDimensions: embedding.length,
      });
    } catch (error) {
      logger.error('Embedding generation failed', error as Error, { articleId });
      await event.data?.ref.update({
        status: 'embedding_failed',
        embedding_error: (error as Error).message,
      });
    }
  }
);

/**
 * HTTP endpoint: MCP Server
 * Model Context Protocol server for AI agents to access AskKaya KB.
 *
 * Supports:
 * - POST: Send JSON-RPC messages
 * - GET: SSE streaming (with session ID)
 * - DELETE: Close session
 *
 * Authentication: Bearer <firebase-id-token>
 *
 * Tools available:
 * - query: Ask questions to the AskKaya knowledge base
 * - status: Check account status
 * - escalations: List recent support escalations
 */
export const mcpServer = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 300, // 5 minute timeout for long-running queries
  },
  async (req, res) => {
    await handleMcpRequest(req, res);
  }
);

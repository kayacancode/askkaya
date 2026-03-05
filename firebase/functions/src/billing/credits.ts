/**
 * Credit Purchase System
 *
 * Handles one-time credit purchases via Stripe Checkout
 */

import Stripe from 'stripe';
import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';

// Lazy initialize
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
      apiVersion: '2026-01-28.clover',
    });
  }
  return _stripe;
}

/**
 * Credit pack configurations
 * Add more tiers as needed
 */
export const CREDIT_PACKS = {
  starter: {
    credits: 50,
    price_usd: 10,
    price_id: process.env['STRIPE_CREDITS_50_PRICE_ID'] || 'price_1T7Qn1EwP9ca9TbJecJQMExj',
  },
  standard: {
    credits: 100,
    price_usd: 18,
    price_id: process.env['STRIPE_CREDITS_100_PRICE_ID'] || 'price_1T7QneEwP9ca9TbJyXx53dbn',
  },
  pro: {
    credits: 250,
    price_usd: 40,
    price_id: process.env['STRIPE_CREDITS_250_PRICE_ID'] || 'price_1T7QoBEwP9ca9TbJRxc3v0ne',
  },
};

export type CreditPackType = keyof typeof CREDIT_PACKS;

/**
 * Create a Stripe Checkout session for credit purchase
 * @param clientId - Client ID purchasing credits
 * @param packType - Which credit pack to purchase
 * @param successUrl - Where to redirect after successful payment
 * @param cancelUrl - Where to redirect if payment is cancelled
 * @returns Checkout session URL
 */
export async function createCreditPurchaseSession(
  clientId: string,
  packType: CreditPackType,
  successUrl: string,
  cancelUrl: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const db = getDb();
  const stripe = getStripe();

  try {
    // Verify client exists
    const clientDoc = await db.collection('clients').doc(clientId).get();
    if (!clientDoc.exists) {
      return { success: false, error: 'Client not found' };
    }

    const clientData = clientDoc.data();
    const clientEmail = clientData?.email;
    const clientName = clientData?.name;

    // Get credit pack details
    const pack = CREDIT_PACKS[packType];
    if (!pack || !pack.price_id) {
      return { success: false, error: 'Invalid credit pack or missing Stripe price ID' };
    }

    // Get or create Stripe customer
    let stripeCustomerId = clientData?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: clientEmail,
        name: clientName,
        metadata: {
          askkaya_client_id: clientId,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer ID
      await db.collection('clients').doc(clientId).update({
        stripe_customer_id: stripeCustomerId,
      });
    }

    // Create checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'payment', // One-time payment, not subscription
      line_items: [
        {
          price: pack.price_id,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        askkaya_client_id: clientId,
        credit_pack: packType,
        credits_amount: pack.credits.toString(),
      },
    });

    logger.info('Created credit purchase session', {
      clientId,
      packType,
      credits: pack.credits,
      sessionId: session.id,
    });

    return { success: true, url: session.url || undefined };
  } catch (error) {
    logger.error('Failed to create credit purchase session', error as Error, {
      clientId,
      packType,
    });
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Handle successful credit purchase from Stripe webhook
 * @param session - Stripe checkout session that completed
 */
export async function handleCreditPurchaseComplete(
  session: Stripe.Checkout.Session
): Promise<void> {
  const db = getDb();

  try {
    const clientId = session.metadata?.askkaya_client_id;
    const creditsAmount = parseInt(session.metadata?.credits_amount || '0');
    const packType = session.metadata?.credit_pack;

    if (!clientId || !creditsAmount) {
      logger.error('Missing metadata in credit purchase session', undefined, {
        sessionId: session.id,
      });
      return;
    }

    // Add credits to client's balance
    await db.collection('clients').doc(clientId).update({
      'credits.balance': admin.firestore.FieldValue.increment(creditsAmount),
      last_credit_purchase: {
        pack: packType,
        credits: creditsAmount,
        amount_paid: session.amount_total ? session.amount_total / 100 : 0,
        currency: session.currency || 'usd',
        purchased_at: admin.firestore.FieldValue.serverTimestamp(),
        stripe_session_id: session.id,
      },
    });

    logger.info('Credits added to client account', {
      clientId,
      creditsAdded: creditsAmount,
      packType,
      sessionId: session.id,
    });

    // TODO: Send confirmation email to user
  } catch (error) {
    logger.error('Failed to add credits after purchase', error as Error, {
      sessionId: session.id,
    });
  }
}

/**
 * Get available credit packs with pricing
 */
export function getAvailableCreditPacks() {
  return Object.entries(CREDIT_PACKS).map(([key, pack]) => ({
    id: key,
    credits: pack.credits,
    price_usd: pack.price_usd,
    price_per_credit: (pack.price_usd / pack.credits).toFixed(2),
  }));
}

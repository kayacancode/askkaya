/**
 * Stripe Webhook Handler
 * 
 * Processes Stripe webhook events and updates Firestore billing status
 */

import Stripe from 'stripe';
import * as admin from 'firebase-admin';

// Lazy initialize Firebase Admin
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

// Lazy initialize Stripe client
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
      apiVersion: '2026-01-28.clover',
    });
  }
  return _stripe;
}

// Request interface for webhook
export interface WebhookRequest {
  body: string | Buffer;
  headers: {
    'stripe-signature'?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Handle incoming Stripe webhook events
 * 
 * @param req - Request object with body and headers
 * @returns Object indicating webhook was received
 */
export async function handleStripeWebhook(
  req: WebhookRequest
): Promise<{ received: boolean }> {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    throw new Error('Missing stripe-signature header');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw error;
  }

  // Process event based on type
  switch (event.type) {
    case 'invoice.paid':
      await handleInvoicePaid(event);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event);
      break;

    default:
      // Ignore unknown event types
      console.log(`Unhandled event type: ${event.type}`);
  }

  return { received: true };
}

/**
 * Handle invoice.paid event
 * Sets client billing_status to 'active'
 */
async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  await updateClientBillingStatus(customerId, 'active');
}

/**
 * Handle invoice.payment_failed event
 * Sets client billing_status to 'suspended' immediately (no grace period)
 */
async function handlePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  await updateClientBillingStatus(customerId, 'suspended');
}

/**
 * Handle customer.subscription.deleted event
 * Sets client billing_status to 'cancelled'
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  await updateClientBillingStatus(customerId, 'cancelled');
}

/**
 * Update client billing status by Stripe customer ID
 * 
 * @param stripeCustomerId - Stripe customer ID
 * @param status - New billing status
 */
async function updateClientBillingStatus(
  stripeCustomerId: string,
  status: 'active' | 'suspended' | 'cancelled'
): Promise<void> {
  try {
    // Find client by stripe_customer_id
    const clientsSnapshot = await getDb()
      .collection('clients')
      .where('stripe_customer_id', '==', stripeCustomerId)
      .get();

    if (clientsSnapshot.empty) {
      console.warn(`No client found with stripe_customer_id: ${stripeCustomerId}`);
      return;
    }

    // Update billing status for all matching clients (should be only one)
    const updatePromises = clientsSnapshot.docs.map((doc) =>
      doc.ref.update({
        billing_status: status,
      })
    );

    await Promise.all(updatePromises);

    console.log(`Updated billing status to ${status} for customer ${stripeCustomerId}`);
  } catch (error) {
    console.error('Failed to update billing status:', error);
    throw error;
  }
}

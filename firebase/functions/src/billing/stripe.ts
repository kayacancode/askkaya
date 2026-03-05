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

    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event);
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
 * Handle checkout.session.completed event
 * For one-time credit purchases (mode = 'payment')
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  // Only handle one-time payments (credit purchases)
  // Subscriptions are handled by invoice.paid
  if (session.mode !== 'payment') {
    return;
  }

  // Check if this is a credit purchase (has credits_amount in metadata)
  if (!session.metadata?.credits_amount) {
    return;
  }

  const { handleCreditPurchaseComplete } = await import('./credits.js');
  await handleCreditPurchaseComplete(session);
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

/**
 * Link an existing client to an existing Stripe customer
 * Also syncs the current subscription status from Stripe
 */
export async function linkClientToStripe(
  clientId: string,
  stripeCustomerId: string
): Promise<{ success: boolean; billing_status: string; error?: string }> {
  const db = getDb();
  const stripe = getStripe();

  // Verify client exists
  const clientDoc = await db.collection('clients').doc(clientId).get();
  if (!clientDoc.exists) {
    return { success: false, billing_status: '', error: 'Client not found' };
  }

  // Verify Stripe customer exists and get subscription status
  let billingStatus = 'active';
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if ((customer as Stripe.DeletedCustomer).deleted) {
      return { success: false, billing_status: '', error: 'Stripe customer has been deleted' };
    }

    // Check subscription status
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      if (sub.status === 'active' || sub.status === 'trialing') {
        billingStatus = 'active';
      } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
        billingStatus = 'suspended';
      } else if (sub.status === 'canceled') {
        billingStatus = 'cancelled';
      }
    }
  } catch (error) {
    console.error('Stripe customer lookup failed:', error);
    return { success: false, billing_status: '', error: 'Invalid Stripe customer ID' };
  }

  // Update client with Stripe customer ID and billing status
  await db.collection('clients').doc(clientId).update({
    stripe_customer_id: stripeCustomerId,
    billing_status: billingStatus,
    stripe_linked_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Linked client ${clientId} to Stripe customer ${stripeCustomerId}`);
  return { success: true, billing_status: billingStatus };
}

/**
 * Create a Stripe Checkout session for a new client subscription
 */
export async function createPaymentLink(
  clientId: string,
  clientEmail: string,
  clientName: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const db = getDb();
  const stripe = getStripe();

  // Verify client exists
  const clientDoc = await db.collection('clients').doc(clientId).get();
  if (!clientDoc.exists) {
    return { success: false, error: 'Client not found' };
  }

  const clientData = clientDoc.data();

  // Check if client already has a Stripe customer
  let stripeCustomerId = clientData?.stripe_customer_id;

  if (!stripeCustomerId) {
    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: clientEmail,
      name: clientName,
      metadata: {
        askkaya_client_id: clientId,
      },
    });
    stripeCustomerId = customer.id;

    // Save Stripe customer ID to client record
    await db.collection('clients').doc(clientId).update({
      stripe_customer_id: stripeCustomerId,
    });
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      askkaya_client_id: clientId,
    },
  });

  return { success: true, url: session.url || undefined };
}

/**
 * Get or create a reusable payment link for a price
 */
export async function getOrCreatePaymentLink(
  priceId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const stripe = getStripe();

  try {
    // Create a payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
    });

    return { success: true, url: paymentLink.url };
  } catch (error) {
    console.error('Failed to create payment link:', error);
    return { success: false, error: (error as Error).message };
  }
}

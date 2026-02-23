/**
 * Stripe Webhook Handler Tests
 * 
 * Tests for Stripe webhook signature verification and event processing
 */

import { handleStripeWebhook } from '../../src/billing/stripe';
import Stripe from 'stripe';
import * as admin from 'firebase-admin';

// Mock Stripe
jest.mock('stripe');

// Mock firebase-admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(),
  };
  
  return {
    firestore: jest.fn(() => mockFirestore),
  };
});

describe('Stripe Webhook Handlers', () => {
  let mockRequest: any;
  let mockFirestore: any;
  let mockStripe: jest.Mocked<Stripe>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Firestore
    mockFirestore = (admin.firestore as jest.Mock)();
    
    // Setup mock Stripe
    mockStripe = {
      webhooks: {
        constructEvent: jest.fn(),
      },
    } as any;
    
    // Mock Stripe constructor
    (Stripe as any).mockImplementation(() => mockStripe);
    
    // Setup mock request
    mockRequest = {
      body: '',
      headers: {
        'stripe-signature': 'test-signature',
      },
    };
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid Stripe webhook signature', async () => {
      const event: Stripe.Event = {
        id: 'evt_test',
        object: 'event',
        type: 'invoice.paid',
        data: {
          object: {
            customer: 'cus_test123',
          } as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const mockDoc = {
        update: jest.fn().mockResolvedValue({}),
      };

      const mockQuery = {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'client123', ref: mockDoc }],
        }),
      };

      const mockCollection = {
        where: jest.fn().mockReturnValue(mockQuery),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      const result = await handleStripeWebhook(mockRequest);

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        mockRequest.body,
        'test-signature',
        expect.any(String)
      );
      expect(result.received).toBe(true);
    });

    it('should reject invalid webhook signature (400)', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(handleStripeWebhook(mockRequest)).rejects.toThrow('Invalid signature');
    });

    it('should reject missing signature header', async () => {
      mockRequest.headers = {};
      
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signature');
      });

      await expect(handleStripeWebhook(mockRequest)).rejects.toThrow();
    });
  });

  describe('invoice.paid Event', () => {
    it('should set billing_status to "active" on invoice.paid', async () => {
      const event: Stripe.Event = {
        id: 'evt_paid',
        object: 'event',
        type: 'invoice.paid',
        data: {
          object: {
            customer: 'cus_active123',
          } as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const mockDoc = {
        update: jest.fn().mockResolvedValue({}),
      };

      const mockQuery = {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'client456', ref: mockDoc }],
        }),
      };

      const mockCollection = {
        where: jest.fn().mockReturnValue(mockQuery),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      const result = await handleStripeWebhook(mockRequest);

      expect(mockCollection.where).toHaveBeenCalledWith('stripe_customer_id', '==', 'cus_active123');
      expect(mockDoc.update).toHaveBeenCalledWith({
        billing_status: 'active',
      });
      expect(result.received).toBe(true);
    });

    it('should lookup client by stripe_customer_id', async () => {
      const event: Stripe.Event = {
        id: 'evt_paid2',
        object: 'event',
        type: 'invoice.paid',
        data: {
          object: {
            customer: 'cus_lookup123',
          } as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const mockDoc = {
        update: jest.fn().mockResolvedValue({}),
      };

      const mockQuery = {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'client789', ref: mockDoc }],
        }),
      };

      const mockCollection = {
        where: jest.fn().mockReturnValue(mockQuery),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      await handleStripeWebhook(mockRequest);

      expect(mockFirestore.collection).toHaveBeenCalledWith('clients');
      expect(mockCollection.where).toHaveBeenCalledWith('stripe_customer_id', '==', 'cus_lookup123');
    });
  });

  describe('invoice.payment_failed Event', () => {
    it('should set billing_status to "suspended" immediately (no grace period)', async () => {
      const event: Stripe.Event = {
        id: 'evt_failed',
        object: 'event',
        type: 'invoice.payment_failed',
        data: {
          object: {
            customer: 'cus_failed123',
          } as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const mockDoc = {
        update: jest.fn().mockResolvedValue({}),
      };

      const mockQuery = {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'client_suspended', ref: mockDoc }],
        }),
      };

      const mockCollection = {
        where: jest.fn().mockReturnValue(mockQuery),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      const result = await handleStripeWebhook(mockRequest);

      expect(mockDoc.update).toHaveBeenCalledWith({
        billing_status: 'suspended',
      });
      expect(result.received).toBe(true);
    });

    it('should suspend immediately without grace period', async () => {
      const event: Stripe.Event = {
        id: 'evt_failed2',
        object: 'event',
        type: 'invoice.payment_failed',
        data: {
          object: {
            customer: 'cus_nograce',
          } as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const mockDoc = {
        update: jest.fn().mockResolvedValue({}),
      };

      const mockQuery = {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'client_immediate', ref: mockDoc }],
        }),
      };

      const mockCollection = {
        where: jest.fn().mockReturnValue(mockQuery),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      await handleStripeWebhook(mockRequest);

      // Verify status is set to suspended, not some intermediate state
      expect(mockDoc.update).toHaveBeenCalledWith({
        billing_status: 'suspended',
      });
    });
  });

  describe('customer.subscription.deleted Event', () => {
    it('should set billing_status to "cancelled" on subscription deletion', async () => {
      const event: Stripe.Event = {
        id: 'evt_deleted',
        object: 'event',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            customer: 'cus_cancelled123',
          } as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const mockDoc = {
        update: jest.fn().mockResolvedValue({}),
      };

      const mockQuery = {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'client_cancelled', ref: mockDoc }],
        }),
      };

      const mockCollection = {
        where: jest.fn().mockReturnValue(mockQuery),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      const result = await handleStripeWebhook(mockRequest);

      expect(mockDoc.update).toHaveBeenCalledWith({
        billing_status: 'cancelled',
      });
      expect(result.received).toBe(true);
    });
  });

  describe('Unknown Event Types', () => {
    it('should ignore unknown event types and return 200', async () => {
      const event: Stripe.Event = {
        id: 'evt_unknown',
        object: 'event',
        type: 'charge.succeeded' as any,
        data: {
          object: {} as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const result = await handleStripeWebhook(mockRequest);

      expect(result.received).toBe(true);
      expect(mockFirestore.collection).not.toHaveBeenCalled();
    });

    it('should handle custom event types gracefully', async () => {
      const event: Stripe.Event = {
        id: 'evt_custom',
        object: 'event',
        type: 'custom.event.type' as any,
        data: {
          object: {} as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const result = await handleStripeWebhook(mockRequest);

      expect(result.received).toBe(true);
    });
  });

  describe('Client Lookup', () => {
    it('should handle missing client gracefully', async () => {
      const event: Stripe.Event = {
        id: 'evt_noclient',
        object: 'event',
        type: 'invoice.paid',
        data: {
          object: {
            customer: 'cus_notfound',
          } as any,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      const mockQuery = {
        get: jest.fn().mockResolvedValue({
          empty: true,
          docs: [],
        }),
      };

      const mockCollection = {
        where: jest.fn().mockReturnValue(mockQuery),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      const result = await handleStripeWebhook(mockRequest);

      // Should still return success even if client not found
      expect(result.received).toBe(true);
    });
  });

  describe('Event Processing', () => {
    it('should process multiple events in sequence', async () => {
      const events = [
        {
          id: 'evt_1',
          type: 'invoice.paid',
          data: { object: { customer: 'cus_1' } },
        },
        {
          id: 'evt_2',
          type: 'invoice.payment_failed',
          data: { object: { customer: 'cus_2' } },
        },
      ];

      for (const event of events) {
        mockStripe.webhooks.constructEvent.mockReturnValue(event as any);

        const mockDoc = {
          update: jest.fn().mockResolvedValue({}),
        };

        const mockQuery = {
          get: jest.fn().mockResolvedValue({
            empty: false,
            docs: [{ id: `client_${event.id}`, ref: mockDoc }],
          }),
        };

        const mockCollection = {
          where: jest.fn().mockReturnValue(mockQuery),
        };

        mockFirestore.collection.mockReturnValue(mockCollection);

        const result = await handleStripeWebhook(mockRequest);
        expect(result.received).toBe(true);
      }
    });
  });
});

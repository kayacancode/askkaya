/**
 * Auth Middleware Tests
 * 
 * Tests for Firebase authentication and authorization middleware
 */

import * as admin from 'firebase-admin';
import { authenticateRequest } from '../../src/middleware/auth';

// Mock firebase-admin
jest.mock('firebase-admin', () => {
  const mockAuth = {
    verifyIdToken: jest.fn(),
  };
  
  const mockFirestore = {
    collection: jest.fn(),
  };
  
  return {
    auth: jest.fn(() => mockAuth),
    firestore: jest.fn(() => mockFirestore),
  };
});

describe('Auth Middleware', () => {
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: jest.Mock;
  let mockAuth: any;
  let mockFirestore: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock request
    mockRequest = {
      headers: {},
      body: {},
    };

    // Setup mock response
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Setup mock next
    mockNext = jest.fn();

    // Get mock instances
    mockAuth = (admin.auth as jest.Mock)();
    mockFirestore = (admin.firestore as jest.Mock)();
  });

  describe('Authorization Header Validation', () => {
    it('should reject requests with no Authorization header (401)', async () => {
      mockRequest.headers = {};

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests with malformed Authorization header (401)', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat',
      };

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid Firebase ID token (401)', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      mockAuth.verifyIdToken.mockRejectedValue(new Error('Token verification failed'));

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('invalid-token');
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Client ID Validation', () => {
    beforeEach(() => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'user123',
        email: 'user@example.com',
      });
    });

    it('should reject requests with missing X-Client-ID header (400)', async () => {
      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Missing X-Client-ID header',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests where client document does not exist (404)', async () => {
      mockRequest.headers['x-client-id'] = 'nonexistent-client';

      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: false,
        }),
      };

      const mockCollection = {
        doc: jest.fn().mockReturnValue(mockDoc),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockFirestore.collection).toHaveBeenCalledWith('clients');
      expect(mockCollection.doc).toHaveBeenCalledWith('nonexistent-client');
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Client not found',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Billing Status Validation', () => {
    beforeEach(() => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
        'x-client-id': 'client123',
      };

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'user123',
        email: 'user@example.com',
      });
    });

    it('should reject requests where billing_status is suspended (403)', async () => {
      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'client123',
            name: 'Test Client',
            billing_status: 'suspended',
          }),
        }),
      };

      const mockCollection = {
        doc: jest.fn().mockReturnValue(mockDoc),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Subscription inactive',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests where billing_status is cancelled (403)', async () => {
      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'client123',
            name: 'Test Client',
            billing_status: 'cancelled',
          }),
        }),
      };

      const mockCollection = {
        doc: jest.fn().mockReturnValue(mockDoc),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Subscription inactive',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Successful Authentication', () => {
    beforeEach(() => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
        'x-client-id': 'client123',
      };

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'user123',
        email: 'user@example.com',
      });
    });

    it('should pass requests with valid token and active billing', async () => {
      const clientData = {
        id: 'client123',
        name: 'Test Client',
        email: 'client@example.com',
        api_key: 'test-api-key',
        billing_status: 'active',
        setup_context: ['saas', 'enterprise'],
        monthly_query_limit: 10000,
        stripe_customer_id: 'cus_123',
      };

      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => clientData,
        }),
      };

      const mockCollection = {
        doc: jest.fn().mockReturnValue(mockDoc),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('valid-token');
      expect(mockFirestore.collection).toHaveBeenCalledWith('clients');
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockRequest.client).toEqual(clientData);
      expect(mockRequest.user).toEqual({
        uid: 'user123',
        email: 'user@example.com',
      });
    });

    it('should attach client to request context', async () => {
      const clientData = {
        id: 'client123',
        name: 'Test Client',
        email: 'client@example.com',
        api_key: 'test-api-key',
        billing_status: 'active',
        setup_context: ['startup', 'b2b'],
        monthly_query_limit: 5000,
      };

      const mockDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => clientData,
        }),
      };

      const mockCollection = {
        doc: jest.fn().mockReturnValue(mockDoc),
      };

      mockFirestore.collection.mockReturnValue(mockCollection);

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      expect(mockRequest.client).toBeDefined();
      expect(mockRequest.client.id).toBe('client123');
      expect(mockRequest.client.name).toBe('Test Client');
      expect(mockRequest.client.billing_status).toBe('active');
      expect(mockRequest.client.setup_context).toEqual(['startup', 'b2b']);
    });
  });

  describe('Usage Recording', () => {
    beforeEach(() => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
        'x-client-id': 'client123',
      };

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'user123',
        email: 'user@example.com',
      });
    });

    it('should record usage by incrementing query count for current month', async () => {
      const clientData = {
        id: 'client123',
        name: 'Test Client',
        billing_status: 'active',
        setup_context: [],
        monthly_query_limit: 1000,
      };

      const mockUsageDoc = {
        set: jest.fn().mockResolvedValue({}),
      };

      const mockUsageCollection = {
        doc: jest.fn().mockReturnValue(mockUsageDoc),
      };

      const mockClientDoc = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => clientData,
        }),
        collection: jest.fn().mockReturnValue(mockUsageCollection),
      };

      const mockClientsCollection = {
        doc: jest.fn().mockReturnValue(mockClientDoc),
      };

      mockFirestore.collection.mockReturnValue(mockClientsCollection);

      await authenticateRequest(mockRequest, mockResponse, mockNext);

      const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM format
      
      expect(mockClientDoc.collection).toHaveBeenCalledWith('usage');
      expect(mockUsageCollection.doc).toHaveBeenCalledWith(currentMonth);
      expect(mockUsageDoc.set).toHaveBeenCalledWith(
        { query_count: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });
});

/**
 * Authentication and Authorization Middleware
 * 
 * Validates Firebase ID tokens, checks client billing status, and records usage
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

// Request interface with user and client data
export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
    'x-client-id'?: string;
    [key: string]: string | undefined;
  };
  body?: any;
  user?: admin.auth.DecodedIdToken;
  client?: any;
}

// Response interface
export interface AuthResponse {
  status: (code: number) => AuthResponse;
  json: (data: any) => AuthResponse;
}

// Next function type
export type NextFunction = () => void;

/**
 * Authenticate incoming requests
 * - Extract and verify Bearer token
 * - Check client billing status (hard cutoff)
 * - Record usage (fire-and-forget)
 */
export async function authenticateRequest(
  req: AuthenticatedRequest,
  res: AuthResponse,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      });
      return;
    }

    // 2. Validate Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format',
      });
      return;
    }

    const token = parts[1]!;

    // 3. Verify Firebase ID token
    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
      req.user = decodedToken;
    } catch (error) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      return;
    }

    // 4. Extract Client ID from header
    const clientId = req.headers['x-client-id'];
    if (!clientId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Missing X-Client-ID header',
      });
      return;
    }

    // 5. Fetch client document from Firestore
    const clientDoc = await db.collection('clients').doc(clientId).get();
    
    if (!clientDoc.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Client not found',
      });
      return;
    }

    const clientData = clientDoc.data();
    
    // 6. Check billing status (hard cutoff - no grace period)
    const billingStatus = clientData?.['billing_status'];
    if (billingStatus !== 'active') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Subscription inactive',
      });
      return;
    }

    // 7. Attach client data to request
    req.client = clientData;

    // 8. Record usage (fire-and-forget)
    // Increment query count for current month
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM format
    db.collection('clients')
      .doc(clientId)
      .collection('usage')
      .doc(currentMonth)
      .set(
        { query_count: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      )
      .catch((error) => {
        console.error('Failed to record usage:', error);
        // Don't block the request on usage recording failure
      });

    // 9. Continue to next middleware/handler
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

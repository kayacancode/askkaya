/**
 * Query Processing API
 * 
 * Handles query requests with RAG, confidence scoring, and escalation
 */

import * as admin from 'firebase-admin';
import { retrieveRelevantArticles, formatRetrievedContext, extractSources } from '../services/rag';
import { generateResponse, type ImageInput } from '../services/generation';
import { getAssignedModel } from '../services/model-config';
import * as logger from '../utils/logger';

export interface QueryRequest {
  question: string;
  image?: {
    data: string;  // base64 encoded
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  };
}

export interface QueryResponse {
  text: string;
  confidence: number;
  sources: string[];
  escalated: boolean;
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per client

/**
 * Check rate limit for a client
 * Returns true if rate limit exceeded
 */
async function checkRateLimit(clientId: string): Promise<boolean> {
  const db = admin.firestore();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  const rateLimitDoc = db.collection('rate_limits').doc(clientId);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitDoc);
      const data = doc.data();
      
      // Clean up old requests outside the window
      const requests = (data?.requests || []).filter(
        (timestamp: number) => timestamp > windowStart
      );
      
      // Check if limit exceeded
      if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return true; // Rate limit exceeded
      }
      
      // Add current request
      requests.push(now);
      
      // Update document
      transaction.set(rateLimitDoc, {
        requests,
        lastRequest: now,
      }, { merge: true });
      
      return false; // Not rate limited
    });
    
    return result;
  } catch (error) {
    logger.error('Rate limit check failed', error as Error, { clientId });
    // On error, allow the request (fail open)
    return false;
  }
}

/**
 * Process a query request
 * Returns response with confidence score and sources
 * Escalates to Kaya if confidence is low
 *
 * @param clientId - Client ID for access control
 * @param question - User's question
 * @param userId - Optional user ID for personal KB access
 * @param image - Optional image for vision queries (screenshots, error messages, etc.)
 */
export async function processQuery(
  clientId: string,
  question: string,
  userId?: string,
  image?: ImageInput
): Promise<QueryResponse> {
  const startTime = Date.now();
  const db = admin.firestore();
  
  logger.logQuery(clientId, question);
  
  // Check rate limit
  const rateLimited = await checkRateLimit(clientId);
  if (rateLimited) {
    logger.warn('Rate limit exceeded', { clientId });
    throw new Error('rate_limit_exceeded');
  }
  
  // Get client configuration
  const clientDoc = await db.collection('clients').doc(clientId).get();
  if (!clientDoc.exists) {
    logger.error('Client not found', undefined, { clientId });
    throw new Error('Client not found');
  }
  
  const clientData = clientDoc.data();
  
  // Check billing status
  const billingStatus = clientData?.billing_status;
  const clientType = clientData?.client_type || 'retainer';  // Default to retainer for existing clients

  // For retainer clients, check billing status
  if (clientType === 'retainer') {
    if (billingStatus === 'pending') {
      logger.warn('Billing pending - payment required', { clientId });
      throw new Error('billing_pending');
    }
    if (billingStatus === 'suspended' || billingStatus === 'cancelled') {
      logger.warn('Billing suspended or cancelled', { clientId, billingStatus });
      throw new Error('billing_suspended');
    }
  }

  // For pay-per-query clients, check credits
  if (clientType === 'pay_per_query') {
    const credits = clientData?.credits?.balance || 0;
    const minCost = clientData?.kb_query_cost || 1;

    if (credits < minCost) {
      logger.warn('Insufficient credits', { clientId, credits, minCost });
      throw new Error('insufficient_credits');
    }
  }
  
  const clientName = clientData?.name || 'Unknown Client';
  const setupContext = clientData?.setup_context || [];

  try {
    // Step 1: Retrieve relevant KB articles using RAG
    // Pass userId for personal KB access control
    const ragResults = await retrieveRelevantArticles(
      question,
      clientId,
      userId,  // For personal article access
      setupContext
    );
    
    logger.debug('RAG retrieval complete', {
      clientId,
      resultsCount: ragResults.length,
      topScore: ragResults[0]?.score || 0,
    });
    
    // Step 2: Format context for LLM
    const context = formatRetrievedContext(ragResults);

    // Step 3: Get user's assigned model (or client/global default)
    const modelConfig = userId ? await getAssignedModel(userId) : undefined;
    if (modelConfig) {
      logger.debug('Using assigned model', {
        clientId,
        userId,
        modelId: modelConfig.id,
        provider: modelConfig.provider,
      });
    }

    // Step 4: Generate response with LLM (with optional image for vision)
    const generation = await generateResponse(question, context, clientName, image, modelConfig);
    
    logger.debug('Response generated', {
      clientId,
      confidence: generation.confidence,
      shouldEscalate: generation.shouldEscalate,
    });

    // Step 5: Handle escalation if needed
    let escalated = false;
    if (generation.shouldEscalate) {
      escalated = true;
      
      // Create escalation ticket
      const escalationRef = await db.collection('escalations').add({
        clientId,
        clientName,
        query: question,
        contextTags: setupContext,
        status: 'pending',
        confidence: generation.confidence,
        reasoning: generation.reasoning,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      logger.logEscalation(escalationRef.id, clientId, {
        confidence: generation.confidence,
      });
    }
    
    const durationMs = Date.now() - startTime;
    logger.logQueryResult(clientId, generation.confidence, escalated, durationMs);

    // Deduct credits for pay-per-query users
    if (clientType === 'pay_per_query') {
      // Determine cost based on whether query was escalated (human-required)
      const cost = escalated
        ? (clientData?.human_query_cost || 5)  // Human-answered query costs more
        : (clientData?.kb_query_cost || 1);    // KB-answered query costs less

      await db.collection('clients').doc(clientId).update({
        'credits.balance': admin.firestore.FieldValue.increment(-cost),
      });

      logger.info('Credits deducted', {
        clientId,
        cost,
        type: escalated ? 'human' : 'kb',
        escalated,
      });
    }

    return {
      text: generation.text,
      confidence: generation.confidence,
      sources: extractSources(ragResults),
      escalated,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Query processing failed', error as Error, {
      clientId,
      durationMs,
    });
    throw error;
  }
}

/**
 * Health check endpoint
 */
export function healthCheck(): { status: string; timestamp: number } {
  return {
    status: 'ok',
    timestamp: Date.now(),
  };
}

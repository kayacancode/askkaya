/**
 * Query Processing API
 * 
 * Handles query requests with RAG, confidence scoring, and escalation
 */

import * as admin from 'firebase-admin';
import { retrieveRelevantArticles, formatRetrievedContext, extractSources } from '../services/rag';
import { generateResponse } from '../services/generation';
import * as logger from '../utils/logger';

export interface QueryRequest {
  question: string;
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
 */
export async function processQuery(
  clientId: string,
  question: string
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
  if (clientData?.billingStatus === 'suspended') {
    logger.warn('Billing suspended', { clientId });
    throw new Error('billing_suspended');
  }
  
  const clientName = clientData?.name || 'Unknown Client';
  const setupContext = clientData?.setup_context || [];
  
  try {
    // Step 1: Retrieve relevant KB articles using RAG
    const ragResults = await retrieveRelevantArticles(
      question,
      clientId,
      setupContext
    );
    
    logger.debug('RAG retrieval complete', {
      clientId,
      resultsCount: ragResults.length,
      topScore: ragResults[0]?.score || 0,
    });
    
    // Step 2: Format context for LLM
    const context = formatRetrievedContext(ragResults);
    
    // Step 3: Generate response with LLM
    const generation = await generateResponse(question, context, clientName);
    
    logger.debug('Response generated', {
      clientId,
      confidence: generation.confidence,
      shouldEscalate: generation.shouldEscalate,
    });
    
    // Step 4: Handle escalation if needed
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

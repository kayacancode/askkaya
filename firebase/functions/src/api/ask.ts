/**
 * Ask API - Primary Query Endpoint for Twins Architecture
 *
 * Handles queries targeted at specific twins with proper tenant isolation.
 *
 * POST /askApi
 * Body: {
 *   target?: string,  // "kaya", "team", "twinId:xxx" (defaults to org twin)
 *   question: string,
 *   image?: { data: string, mediaType: string },
 *   includeTeamContext?: boolean
 * }
 */

import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';
import { resolveTwin, getDefaultTwin, buildResolutionContext, ResolvedTwin } from '../services/twin-resolver';
import { retrieveChunks, formatChunkContext, formatSources } from '../services/rag-v2';
import { generateResponse, type GenerationResult } from '../services/generation';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Request body for ask API
 */
export interface AskRequest {
  target?: string;
  question: string;
  image?: {
    data: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  };
  includeTeamContext?: boolean;
}

/**
 * Response from ask API
 */
export interface AskResponse {
  targetTwin: {
    id: string;
    name: string;
    type: 'person' | 'team' | 'organization';
  };
  answer: string;
  confidence: number;
  sources: Array<{ sourceId: string; title: string; sourceType: string }>;
  escalated: boolean;
  expertiseAreas: string[];
}

/**
 * Error response
 */
export interface AskError {
  error: string;
  code: 'not_found' | 'access_denied' | 'invalid_tenant' | 'missing_context' | 'invalid_request';
  message?: string;
}

/**
 * Process an ask request
 *
 * @param uid - Authenticated user's UID
 * @param tenantId - User's tenant ID
 * @param request - Ask request body
 * @returns Ask response or error
 */
export async function processAsk(
  uid: string,
  tenantId: string,
  request: AskRequest
): Promise<AskResponse | AskError> {
  const db = getDb();

  // Validate request
  if (!request.question || typeof request.question !== 'string') {
    return {
      error: 'Invalid request',
      code: 'invalid_request',
      message: 'question is required',
    };
  }

  // Build resolution context
  const context = await buildResolutionContext(uid, tenantId);
  if (!context) {
    return {
      error: 'User not found in tenant',
      code: 'invalid_tenant',
      message: 'No membership found for this tenant',
    };
  }

  logger.debug('Processing ask request', {
    uid,
    tenantId,
    target: request.target,
    questionLength: request.question.length,
  });

  // Resolve target twin
  let resolvedTwin: ResolvedTwin;

  if (request.target) {
    const result = await resolveTwin(request.target, context);
    if (!result.success || !result.twin) {
      return {
        error: result.error || 'not_found',
        code: result.error || 'not_found',
        message: `Could not resolve target: ${request.target}`,
      };
    }
    resolvedTwin = result.twin;
  } else {
    // Default to organization twin
    const result = await getDefaultTwin(context);
    if (!result.success || !result.twin) {
      return {
        error: 'not_found',
        code: 'not_found',
        message: 'No default organization twin found',
      };
    }
    resolvedTwin = result.twin;
  }

  logger.debug('Twin resolved', {
    twinId: resolvedTwin.twinId,
    twinName: resolvedTwin.name,
    twinType: resolvedTwin.type,
  });

  // Retrieve relevant chunks
  const chunks = await retrieveChunks(
    request.question,
    resolvedTwin,
    context,
    {
      includeTeamContext: request.includeTeamContext,
      expertiseAreas: resolvedTwin.expertiseAreas,
    }
  );

  // Format context for LLM
  const ragContext = formatChunkContext(chunks);

  // Build twin name for generation
  const twinIdentity = `${resolvedTwin.name} (${resolvedTwin.type})`;

  // Generate response using existing generation service
  const llmResponse = await generateResponse(
    request.question,
    ragContext,
    twinIdentity,
    request.image
  );

  // Determine if escalation needed
  const shouldEscalate = llmResponse.shouldEscalate || chunks.length === 0;

  // If escalating, create query record with escalation
  if (shouldEscalate) {
    await createEscalatedQuery(db, {
      tenantId,
      requesterUid: uid,
      targetTwin: resolvedTwin,
      queryText: request.question,
      retrievedChunkIds: chunks.map(c => c.chunkId),
      response: llmResponse,
    });
  } else {
    // Create regular query record
    await createQueryRecord(db, {
      tenantId,
      requesterUid: uid,
      targetTwin: resolvedTwin,
      queryText: request.question,
      retrievedChunkIds: chunks.map(c => c.chunkId),
      response: llmResponse,
    });
  }

  // Format sources for response
  const sources = await formatSources(chunks);

  return {
    targetTwin: {
      id: resolvedTwin.twinId,
      name: resolvedTwin.name,
      type: resolvedTwin.type,
    },
    answer: llmResponse.text,
    confidence: llmResponse.confidence,
    sources,
    escalated: shouldEscalate,
    expertiseAreas: resolvedTwin.expertiseAreas,
  };
}

/**
 * Create a query record in Firestore
 */
async function createQueryRecord(
  db: admin.firestore.Firestore,
  data: {
    tenantId: string;
    requesterUid: string;
    targetTwin: ResolvedTwin;
    queryText: string;
    retrievedChunkIds: string[];
    response: { text: string; confidence: number };
  }
): Promise<string> {
  const queryRef = await db.collection('queries').add({
    tenantId: data.tenantId,
    requesterUid: data.requesterUid,
    targetTwinId: data.targetTwin.twinId,
    targetTwinName: data.targetTwin.name,
    queryText: data.queryText,
    retrievedChunkIds: data.retrievedChunkIds,
    response: {
      text: data.response.text,
      confidence: data.response.confidence,
      shouldEscalate: false,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return queryRef.id;
}

/**
 * Create an escalated query record
 */
async function createEscalatedQuery(
  db: admin.firestore.Firestore,
  data: {
    tenantId: string;
    requesterUid: string;
    targetTwin: ResolvedTwin;
    queryText: string;
    retrievedChunkIds: string[];
    response: { text: string; confidence: number };
  }
): Promise<string> {
  const queryRef = await db.collection('queries').add({
    tenantId: data.tenantId,
    requesterUid: data.requesterUid,
    targetTwinId: data.targetTwin.twinId,
    targetTwinName: data.targetTwin.name,
    queryText: data.queryText,
    retrievedChunkIds: data.retrievedChunkIds,
    response: {
      text: data.response.text,
      confidence: data.response.confidence,
      shouldEscalate: true,
    },
    escalation: {
      status: 'pending',
      ...(data.targetTwin.ownerUid ? { twinOwnerUid: data.targetTwin.ownerUid } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('Created escalated query', {
    queryId: queryRef.id,
    targetTwinId: data.targetTwin.twinId,
    ownerUid: data.targetTwin.ownerUid,
  });

  return queryRef.id;
}

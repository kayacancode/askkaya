/**
 * RAG V2 Service - Twin-Scoped Retrieval
 *
 * Retrieves relevant chunks with multi-tenant isolation and twin scoping:
 * - Tenant isolation: chunks filtered by tenantId
 * - Twin targeting: array-contains on twinIds
 * - Visibility: private → team → tenant access control
 * - Defense-in-depth: application filtering + Firestore security rules
 */

import * as admin from 'firebase-admin';
import { generateEmbedding, cosineSimilarity } from './embeddings';
import { ResolvedTwin, ResolutionContext } from './twin-resolver';
import * as logger from '../utils/logger';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

// RAG Configuration
const SIMILARITY_THRESHOLD = 0.05; // Lowered for debugging - chunks have short content
const TOP_K = 5;
const TWIN_BOOST = 0.15;      // 15% boost for direct twin matches
const TAG_BOOST = 0.10;       // 10% boost for expertise area matches

/**
 * Retrieved chunk with metadata
 */
export interface ChunkResult {
  chunkId: string;
  sourceId: string;
  content: string;
  score: number;
  boosted: boolean;
  twinIds: string[];
  visibility: 'private' | 'team' | 'tenant';
}

/**
 * RAG retrieval options
 */
export interface RetrievalOptions {
  topK?: number;
  threshold?: number;
  includeTeamContext?: boolean;
  expertiseAreas?: string[];
}

/**
 * Retrieve relevant chunks for a query scoped to a target twin
 *
 * Access control is enforced at multiple levels:
 * 1. Firestore query filters by tenantId
 * 2. Application-level visibility filtering (defense-in-depth)
 * 3. Twin targeting via twinIds array
 *
 * @param query - The user's question
 * @param targetTwin - The resolved target twin to query
 * @param context - User's resolution context (for access control)
 * @param options - Optional retrieval parameters
 * @returns Array of relevant chunks with scores
 */
export async function retrieveChunks(
  query: string,
  targetTwin: ResolvedTwin,
  context: ResolutionContext,
  options: RetrievalOptions = {}
): Promise<ChunkResult[]> {
  const db = getDb();
  const {
    topK = TOP_K,
    threshold = SIMILARITY_THRESHOLD,
    includeTeamContext = false,
    expertiseAreas = [],
  } = options;

  logger.debug('RAG v2 retrieval starting', {
    query: query.substring(0, 50),
    targetTwinId: targetTwin.twinId,
    tenantId: context.tenantId,
    includeTeamContext,
  });

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Build base query - Firestore handles tenantId filtering
  // We use array-contains for twinIds targeting
  let chunksQuery = db
    .collection('chunks')
    .where('tenantId', '==', context.tenantId)
    .where('twinIds', 'array-contains', targetTwin.twinId);

  const chunksSnapshot = await chunksQuery.get();

  logger.debug('Chunks query returned', {
    count: chunksSnapshot.size,
    targetTwinId: targetTwin.twinId,
  });

  const results: ChunkResult[] = [];

  for (const doc of chunksSnapshot.docs) {
    const chunk = doc.data();

    // Skip if no embedding
    if (!chunk.embedding || !Array.isArray(chunk.embedding)) {
      continue;
    }

    // === DEFENSE-IN-DEPTH: Application-level access control ===
    // This supplements Firestore security rules
    const visibility = chunk.visibility as 'private' | 'team' | 'tenant';

    if (!canAccessChunk(chunk, visibility, context)) {
      logger.warn('Chunk failed application-level access check', {
        chunkId: doc.id,
        visibility,
        chunkOwnerUid: chunk.ownerUid,
        chunkTeamId: chunk.teamId,
      });
      continue;
    }

    // Calculate base similarity score
    let score = cosineSimilarity(queryEmbedding, chunk.embedding);

    // Log similarity score with console.log for visibility
    console.log(`CHUNK_SCORE: ${doc.id} = ${score.toFixed(4)} (threshold: ${threshold}) content: "${chunk.content?.substring(0, 40)}"`);

    // Apply twin boost if chunk directly targets this twin
    let boosted = false;
    const chunkTwinIds = chunk.twinIds as string[] || [];
    if (chunkTwinIds.includes(targetTwin.twinId)) {
      score = score * (1 + TWIN_BOOST);
      boosted = true;
    }

    // Apply expertise area boost
    if (expertiseAreas.length > 0 && targetTwin.expertiseAreas.length > 0) {
      const hasMatchingExpertise = expertiseAreas.some(area =>
        targetTwin.expertiseAreas.includes(area)
      );
      if (hasMatchingExpertise) {
        score = score * (1 + TAG_BOOST);
      }
    }

    // Only include if above threshold
    if (score >= threshold) {
      results.push({
        chunkId: doc.id,
        sourceId: chunk.sourceId,
        content: chunk.content,
        score,
        boosted,
        twinIds: chunkTwinIds,
        visibility,
      });
    }
  }

  // Optionally include team context (chunks from other twins in same team)
  if (includeTeamContext && targetTwin.teamId && context.teamIds.includes(targetTwin.teamId)) {
    const teamResults = await retrieveTeamContext(
      db,
      queryEmbedding,
      targetTwin,
      context,
      threshold
    );
    results.push(...teamResults);
  }

  // Sort by score descending and take top K
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, topK);

  logger.debug('RAG v2 retrieval complete', {
    totalCandidates: results.length,
    returnedCount: topResults.length,
    topScore: topResults[0]?.score,
  });

  return topResults;
}

/**
 * Retrieve additional team context chunks
 * Gets chunks from team-visibility sources that aren't directly targeting the twin
 */
async function retrieveTeamContext(
  db: admin.firestore.Firestore,
  queryEmbedding: number[],
  targetTwin: ResolvedTwin,
  context: ResolutionContext,
  threshold: number
): Promise<ChunkResult[]> {
  if (!targetTwin.teamId) {
    return [];
  }

  // Get team-visible chunks that don't already target this twin
  const teamChunksSnapshot = await db
    .collection('chunks')
    .where('tenantId', '==', context.tenantId)
    .where('teamId', '==', targetTwin.teamId)
    .where('visibility', '==', 'team')
    .limit(50) // Limit to prevent excessive reads
    .get();

  const results: ChunkResult[] = [];

  for (const doc of teamChunksSnapshot.docs) {
    const chunk = doc.data();

    // Skip if no embedding or already targets this twin
    if (!chunk.embedding || !Array.isArray(chunk.embedding)) {
      continue;
    }

    const chunkTwinIds = chunk.twinIds as string[] || [];
    if (chunkTwinIds.includes(targetTwin.twinId)) {
      // Already included in main results
      continue;
    }

    // Calculate similarity (no boost for team context)
    const score = cosineSimilarity(queryEmbedding, chunk.embedding);

    if (score >= threshold) {
      results.push({
        chunkId: doc.id,
        sourceId: chunk.sourceId,
        content: chunk.content,
        score: score * 0.9, // Slight penalty for non-direct matches
        boosted: false,
        twinIds: chunkTwinIds,
        visibility: 'team',
      });
    }
  }

  return results;
}

/**
 * Application-level access control check (defense-in-depth)
 */
function canAccessChunk(
  chunk: admin.firestore.DocumentData,
  visibility: 'private' | 'team' | 'tenant',
  context: ResolutionContext
): boolean {
  switch (visibility) {
    case 'tenant':
      // Tenant visibility - any tenant member can access
      // tenantId already filtered in query, so this is always true
      return true;

    case 'team':
      // Team visibility - must be member of chunk's team
      return context.teamIds.includes(chunk.teamId);

    case 'private':
      // Private visibility - must be owner
      return chunk.ownerUid === context.requesterUid;

    default:
      // Unknown visibility - deny access
      logger.warn('Unknown chunk visibility', { visibility });
      return false;
  }
}

/**
 * Format chunk results into context string for LLM generation
 */
export function formatChunkContext(results: ChunkResult[]): string {
  if (results.length === 0) {
    return 'No relevant information found in the knowledge base.';
  }

  let context = 'Relevant information from knowledge base:\n\n';

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    context += `[${i + 1}] ${result.content}\n`;
    context += `(Relevance: ${(result.score * 100).toFixed(1)}%`;
    if (result.boosted) {
      context += ', direct match';
    }
    context += ')\n\n';
  }

  return context;
}

/**
 * Extract source IDs from chunk results for citation
 */
export function extractSourceIds(results: ChunkResult[]): string[] {
  const sourceIds = new Set<string>();
  for (const result of results) {
    sourceIds.add(result.sourceId);
  }
  return Array.from(sourceIds);
}

/**
 * Get source metadata for citation display
 */
export async function getSourceMetadata(
  sourceIds: string[]
): Promise<Map<string, { title: string; sourceType: string }>> {
  const db = getDb();
  const metadata = new Map<string, { title: string; sourceType: string }>();

  // Batch get source documents
  const sourceRefs = sourceIds.map(id => db.collection('sources').doc(id));

  if (sourceRefs.length === 0) {
    return metadata;
  }

  const sourceDocs = await db.getAll(...sourceRefs);

  for (const doc of sourceDocs) {
    if (doc.exists) {
      const data = doc.data()!;
      metadata.set(doc.id, {
        title: data.title || 'Untitled',
        sourceType: data.sourceType || 'unknown',
      });
    }
  }

  return metadata;
}

/**
 * Format sources for display in response
 */
export async function formatSources(
  results: ChunkResult[]
): Promise<Array<{ sourceId: string; title: string; sourceType: string }>> {
  const sourceIds = extractSourceIds(results);
  const metadata = await getSourceMetadata(sourceIds);

  return sourceIds.map(id => {
    const meta = metadata.get(id) || { title: 'Unknown', sourceType: 'unknown' };
    return {
      sourceId: id,
      title: meta.title,
      sourceType: meta.sourceType,
    };
  });
}

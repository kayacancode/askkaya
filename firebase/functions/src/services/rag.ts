/**
 * RAG (Retrieval-Augmented Generation) Service
 * 
 * Retrieves relevant knowledge base articles and ranks them with client-specific boosting
 */

import * as admin from 'firebase-admin';
import { generateEmbedding, cosineSimilarity } from './embeddings';

// RAG Configuration Parameters
const SIMILARITY_THRESHOLD = 0.3;  // Minimum similarity score to include result
const TOP_K = 5;                   // Number of top results to return
const CLIENT_BOOST = 0.30;         // 30% boost for client-specific documents

export interface KBArticle {
  id: string;
  title: string;
  content: string;
  embedding: number[];
  clientId?: string;  // If set, article is client-specific
  tags: string[];
  createdAt: admin.firestore.Timestamp;
}

export interface RAGResult {
  article: KBArticle;
  score: number;
  boosted: boolean;
}

/**
 * Retrieve relevant KB articles for a query
 * 
 * @param query - The user's question
 * @param clientId - Client ID for boosting client-specific articles
 * @param contextTags - Additional context tags to filter by
 * @returns Array of relevant articles with scores
 */
export async function retrieveRelevantArticles(
  query: string,
  clientId: string,
  contextTags: string[] = []
): Promise<RAGResult[]> {
  const db = admin.firestore();
  
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  
  // Fetch all KB articles (in production, use vector database)
  // For now, we'll fetch all and filter in memory
  const articlesSnapshot = await db.collection('kb_articles').get();
  
  const results: RAGResult[] = [];
  
  for (const doc of articlesSnapshot.docs) {
    const article = doc.data() as Omit<KBArticle, 'id'>;
    const fullArticle: KBArticle = {
      id: doc.id,
      ...article,
    };
    
    // Skip if no embedding
    if (!article.embedding) {
      continue;
    }
    
    // Calculate base similarity score
    let score = cosineSimilarity(queryEmbedding, article.embedding);
    
    // Apply client boost if article is client-specific
    let boosted = false;
    if (article.clientId === clientId) {
      score = score * (1 + CLIENT_BOOST);
      boosted = true;
    }
    
    // Apply context tag filtering (articles matching context get slight boost)
    if (contextTags.length > 0 && article.tags) {
      const hasMatchingTag = article.tags.some(tag => contextTags.includes(tag));
      if (hasMatchingTag) {
        score = score * 1.1;  // 10% boost for matching tags
      }
    }
    
    // Only include if above threshold
    if (score >= SIMILARITY_THRESHOLD) {
      results.push({
        article: fullArticle,
        score,
        boosted,
      });
    }
  }
  
  // Sort by score descending and take top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, TOP_K);
}

/**
 * Format RAG results into a context string for LLM generation
 */
export function formatRetrievedContext(results: RAGResult[]): string {
  if (results.length === 0) {
    return 'No relevant information found in the knowledge base.';
  }
  
  let context = 'Relevant information from knowledge base:\n\n';
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    context += `[${i + 1}] ${result.article.title}\n`;
    context += `${result.article.content}\n`;
    context += `(Relevance: ${(result.score * 100).toFixed(1)}%)\n\n`;
  }
  
  return context;
}

/**
 * Extract source references from RAG results
 */
export function extractSources(results: RAGResult[]): string[] {
  return results.map(r => r.article.id);
}

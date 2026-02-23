/**
 * Embeddings Service
 * 
 * Generates text embeddings using OpenAI's text-embedding-3-small model
 */

import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';

// Lazy-initialize OpenAI client to allow env vars to load first
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
      baseURL: process.env['OPENAI_BASE_URL'],
    });
  }
  return _openai;
}
const MAX_RETRIES = 1;

/**
 * Generate embedding for a single text string
 * Retries once on failure
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getOpenAI().embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });
      
      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI');
      }
      
      return embedding;
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error('Failed to generate embedding');
}

/**
 * Generate embeddings for multiple text strings in batch
 * More efficient than calling generateEmbedding multiple times
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getOpenAI().embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });
      
      return response.data.map(item => item.embedding);
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error('Failed to generate embeddings');
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between -1 (opposite) and 1 (identical)
 * Throws error if vectors have different dimensions or are zero vectors
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error(`Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i]! * vectorB[i]!;
    normA += vectorA[i]! * vectorA[i]!;
    normB += vectorB[i]! * vectorB[i]!;
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    throw new Error('Cannot calculate cosine similarity with zero vector');
  }
  
  return dotProduct / (normA * normB);
}

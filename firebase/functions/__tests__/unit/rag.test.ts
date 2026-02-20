/**
 * RAG Service Tests
 * 
 * Tests for Retrieval-Augmented Generation (RAG) service
 */

import { retrieveContext, RetrievalResult } from '../../src/services/rag';
import * as admin from 'firebase-admin';

// Mock firebase-admin
jest.mock('firebase-admin', () => {
  return {
    firestore: jest.fn(() => ({
      collection: jest.fn(),
    })),
  };
});

// Mock embeddings service
jest.mock('../../src/services/embeddings', () => ({
  cosineSimilarity: jest.fn(),
}));

describe('RAG Service', () => {
  let mockFirestore: any;
  let mockCosineSimilarity: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirestore = (admin.firestore as jest.Mock)();
    mockCosineSimilarity = require('../../src/services/embeddings').cosineSimilarity as jest.Mock;
  });

  describe('retrieveContext', () => {
    const clientId = 'client123';
    const queryEmbedding = new Array(1536).fill(0.1);
    const setupContext = ['saas', 'enterprise'];

    it('should search both global and per-client KB', async () => {
      const mockGlobalArticles = [
        {
          id: 'global1',
          data: () => ({
            title: 'Global Article 1',
            summary: 'Global summary',
            content: 'Global content',
            embedding: new Array(1536).fill(0.2),
            client_context: [],
            source_refs: ['ref1'],
            auto_generated: false,
          }),
        },
      ];

      const mockClientArticles = [
        {
          id: 'client1',
          data: () => ({
            title: 'Client Article 1',
            summary: 'Client summary',
            content: 'Client content',
            embedding: new Array(1536).fill(0.3),
            client_context: ['saas'],
            source_refs: ['ref2'],
            auto_generated: true,
          }),
        },
      ];

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: mockGlobalArticles }),
      };

      const mockClientKB = {
        get: jest.fn().mockResolvedValue({ docs: mockClientArticles }),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB) // global_kb
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) }); // clients -> kb

      mockCosineSimilarity.mockReturnValue(0.8);

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      expect(mockFirestore.collection).toHaveBeenCalledWith('global_kb');
      expect(mockFirestore.collection).toHaveBeenCalledWith('clients');
      expect(results).toBeInstanceOf(Array);
    });

    it('should give per-client articles 30% score boost over global', async () => {
      const globalEmbedding = new Array(1536).fill(0.5);
      const clientEmbedding = new Array(1536).fill(0.5);

      const mockGlobalArticles = [
        {
          id: 'global1',
          data: () => ({
            title: 'Global Article',
            summary: 'Summary',
            content: 'Content',
            embedding: globalEmbedding,
            client_context: [],
            source_refs: [],
            auto_generated: false,
          }),
        },
      ];

      const mockClientArticles = [
        {
          id: 'client1',
          data: () => ({
            title: 'Client Article',
            summary: 'Summary',
            content: 'Content',
            embedding: clientEmbedding,
            client_context: [],
            source_refs: [],
            auto_generated: true,
          }),
        },
      ];

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: mockGlobalArticles }),
      };

      const mockClientKB = {
        get: jest.fn().mockResolvedValue({ docs: mockClientArticles }),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB)
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) });

      // Both have same base similarity
      mockCosineSimilarity.mockReturnValue(0.7);

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      expect(results.length).toBeGreaterThan(0);
      
      const clientResult = results.find(r => r.source === 'client');
      const globalResult = results.find(r => r.source === 'global');

      // Client article should have 30% boost
      if (clientResult && globalResult) {
        expect(clientResult.score).toBeGreaterThan(globalResult.score);
        expect(clientResult.score).toBeCloseTo(0.7 * 1.3, 2);
      }
    });

    it('should give additional weight to articles matching client setup_context tags', async () => {
      const mockArticles = [
        {
          id: 'match1',
          data: () => ({
            title: 'Matching Article',
            summary: 'Summary',
            content: 'Content',
            embedding: new Array(1536).fill(0.5),
            client_context: ['saas', 'enterprise'], // Matches both setup_context tags
            source_refs: [],
            auto_generated: false,
          }),
        },
        {
          id: 'nomatch1',
          data: () => ({
            title: 'Non-Matching Article',
            summary: 'Summary',
            content: 'Content',
            embedding: new Array(1536).fill(0.5),
            client_context: ['other'],
            source_refs: [],
            auto_generated: false,
          }),
        },
      ];

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: mockArticles }),
      };

      const mockClientKB = {
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB)
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) });

      mockCosineSimilarity.mockReturnValue(0.7);

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      expect(results.length).toBeGreaterThan(0);
      
      const matchingResult = results.find(r => r.articleId === 'match1');
      const nonMatchingResult = results.find(r => r.articleId === 'nomatch1');

      // Matching article should have higher score
      if (matchingResult && nonMatchingResult) {
        expect(matchingResult.score).toBeGreaterThan(nonMatchingResult.score);
      }
    });

    it('should return top-K results (K=5) sorted by relevance', async () => {
      const mockArticles = Array.from({ length: 10 }, (_, i) => ({
        id: `article${i}`,
        data: () => ({
          title: `Article ${i}`,
          summary: `Summary ${i}`,
          content: `Content ${i}`,
          embedding: new Array(1536).fill(i * 0.1),
          client_context: [],
          source_refs: [],
          auto_generated: false,
        }),
      }));

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: mockArticles }),
      };

      const mockClientKB = {
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB)
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) });

      // Return descending similarities
      mockCosineSimilarity.mockImplementation((a: number[], b: number[]) => {
        return 0.9 - b[0]!; // Higher for earlier articles
      });

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      expect(results.length).toBeLessThanOrEqual(5);
      
      // Check if sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it('should return empty array when no articles above threshold (0.3)', async () => {
      const mockArticles = [
        {
          id: 'low1',
          data: () => ({
            title: 'Low Relevance Article',
            summary: 'Summary',
            content: 'Content',
            embedding: new Array(1536).fill(0.1),
            client_context: [],
            source_refs: [],
            auto_generated: false,
          }),
        },
      ];

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: mockArticles }),
      };

      const mockClientKB = {
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB)
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) });

      // Return low similarity
      mockCosineSimilarity.mockReturnValue(0.2);

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle missing client KB gracefully', async () => {
      const mockGlobalArticles = [
        {
          id: 'global1',
          data: () => ({
            title: 'Global Article',
            summary: 'Summary',
            content: 'Content',
            embedding: new Array(1536).fill(0.5),
            client_context: [],
            source_refs: [],
            auto_generated: false,
          }),
        },
      ];

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: mockGlobalArticles }),
      };

      const mockClientKB = {
        get: jest.fn().mockRejectedValue(new Error('Collection not found')),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB)
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) });

      mockCosineSimilarity.mockReturnValue(0.8);

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      // Should still return global results
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.source).toBe('global');
    });

    it('should handle empty global KB', async () => {
      const mockClientArticles = [
        {
          id: 'client1',
          data: () => ({
            title: 'Client Article',
            summary: 'Summary',
            content: 'Content',
            embedding: new Array(1536).fill(0.5),
            client_context: [],
            source_refs: [],
            auto_generated: true,
          }),
        },
      ];

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      const mockClientKB = {
        get: jest.fn().mockResolvedValue({ docs: mockClientArticles }),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB)
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) });

      mockCosineSimilarity.mockReturnValue(0.8);

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.source).toBe('client');
    });

    it('should return correct RetrievalResult structure', async () => {
      const mockArticles = [
        {
          id: 'article1',
          data: () => ({
            title: 'Test Article',
            summary: 'Test Summary',
            content: 'Test Content',
            embedding: new Array(1536).fill(0.5),
            client_context: ['saas'],
            source_refs: ['ref1', 'ref2'],
            auto_generated: false,
          }),
        },
      ];

      const mockGlobalKB = {
        get: jest.fn().mockResolvedValue({ docs: mockArticles }),
      };

      const mockClientKB = {
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      mockFirestore.collection
        .mockReturnValueOnce(mockGlobalKB)
        .mockReturnValueOnce({ collection: jest.fn().mockReturnValue(mockClientKB) });

      mockCosineSimilarity.mockReturnValue(0.85);

      const results = await retrieveContext(clientId, queryEmbedding, setupContext);

      expect(results.length).toBeGreaterThan(0);
      
      const result = results[0]!;
      expect(result).toHaveProperty('articleId');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('source');
      
      expect(result.articleId).toBe('article1');
      expect(result.title).toBe('Test Article');
      expect(result.summary).toBe('Test Summary');
      expect(result.content).toBe('Test Content');
      expect(typeof result.score).toBe('number');
      expect(['global', 'client']).toContain(result.source);
    });
  });
});

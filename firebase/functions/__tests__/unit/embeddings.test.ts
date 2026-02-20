/**
 * Embeddings Service Tests
 * 
 * Tests for text embedding generation using OpenAI
 */

import { 
  generateEmbedding, 
  generateEmbeddings, 
  cosineSimilarity 
} from '../../src/services/embeddings';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: jest.fn(),
      },
    })),
  };
});

describe('Embeddings Service', () => {
  let mockOpenAI: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const OpenAI = require('openai').default;
    mockOpenAI = new OpenAI();
  });

  describe('generateEmbedding', () => {
    it('should return a number array for valid text', async () => {
      const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());
      
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 10, total_tokens: 10 },
      });

      const result = await generateEmbedding('Hello world');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1536);
      expect(typeof result[0]).toBe('number');
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Hello world',
      });
    });

    it('should handle empty text input gracefully', async () => {
      const mockEmbedding = new Array(1536).fill(0);
      
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 0, total_tokens: 0 },
      });

      const result = await generateEmbedding('');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1536);
    });

    it('should handle API errors with retry mechanism', async () => {
      // First call fails
      mockOpenAI.embeddings.create
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        // Second call succeeds
        .mockResolvedValueOnce({
          data: [{ embedding: new Array(1536).fill(0.5) }],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 10, total_tokens: 10 },
        });

      const result = await generateEmbedding('Retry test');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1536);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(2);
    });

    it('should throw after 1 retry attempt', async () => {
      mockOpenAI.embeddings.create
        .mockRejectedValueOnce(new Error('API error 1'))
        .mockRejectedValueOnce(new Error('API error 2'));

      await expect(generateEmbedding('Fail test')).rejects.toThrow();
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(2);
    });

    it('should normalize long text inputs', async () => {
      const longText = 'word '.repeat(10000); // Very long text
      const mockEmbedding = new Array(1536).fill(0.3);
      
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 100, total_tokens: 100 },
      });

      const result = await generateEmbedding(longText);

      expect(result).toBeInstanceOf(Array);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalled();
    });
  });

  describe('generateEmbeddings', () => {
    it('should return array of vectors for batch input', async () => {
      const texts = ['Hello', 'World', 'Test'];
      const mockEmbeddings = texts.map(() => 
        new Array(1536).fill(0).map(() => Math.random())
      );
      
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: mockEmbeddings.map(embedding => ({ embedding })),
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 30, total_tokens: 30 },
      });

      const result = await generateEmbeddings(texts);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(3);
      expect(result[0]).toBeInstanceOf(Array);
      expect(result[0]?.length).toBe(1536);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: texts,
      });
    });

    it('should handle empty array input', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 0, total_tokens: 0 },
      });

      const result = await generateEmbeddings([]);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(0);
    });

    it('should handle single item array', async () => {
      const mockEmbedding = new Array(1536).fill(0.7);
      
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      });

      const result = await generateEmbeddings(['Single']);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0]?.length).toBe(1536);
    });

    it('should handle API errors with retry for batch', async () => {
      const texts = ['One', 'Two'];
      const mockEmbeddings = texts.map(() => new Array(1536).fill(0.5));
      
      mockOpenAI.embeddings.create
        .mockRejectedValueOnce(new Error('Batch API error'))
        .mockResolvedValueOnce({
          data: mockEmbeddings.map(embedding => ({ embedding })),
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 20, total_tokens: 20 },
        });

      const result = await generateEmbeddings(texts);

      expect(result.length).toBe(2);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(2);
    });

    it('should process large batches efficiently', async () => {
      const texts = Array.from({ length: 100 }, (_, i) => `Text ${i}`);
      const mockEmbeddings = texts.map(() => new Array(1536).fill(0.1));
      
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: mockEmbeddings.map(embedding => ({ embedding })),
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 1000, total_tokens: 1000 },
      });

      const result = await generateEmbeddings(texts);

      expect(result.length).toBe(100);
      expect(result[0]?.length).toBe(1536);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vectorA = [1, 2, 3, 4, 5];
      const vectorB = [1, 2, 3, 4, 5];

      const similarity = cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const vectorA = [1, 0, 0];
      const vectorB = [0, 1, 0];

      const similarity = cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should return -1.0 for opposite vectors', () => {
      const vectorA = [1, 2, 3];
      const vectorB = [-1, -2, -3];

      const similarity = cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should calculate correct similarity for arbitrary vectors', () => {
      const vectorA = [1, 2, 3];
      const vectorB = [4, 5, 6];

      const similarity = cosineSimilarity(vectorA, vectorB);

      // Expected: (1*4 + 2*5 + 3*6) / (sqrt(1+4+9) * sqrt(16+25+36))
      // = 32 / (sqrt(14) * sqrt(77))
      const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));

      expect(similarity).toBeCloseTo(expected, 5);
    });

    it('should handle normalized vectors', () => {
      const vectorA = [0.6, 0.8, 0.0];
      const vectorB = [0.8, 0.6, 0.0];

      const similarity = cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should handle high-dimensional vectors', () => {
      const dim = 1536;
      const vectorA = new Array(dim).fill(0).map(() => Math.random());
      const vectorB = new Array(dim).fill(0).map(() => Math.random());

      const similarity = cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should throw error for vectors of different dimensions', () => {
      const vectorA = [1, 2, 3];
      const vectorB = [1, 2, 3, 4];

      expect(() => cosineSimilarity(vectorA, vectorB)).toThrow();
    });

    it('should handle zero vectors gracefully', () => {
      const vectorA = [0, 0, 0];
      const vectorB = [1, 2, 3];

      expect(() => cosineSimilarity(vectorA, vectorB)).toThrow();
    });

    it('should be symmetric', () => {
      const vectorA = [1, 2, 3, 4];
      const vectorB = [5, 6, 7, 8];

      const simAB = cosineSimilarity(vectorA, vectorB);
      const simBA = cosineSimilarity(vectorB, vectorA);

      expect(simAB).toBeCloseTo(simBA, 10);
    });
  });
});

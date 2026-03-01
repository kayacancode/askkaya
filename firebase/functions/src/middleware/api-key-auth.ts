/**
 * API Key Authentication Middleware
 *
 * Validates sk-kaya-* keys and attaches user info to requests.
 * Uses an in-memory cache with 30-second TTL for performance.
 *
 * Ported from: github.com/2389-research/platform-2389
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import * as logger from '../utils/logger';
import { verifyAPIKey } from '../services/api-keys';

/**
 * Hash an API key for use as a cache key
 * This prevents exposure of raw API keys in memory dumps
 */
function hashKeyForCache(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Simple in-memory cache for API key verification results
// TTL: 30 seconds to balance performance with quick revocation
interface CacheEntry {
  uid: string;
  email: string | undefined;
  expiresAt: number;
}

const apiKeyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30000; // 30 seconds

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of apiKeyCache.entries()) {
    if (entry.expiresAt < now) {
      apiKeyCache.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Invalidate all cached API keys for a user
 * Call this when revoking a key to ensure immediate effect
 */
export function invalidateCacheForUser(uid: string): void {
  for (const [key, entry] of apiKeyCache.entries()) {
    if (entry.uid === uid) {
      apiKeyCache.delete(key);
    }
  }
}

/**
 * OpenAI-style error response format
 */
interface LLMErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * Middleware that authenticates requests using API keys (sk-kaya-*)
 * For use on /v1/* routes that require programmatic access
 */
export async function apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('API key auth failed: no authorization header', {});
    const errorResponse: LLMErrorResponse = {
      error: {
        message: 'Missing Authorization header',
        type: 'invalid_request_error',
        code: 'missing_api_key',
      },
    };
    res.status(401).json(errorResponse);
    return;
  }

  // Support both "Bearer sk-kaya-..." and just "sk-kaya-..."
  let apiKey: string;
  if (authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  } else if (authHeader.startsWith('sk-kaya-')) {
    apiKey = authHeader;
  } else {
    logger.warn('API key auth failed: invalid format', {});
    const errorResponse: LLMErrorResponse = {
      error: {
        message: "Invalid API key format. Expected 'Bearer sk-kaya-...' or 'sk-kaya-...'",
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    };
    res.status(401).json(errorResponse);
    return;
  }

  // Check format
  if (!apiKey.startsWith('sk-kaya-')) {
    logger.warn('API key auth failed: wrong prefix', {});
    const errorResponse: LLMErrorResponse = {
      error: {
        message: 'Invalid API key format',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    };
    res.status(401).json(errorResponse);
    return;
  }

  // Check cache first (use hashed key for security)
  const cacheKey = hashKeyForCache(apiKey);
  const cached = apiKeyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    (req as any).user = {
      uid: cached.uid,
      email: cached.email,
    };
    logger.debug('API key authenticated from cache', { uid: cached.uid });
    next();
    return;
  }

  // Verify API key
  try {
    const result = await verifyAPIKey(apiKey);

    if (!result.valid) {
      logger.warn('API key verification failed', { error: result.error });
      const errorResponse: LLMErrorResponse = {
        error: {
          message: result.error || 'Invalid API key',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      };
      res.status(401).json(errorResponse);
      return;
    }

    // Cache the result (use hashed key for security)
    apiKeyCache.set(cacheKey, {
      uid: result.uid!,
      email: result.email,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    // Attach user to request
    (req as any).user = {
      uid: result.uid!,
      email: result.email,
    };

    logger.info('API key authenticated', { uid: result.uid });
    next();
  } catch (error) {
    logger.error('API key verification error', error as Error, {});
    const errorResponse: LLMErrorResponse = {
      error: {
        message: 'Internal server error during authentication',
        type: 'api_error',
        code: 'internal_error',
      },
    };
    res.status(500).json(errorResponse);
  }
}

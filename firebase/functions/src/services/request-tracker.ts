/**
 * Request Tracking Service
 *
 * Tracks LLM proxy request lifecycle, persists logs, and updates user token counts.
 *
 * Ported from: github.com/2389-research/platform-2389
 */

import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';

interface PendingRequest {
  uid: string;
  model: string;
  startTime: number;
}

interface CompletedRequest {
  uid: string;
  model: string;
  resolvedProvider: string;
  resolvedModel: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorMessage: string | undefined;
}

/**
 * Request tracker for monitoring and logging LLM proxy requests
 * Manages request lifecycle: pending → completed → persisted
 */
export class RequestTracker {
  private pending = new Map<string, PendingRequest>();
  private completed = new Map<string, CompletedRequest>();

  /**
   * Start tracking a new request
   * @returns requestId for tracking through completion
   */
  startRequest(uid: string, model: string): string {
    const requestId = randomUUID();
    this.pending.set(requestId, {
      uid,
      model,
      startTime: Date.now(),
    });
    logger.info('Request started', { requestId, uid, model });
    return requestId;
  }

  /**
   * Mark a request as completed with response data
   */
  completeRequest(
    requestId: string,
    data: {
      resolvedProvider: string;
      resolvedModel: string;
      inputTokens: number;
      outputTokens: number;
      inputCost: number;
      outputCost: number;
      totalCost: number;
      status: 'success' | 'error';
      errorMessage?: string;
    }
  ): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      logger.warn('Attempted to complete unknown request', { requestId });
      return;
    }

    const latencyMs = Date.now() - pending.startTime;
    this.pending.delete(requestId);

    this.completed.set(requestId, {
      uid: pending.uid,
      model: pending.model,
      resolvedProvider: data.resolvedProvider,
      resolvedModel: data.resolvedModel,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      inputCost: data.inputCost,
      outputCost: data.outputCost,
      totalCost: data.totalCost,
      latencyMs,
      status: data.status,
      errorMessage: data.errorMessage,
    });

    logger.info('Request completed', {
      requestId,
      latencyMs,
      status: data.status,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
    });
  }

  /**
   * Persist a completed request to Firestore (async, non-blocking)
   * Also updates user token counts
   */
  async persistRequest(requestId: string): Promise<void> {
    const completed = this.completed.get(requestId);
    if (!completed) {
      logger.warn('Attempted to persist unknown request', { requestId });
      return;
    }

    const db = admin.firestore();

    try {
      // Log the request and update user tokens in parallel
      await Promise.all([
        // Log request to llmRequests collection
        db.collection('llmRequests').add({
          uid: completed.uid,
          requestId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          model: completed.model,
          resolvedProvider: completed.resolvedProvider,
          resolvedModel: completed.resolvedModel,
          inputTokens: completed.inputTokens,
          outputTokens: completed.outputTokens,
          inputCost: completed.inputCost,
          outputCost: completed.outputCost,
          totalCost: completed.totalCost,
          latencyMs: completed.latencyMs,
          status: completed.status,
          ...(completed.errorMessage && { errorMessage: completed.errorMessage }),
        }),

        // Update user's token totals
        db
          .collection('users')
          .doc(completed.uid)
          .update({
            totalInputTokens: admin.firestore.FieldValue.increment(completed.inputTokens),
            totalOutputTokens: admin.firestore.FieldValue.increment(completed.outputTokens),
            totalCost: admin.firestore.FieldValue.increment(completed.totalCost),
          })
          .catch((err) => {
            // If user doesn't have token fields yet, set them
            if ((err as any).code === 5) {
              // NOT_FOUND - fields don't exist
              return db.collection('users').doc(completed.uid).set(
                {
                  totalInputTokens: completed.inputTokens,
                  totalOutputTokens: completed.outputTokens,
                  totalCost: completed.totalCost,
                },
                { merge: true }
              );
            }
            throw err;
          }),
      ]);

      // Delete from memory only after successful persistence
      this.completed.delete(requestId);
      logger.info('Request persisted', { requestId, uid: completed.uid });
    } catch (error) {
      logger.error('Failed to persist request', error as Error, { requestId });
      // Keep in completed map for potential retry
    }
  }

  /**
   * Get pending request count (for monitoring)
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Get completed (unpersisted) request count (for monitoring)
   */
  getCompletedCount(): number {
    return this.completed.size;
  }
}

// Global singleton instance
export const tracker = new RequestTracker();

/**
 * Calculate cost based on token counts and model pricing
 */
export function calculateCost(params: {
  inputTokens: number;
  outputTokens: number;
  inputPricePer1K: number;
  outputPricePer1K: number;
}): {
  inputCost: number;
  outputCost: number;
  totalCost: number;
} {
  const inputCost = (params.inputTokens / 1000) * params.inputPricePer1K;
  const outputCost = (params.outputTokens / 1000) * params.outputPricePer1K;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Provider Index
 *
 * Exports all provider implementations and a factory function for selecting providers.
 */

import type { ModelConfig } from '../model-config';
import type { ChatCompletionRequest, ProviderResult } from './types';
import * as anthropic from './anthropic';
import * as openai from './openai';
import * as openrouter from './openrouter';

export * from './types';

export interface Provider {
  chat(request: ChatCompletionRequest, modelConfig: ModelConfig): Promise<ProviderResult>;
}

/**
 * Get the provider implementation for a given provider name
 */
export function getProvider(providerName: 'anthropic' | 'openai' | 'openrouter'): Provider {
  switch (providerName) {
    case 'anthropic':
      return anthropic;
    case 'openai':
      return openai;
    case 'openrouter':
      return openrouter;
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

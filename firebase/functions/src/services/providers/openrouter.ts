/**
 * OpenRouter Provider
 *
 * Handles chat completions via the OpenRouter API (through Cloudflare gateway).
 * OpenRouter uses an OpenAI-compatible API, so this is similar to the OpenAI provider.
 * Used for models like Qwen, DeepSeek, etc.
 */

import * as logger from '../../utils/logger';
import type { ModelConfig } from '../model-config';
import type { ChatCompletionRequest, ChatCompletionResponse, ProviderResult } from './types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Generate a unique completion ID
 */
function generateCompletionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'chatcmpl-';
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Map finish reason to our standardized format
 */
function mapFinishReason(
  reason: string | null | undefined
): 'stop' | 'length' | 'content_filter' | null {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return null;
  }
}

/**
 * Send a chat completion request to OpenRouter (non-streaming)
 */
export async function chat(
  request: ChatCompletionRequest,
  modelConfig: ModelConfig
): Promise<ProviderResult> {
  const baseUrl =
    modelConfig.baseUrl || process.env['OPENROUTER_BASE_URL'] || DEFAULT_BASE_URL;
  const apiKey = process.env['OPENROUTER_API_KEY'];

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  logger.info('Sending request to OpenRouter', {
    model: request.model,
    backendModel: modelConfig.backendModel,
    messageCount: request.messages.length,
  });

  const requestBody = {
    model: modelConfig.backendModel,
    messages: request.messages,
    ...(request.max_tokens && { max_tokens: request.max_tokens }),
    ...(request.temperature !== undefined && { temperature: request.temperature }),
    ...(request.top_p !== undefined && { top_p: request.top_p }),
    ...(request.stop && { stop: request.stop }),
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://askkaya.com',
      'X-Title': 'AskKaya',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('OpenRouter request failed', new Error(errorText), {
      status: response.status,
      model: modelConfig.backendModel,
    });
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    id?: string;
    created?: number;
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const choice = data.choices?.[0];

  const result: ChatCompletionResponse = {
    id: data.id || generateCompletionId(),
    object: 'chat.completion',
    created: data.created || Math.floor(Date.now() / 1000),
    model: request.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: choice?.message?.content || '',
        },
        finish_reason: mapFinishReason(choice?.finish_reason),
      },
    ],
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
  };

  logger.info('OpenRouter response received', {
    model: request.model,
    promptTokens: result.usage.prompt_tokens,
    completionTokens: result.usage.completion_tokens,
  });

  return {
    response: result,
    resolvedModel: modelConfig.backendModel,
  };
}

/**
 * OpenAI Provider
 *
 * Handles chat completions via the OpenAI API (through Cloudflare gateway).
 *
 * Ported from: github.com/2389-research/platform-2389
 */

import OpenAI from 'openai';
import * as logger from '../../utils/logger';
import type { ModelConfig } from '../model-config';
import type { ChatCompletionRequest, ChatCompletionResponse, ProviderResult } from './types';

let client: OpenAI | null = null;

function getClient(baseUrl?: string): OpenAI {
  const targetUrl = baseUrl || process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1';
  // Create new client if base URL differs or client doesn't exist
  if (!client || client.baseURL !== targetUrl) {
    client = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
      baseURL: targetUrl,
    });
  }
  return client;
}

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
 * Convert our message format to OpenAI format
 */
function convertMessages(
  messages: ChatCompletionRequest['messages']
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content,
  }));
}

/**
 * Map OpenAI finish reason to our standardized format
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
 * Send a chat completion request to OpenAI (non-streaming)
 */
export async function chat(
  request: ChatCompletionRequest,
  modelConfig: ModelConfig
): Promise<ProviderResult> {
  const openaiClient = getClient(modelConfig.baseUrl);

  logger.info('Sending request to OpenAI', {
    model: request.model,
    backendModel: modelConfig.backendModel,
    messageCount: request.messages.length,
  });

  const response = await openaiClient.chat.completions.create({
    model: modelConfig.backendModel,
    messages: convertMessages(request.messages),
    max_tokens: request.max_tokens ?? undefined,
    temperature: request.temperature ?? undefined,
    top_p: request.top_p ?? undefined,
    stop: request.stop ?? undefined,
    stream: false,
  });

  const choice = response.choices[0];

  const result: ChatCompletionResponse = {
    id: response.id || generateCompletionId(),
    object: 'chat.completion',
    created: response.created || Math.floor(Date.now() / 1000),
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
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    },
  };

  logger.info('OpenAI response received', {
    model: request.model,
    promptTokens: result.usage.prompt_tokens,
    completionTokens: result.usage.completion_tokens,
  });

  return {
    response: result,
    resolvedModel: modelConfig.backendModel,
  };
}

/**
 * Anthropic Provider
 *
 * Handles chat completions via the Anthropic API (through Cloudflare gateway).
 * Returns OpenAI-compatible response format.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as logger from '../../utils/logger';
import type { ModelConfig } from '../model-config';
import type { ChatCompletionRequest, ChatCompletionResponse, ProviderResult } from './types';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
      baseURL: process.env['ANTHROPIC_BASE_URL'],
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
 * Convert OpenAI-style messages to Anthropic format
 * Extracts system message and formats user/assistant messages
 */
function convertMessages(messages: ChatCompletionRequest['messages']): {
  system: string | undefined;
  messages: Anthropic.MessageParam[];
} {
  let system: string | undefined;
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic takes system as a separate parameter
      system = (system ? system + '\n\n' : '') + msg.content;
    } else {
      anthropicMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  return { system, messages: anthropicMessages };
}

/**
 * Map Anthropic stop reason to OpenAI format
 */
function mapStopReason(
  stopReason: string | null | undefined
): 'stop' | 'length' | 'content_filter' | null {
  switch (stopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    default:
      return null;
  }
}

/**
 * Send a chat completion request to Anthropic (non-streaming)
 */
export async function chat(
  request: ChatCompletionRequest,
  modelConfig: ModelConfig
): Promise<ProviderResult> {
  const anthropicClient = getClient();
  const { system, messages } = convertMessages(request.messages);

  logger.info('Sending request to Anthropic', {
    model: request.model,
    backendModel: modelConfig.backendModel,
    messageCount: request.messages.length,
  });

  const response = await anthropicClient.messages.create({
    model: modelConfig.backendModel,
    max_tokens: request.max_tokens || 4096,
    system,
    messages,
    ...(request.temperature !== undefined && { temperature: request.temperature }),
    ...(request.top_p !== undefined && { top_p: request.top_p }),
    ...(request.stop && {
      stop_sequences: Array.isArray(request.stop) ? request.stop : [request.stop],
    }),
  });

  // Extract text content
  const textContent = response.content.find((c) => c.type === 'text');
  const content = textContent?.type === 'text' ? textContent.text : '';

  const result: ChatCompletionResponse = {
    id: response.id || generateCompletionId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: request.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: mapStopReason(response.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: response.usage?.input_tokens || 0,
      completion_tokens: response.usage?.output_tokens || 0,
      total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    },
  };

  logger.info('Anthropic response received', {
    model: request.model,
    promptTokens: result.usage.prompt_tokens,
    completionTokens: result.usage.completion_tokens,
  });

  return {
    response: result,
    resolvedModel: modelConfig.backendModel,
  };
}

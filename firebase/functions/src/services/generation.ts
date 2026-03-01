/**
 * Generation Service
 *
 * LLM-based response generation with confidence scoring, PII redaction, and escalation logic
 * Uses Cloudflare AI Gateway Unified API for billing
 */

import OpenAI from 'openai';

// Confidence Thresholds
const ESCALATION_THRESHOLD = 0.65;  // Below this, escalate to human
const CRITICAL_THRESHOLD = 0.4;     // Below this, refuse to answer

// Model: GPT-4o-mini via OpenAI provider endpoint (Unified Billing)
const MODEL = 'gpt-4o-mini';

// OpenAI-compatible client for Cloudflare AI Gateway (OpenAI provider endpoint)
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    // Use OpenAI provider-specific endpoint with CF token as API key
    const baseURL = 'https://gateway.ai.cloudflare.com/v1/0c3240509aa27a7e737544ef66423171/kayaclaw/openai';
    const cfToken = process.env['CF_AIG_TOKEN'] || '';

    _client = new OpenAI({
      apiKey: cfToken,
      baseURL: baseURL,
    });
  }
  return _client;
}

const MAX_TOKENS = 1024;

export interface GenerationResult {
  text: string;
  confidence: number;
  shouldEscalate: boolean;
  reasoning: string;
}

export interface ImageInput {
  data: string;  // base64 encoded image data
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

/**
 * Generate response using LLM with retrieved context
 *
 * @param query - User's question
 * @param context - Retrieved context from RAG
 * @param clientName - Client name for personalization
 * @param image - Optional image input for vision queries
 * @returns Generated response with confidence score
 */
export async function generateResponse(
  query: string,
  context: string,
  clientName: string,
  image?: ImageInput
): Promise<GenerationResult> {
  const systemPrompt = `You are a helpful customer support assistant for ${clientName}.
Your job is to answer questions based on the provided knowledge base context.

IMPORTANT RULES:
1. Only answer based on the provided context
2. If the context doesn't contain relevant information, say so clearly
3. Never share personal information (emails, phone numbers, addresses)
4. Be concise and professional
5. If an image is provided, analyze it carefully to understand the user's question context (error messages, screenshots, etc.)
6. After your answer, provide a confidence score (0-100) based on:
   - How well the context matches the question
   - How complete your answer is
   - How certain you are about the information

Format your response as:
ANSWER: [your answer here]
CONFIDENCE: [0-100]
REASONING: [brief explanation of confidence score]`;

  const userPrompt = `Context from knowledge base:
${context}

Question: ${query}

Please provide your answer, confidence score, and reasoning.`;

  // Build message content - text only or text + image
  type MessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

  const messageContent: MessageContent = image
    ? [
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:${image.mediaType};base64,${image.data}`,
          },
        },
        {
          type: 'text' as const,
          text: userPrompt,
        },
      ]
    : userPrompt;

  try {
    const response = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });

    // Extract text from response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in response');
    }

    const fullText = content;

    // Parse structured response
    const answerMatch = fullText.match(/ANSWER:\s*([\s\S]*?)(?=CONFIDENCE:)/);
    const confidenceMatch = fullText.match(/CONFIDENCE:\s*(\d+)/);
    const reasoningMatch = fullText.match(/REASONING:\s*([\s\S]*?)$/);

    let answerText = answerMatch?.[1]?.trim() || fullText;
    const confidenceScore = confidenceMatch?.[1] ? parseInt(confidenceMatch[1]) / 100 : 0.5;
    const reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided';

    // Apply PII redaction
    answerText = redactPII(answerText);

    // Determine if escalation is needed
    const shouldEscalate = confidenceScore < ESCALATION_THRESHOLD;

    // If confidence is critically low, provide generic response
    if (confidenceScore < CRITICAL_THRESHOLD) {
      answerText = "I don't have enough information to answer this question confidently. Let me connect you with a team member who can help.";
    }

    return {
      text: answerText,
      confidence: confidenceScore,
      shouldEscalate,
      reasoning,
    };
  } catch (error) {
    console.error('Generation error:', error);
    throw new Error('Failed to generate response');
  }
}

/**
 * Redact PII from generated text
 * Removes emails, phone numbers, and other sensitive data
 */
function redactPII(text: string): string {
  let redacted = text;

  // Redact email addresses
  redacted = redacted.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]'
  );

  // Redact phone numbers (various formats)
  redacted = redacted.replace(
    /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    '[PHONE_REDACTED]'
  );

  // Redact SSN-like patterns (XXX-XX-XXXX)
  redacted = redacted.replace(
    /\b\d{3}-\d{2}-\d{4}\b/g,
    '[SSN_REDACTED]'
  );

  // Redact credit card numbers (basic pattern)
  redacted = redacted.replace(
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    '[CARD_REDACTED]'
  );

  return redacted;
}

/**
 * Test PII redaction (exported for testing)
 */
export function testRedactPII(text: string): string {
  return redactPII(text);
}

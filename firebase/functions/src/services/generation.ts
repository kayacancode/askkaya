/**
 * Generation Service
 * 
 * LLM-based response generation with confidence scoring, PII redaction, and escalation logic
 */

import Anthropic from '@anthropic-ai/sdk';

// Confidence Thresholds
const ESCALATION_THRESHOLD = 0.65;  // Below this, escalate to human
const CRITICAL_THRESHOLD = 0.4;     // Below this, refuse to answer

const MODEL = 'claude-sonnet-4-5-20250929';

// Lazy-initialize Anthropic client to allow env vars to load first
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
      baseURL: process.env['ANTHROPIC_BASE_URL'],
    });
  }
  return _anthropic;
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
  const messageContent: Anthropic.MessageParam['content'] = image
    ? [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.data,
          },
        },
        {
          type: 'text',
          text: userPrompt,
        },
      ]
    : userPrompt;

  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });

    // Extract text from response
    const content = response.content[0];
    if (content?.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    const fullText = content.text;

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

import { NextRequest, NextResponse } from 'next/server';

const FIREBASE_QUERY_URL = 'https://us-central1-askkaya-47cef.cloudfunctions.net/queryApi';
const DEMO_CLIENT_ID = 'demo-landing-page';

// Simple in-memory rate limiting (resets on server restart)
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per minute per IP

function getRateLimitKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  return ip;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.timestamp > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { count: 1, timestamp: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Rate limit check
    const rateLimitKey = getRateLimitKey(req);
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json({
        error: 'Rate limit exceeded. Please try again later.',
        text: "You've reached the demo limit. Request full access to ask unlimited questions!"
      }, { status: 429 });
    }

    // Call the Firebase function
    const response = await fetch(FIREBASE_QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Request': 'true',
      },
      body: JSON.stringify({
        question,
        clientId: DEMO_CLIENT_ID,
        isDemo: true,
      }),
    });

    if (!response.ok) {
      // If the backend doesn't support demo mode, return a fallback response
      const fallbackResponses: Record<string, string> = {
        'who is kaya': "Kaya Jones is a multi-project developer who manages full-stack applications across Go, TypeScript, Python, Firebase, and React. She's currently building AskKaya (this!), YouDle (a blog/newsletter platform), and an autonomous conversational AI robot using Reachy Mini hardware with facial recognition and voice I/O. She's hands-on with robotics, AI integration, and has strong technical taste—she prioritizes code clarity and user experience. Based in Central Time, she runs Forever 22 Studios.",
        'kaya': "Kaya Jones is a multi-project developer who manages full-stack applications across Go, TypeScript, Python, Firebase, and React. She's currently building AskKaya (this!), YouDle (a blog/newsletter platform), and an autonomous conversational AI robot using Reachy Mini hardware with facial recognition and voice I/O. She's hands-on with robotics, AI integration, and has strong technical taste—she prioritizes code clarity and user experience. Based in Central Time, she runs Forever 22 Studios.",
        'openclaw': "OpenClaw is an open-source personal AI assistant that runs locally on your machine. It works through chat apps like WhatsApp, Telegram, Discord, Slack, Signal, or iMessage. Key features: persistent memory that learns your preferences, browser control for navigating sites and filling forms, system access for files/commands (sandboxed), and 50+ integrations including Claude, GPT, Spotify, Gmail, and GitHub. Install with: `curl -fsSL https://openclaw.ai/install.sh | bash`",
        'setup': "To set up OpenClaw:\n1. One-liner install: `curl -fsSL https://openclaw.ai/install.sh | bash`\n2. Or via NPM: `npm i -g openclaw` then `openclaw onboard`\n3. Or build from source: clone the repo and run `pnpm build`\n\nOnce installed, connect it to your preferred chat app (WhatsApp, Telegram, Discord, etc.) and start chatting with your AI assistant!",
        'honcho': "Honcho is a memory/context management system for AI agents. Kaya uses it to give her AI tools persistent memory across sessions—it's what powers the 'learns from every interaction' part of AskKaya. You can configure it via the Honcho MCP server or SDK to maintain context across conversations.",
        'contact': "You can reach Kaya at kaya@forever22studios.com. She's open to collaborations, consulting, and interesting projects—especially anything involving AI agents, robotics, or full-stack development.",
        'mcp': "MCP (Model Context Protocol) is how AI assistants connect to external tools and data sources. It's the protocol that lets Claude Code, OpenClaw, and other AI tools call external APIs and services. AskKaya is available as an MCP server so your AI assistant can query Kaya's knowledge base automatically.",
        'reachy': "Kaya is building an autonomous conversational robot using Reachy Mini hardware. It has facial recognition (face_identity.py backend), voice I/O with Whisper STT and ElevenLabs TTS, and uses Claude for reasoning via MCP integration. The robot can recognize faces, have natural conversations, and express itself through animations.",
        'robot': "Kaya is building an autonomous conversational robot using Reachy Mini hardware. It has facial recognition (face_identity.py backend), voice I/O with Whisper STT and ElevenLabs TTS, and uses Claude for reasoning via MCP integration. The robot can recognize faces, have natural conversations, and express itself through animations.",
      };

      const q = question.toLowerCase();
      let fallbackText = "I don't have enough information to answer that in this demo. Request full access to get answers from the complete knowledge base!";

      for (const [key, value] of Object.entries(fallbackResponses)) {
        if (q.includes(key)) {
          fallbackText = value;
          break;
        }
      }

      return NextResponse.json({
        text: fallbackText,
        confidence: 0.8,
        sources: [],
        escalated: false,
        isDemo: true,
      });
    }

    const data = await response.json();
    return NextResponse.json({
      ...data,
      isDemo: true,
    });

  } catch (error) {
    console.error('Demo query error:', error);
    return NextResponse.json({
      error: 'Failed to process query',
      text: "Something went wrong. Please try again or request full access.",
    }, { status: 500 });
  }
}

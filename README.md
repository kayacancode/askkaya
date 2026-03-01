# AskKaya

AI-powered client support platform with CLI, Firebase backend, and web dashboard.

## Quick Start

### Install CLI

```bash
brew tap kayacancode/askkaya
brew install askkaya
```

### Sign Up

AskKaya is invite-only. Contact [Kaya](mailto:kaya@forever22studios.com) to get an invite code.

```bash
askkaya auth signup -c YOUR_INVITE_CODE -e your@email.com
```

### Login & Query

```bash
askkaya auth login -e your@email.com
askkaya query "How do I backup my setup?"
```

No API keys needed - all LLM requests are handled through AskKaya's secure proxy.

### Create an API Key (for Scripts)

For programmatic access, generate an API key:

```bash
askkaya keys create "My Script"
# Returns: sk-kaya-...
```

Use it with the OpenAI-compatible API at `api.askkaya.com`:

```bash
curl -X POST https://api.askkaya.com/v1/chat/completions \
  -H "Authorization: sk-kaya-..." \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"Hello"}]}'
```

**Python (OpenAI SDK):**
```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-kaya-...",
    base_url="https://api.askkaya.com/v1"
)

response = client.chat.completions.create(
    model="claude-sonnet-4-5",
    messages=[{"role": "user", "content": "Hello"}]
)
print(response.choices[0].message.content)
```

**Node.js:**
```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-kaya-...',
  baseURL: 'https://api.askkaya.com/v1'
});

const response = await client.chat.completions.create({
  model: 'claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

### Connect Your AI Agent (Recommended)

Add AskKaya as an MCP server so your AI agent can automatically query the knowledge base:

**Claude Code:**
```bash
claude mcp add askkaya --transport http https://us-central1-askkaya-47cef.cloudfunctions.net/mcpServer
```

**OpenClaw / Other MCP Clients:**
```json
{
  "mcpServers": {
    "askkaya": {
      "transport": "http",
      "url": "https://us-central1-askkaya-47cef.cloudfunctions.net/mcpServer"
    }
  }
}
```

Once connected, your AI agent can seamlessly answer questions from the AskKaya knowledge base without you needing to type any commands.

### Install AI Assistant Skill (Alternative)

If you prefer explicit commands, add AskKaya as a skill:

**Quick Install:**
```bash
curl -sL https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/install.sh | bash
```

**Manual Install (Claude Code):**
```bash
mkdir -p ~/.claude/skills/askkaya
curl -sL https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/askkaya.md \
  -o ~/.claude/skills/askkaya/SKILL.md
```

After installing, use `/askkaya` in your AI assistant:
```
/askkaya How do I configure Honcho memory?
```

The skill calls the CLI under the hood, so make sure you're logged in first.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   CLI       │────▶│  Firebase Cloud  │────▶│  Firestore  │
│  (Go/TUI)   │     │    Functions     │     │     DB      │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
┌─────────────┐             │
│ MCP Server  │─────────────┤
│ (AI Agents) │             │
└─────────────┘     ┌───────┴───────┐
                    ▼               ▼
              ┌──────────┐   ┌─────────────────┐
              │ OpenAI   │   │ Cloudflare AI   │
              │Embeddings│   │    Gateway      │
              └──────────┘   └────────┬────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              ┌──────────┐     ┌──────────┐     ┌────────────┐
              │Anthropic │     │  OpenAI  │     │ OpenRouter │
              │ (Claude) │     │ (GPT-4o) │     │  (Qwen)    │
              └──────────┘     └──────────┘     └────────────┘
```

## Features

- **RAG-powered answers** - Retrieves context from knowledge base
- **LLM proxy** - Centralized routing through Cloudflare AI Gateway
- **API keys** - Generate `sk-kaya-*` keys for programmatic access
- **Usage tracking** - Per-request logging with tokens and costs
- **Multi-model support** - Anthropic, OpenAI, OpenRouter (Qwen, DeepSeek)
- **Auto-escalation** - Low confidence queries escalate to humans via Telegram
- **Auto-learn** - Replies to escalations automatically add to KB
- **Multi-tenant** - Client isolation with personal and global KB articles
- **Billing integration** - Stripe subscription management

## Components

| Component | Tech | Description |
|-----------|------|-------------|
| CLI | Go, Cobra, Bubble Tea | Terminal client with TUI mode |
| MCP Server | TypeScript, MCP SDK | AI agent integration (Claude Code, OpenClaw) |
| LLM Proxy | Firebase, Cloudflare | Centralized model routing with tracking |
| Backend | Firebase Cloud Functions | Query API, webhooks, triggers |
| Database | Firestore | KB articles, clients, escalations, usage |
| Web Dashboard | Next.js, shadcn/ui | Admin interface |
| Notifications | Telegram Bot API | Escalation alerts |

## CLI Commands

```bash
# Interactive
askkaya                    # Launch interactive TUI

# Authentication
askkaya auth login         # Authenticate
askkaya auth logout        # Clear credentials
askkaya auth signup        # Sign up with invite code

# Queries
askkaya query "..."        # Ask a question (one-shot)
askkaya query -i           # Interactive query mode
askkaya query "..." --image ./screenshot.png  # Include image

# API Keys
askkaya keys create "name" # Create new API key
askkaya keys list          # List all keys
askkaya keys revoke <id>   # Revoke a key

# Status
askkaya status             # Check connection
askkaya heartbeat          # Start background daemon

# Admin (requires admin role)
askkaya admin set-model --user <uid> --model <model>     # Assign model to user
askkaya admin set-model --client <id> --model <model>    # Set client default
askkaya admin provision -e email@example.com --active    # Pre-provision account
askkaya admin link-stripe -c <client-id> -s cus_xxx      # Link Stripe customer
askkaya invite generate                                   # Generate invite code
```

## LLM Proxy

**Base URL:** `https://api.askkaya.com/v1`

AskKaya routes all LLM requests through a centralized proxy with:

- **No API key distribution** - Users never see provider API keys
- **Cloudflare AI Gateway** - Request logging, caching, rate limiting
- **Multi-provider support** - Route to different models per user
- **Usage tracking** - Token counts and cost attribution per request
- **OpenAI-compatible API** - Standard `/v1/chat/completions` endpoint

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat completion (OpenAI-compatible) |
| `/v1/models` | GET | List available models |
| `/health` | GET | Health check |

### Available Models

| Model ID | Provider | Description |
|----------|----------|-------------|
| `claude-sonnet-4-5` | Anthropic | Claude Sonnet 4.5 (default) |
| `claude-haiku-3-5` | Anthropic | Claude Haiku 3.5 (fast) |
| `gpt-4o-mini` | OpenAI | GPT-4o Mini (budget) |
| `qwen-2.5-72b` | OpenRouter | Qwen 2.5 72B (open source) |

Models are assigned by admins - users cannot switch models themselves.

## Development

### Prerequisites

- Node.js 22+
- Go 1.22+
- Firebase CLI
- pnpm

### Setup

```bash
# Clone
git clone https://github.com/kayacancode/askkaya.git
cd askkaya

# Install dependencies
pnpm install

# Firebase functions
cd firebase/functions
npm install
npm run build

# Start emulators
firebase emulators:start
```

### Deploy

```bash
# Functions
firebase deploy --only functions

# Web dashboard
cd web && vercel --prod
```

## Environment Variables

### Firebase Functions (.env)

```bash
# Embeddings
OPENAI_API_KEY=sk-...

# LLM Providers (routed through Cloudflare)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Cloudflare AI Gateway
ANTHROPIC_BASE_URL=https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/anthropic
OPENAI_BASE_URL=https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/openai

# Notifications
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## License

MIT

---

Built by [Forever 22 Studios](https://forever22studios.com)

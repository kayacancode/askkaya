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

### Login & Set API Key

```bash
askkaya auth login -e your@email.com
askkaya config set-api-key sk-ant-api03-xxx  # Your Anthropic API key
askkaya query "How do I backup my setup?"
```

Get your Anthropic API key at: https://console.anthropic.com/settings/keys

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
              ┌──────────┐   ┌──────────┐
              │  Claude  │   │ OpenAI   │
              │   LLM    │   │Embeddings│
              └──────────┘   └──────────┘
```

## Features

- **RAG-powered answers** - Retrieves context from knowledge base
- **Auto-escalation** - Low confidence queries escalate to humans via Telegram
- **Auto-learn** - Replies to escalations automatically add to KB
- **Multi-tenant** - Client isolation with personal and global KB articles
- **Billing integration** - Stripe subscription management

## Components

| Component | Tech | Description |
|-----------|------|-------------|
| CLI | Go, Cobra, Bubble Tea | Terminal client with TUI mode |
| MCP Server | TypeScript, MCP SDK | AI agent integration (Claude Code, OpenClaw) |
| Backend | Firebase Cloud Functions | Query API, webhooks, triggers |
| Database | Firestore | KB articles, clients, escalations |
| Web Dashboard | Next.js, shadcn/ui | Admin interface |
| Notifications | Telegram Bot API | Escalation alerts |

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

## CLI Commands

```bash
askkaya                # Launch interactive TUI
askkaya auth login     # Authenticate
askkaya auth logout    # Clear credentials
askkaya query "..."    # Ask a question (one-shot)
askkaya status         # Check connection
askkaya heartbeat      # Start background daemon
```

## Environment Variables

### Firebase Functions (.env)

```
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

## License

MIT

---

Built by [Forever 22 Studios](https://forever22studios.com)

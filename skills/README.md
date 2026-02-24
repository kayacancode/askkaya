# AskKaya Skills

Integrate AskKaya into your AI coding assistant.

## Quick Install

```bash
curl -sL https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/install.sh | bash
```

## Manual Installation

### Claude Code

```bash
mkdir -p ~/.claude/skills
curl -sL https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/askkaya.md -o ~/.claude/skills/askkaya.md
```

### OpenClaw

```bash
mkdir -p ~/.openclaw/skills
curl -sL https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/askkaya.md -o ~/.openclaw/skills/askkaya.md
```

### Codex

```bash
mkdir -p ~/.codex/skills
curl -sL https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/askkaya.md -o ~/.codex/skills/askkaya.md
```

## Prerequisites

1. Install the AskKaya CLI:
   ```bash
   brew tap kayacancode/askkaya
   brew install askkaya
   ```

2. Sign up (get an invite code from [Kaya](mailto:kaya@forever22studios.com)):
   ```bash
   askkaya auth signup -c YOUR_INVITE_CODE -e your@email.com
   ```

3. Login:
   ```bash
   askkaya auth login -e your@email.com
   ```

## Usage

Once installed, use `/askkaya` in your AI assistant:

```
/askkaya How do I configure Honcho memory?
/askkaya What OpenClaw plugins are available?
/askkaya How do I set up webhooks?
```

## How It Works

The skill invokes the `askkaya query` command under the hood, which:
1. Sends your question to the AskKaya RAG system
2. Retrieves relevant context from the knowledge base
3. Returns an AI-generated answer with confidence score
4. Escalates to a human if confidence is low

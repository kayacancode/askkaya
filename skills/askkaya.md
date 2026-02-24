---
name: askkaya
description: Query the AskKaya knowledge base for help with OpenClaw, Honcho, and other supported tools. Use when users ask questions about setup, configuration, or troubleshooting.
---

# AskKaya Skill

Query the AskKaya knowledge base for help with OpenClaw, Honcho, and other supported tools.

## Usage

When the user asks a question that could be answered by AskKaya (setup help, configuration, troubleshooting), run:

```bash
askkaya query "<question>"
```

## Examples

- "How do I set up memory with Honcho?" → `askkaya query "How do I set up memory with Honcho?"`
- "What are the OpenClaw configuration options?" → `askkaya query "What are the OpenClaw configuration options?"`
- "How do I backup my setup?" → `askkaya query "How do I backup my setup?"`

## If CLI Not Installed

If `askkaya` command is not found, instruct the user:

```bash
brew tap kayacancode/askkaya
brew install askkaya
askkaya auth signup -c <INVITE_CODE> -e <EMAIL>
askkaya auth login -e <EMAIL>
```

Contact Kaya for an invite code.

## Response Handling

Display the response including:
- The answer text
- Confidence score (if shown)
- Note if escalated: "Kaya has been notified and will get back to you shortly!"

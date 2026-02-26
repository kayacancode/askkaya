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

## Handling Errors

### If CLI Not Installed

If `askkaya` command is not found, guide the user:

```bash
brew tap kayacancode/askkaya
brew install askkaya
```

Then have them sign up or log in (see below).

### If Not Logged In

If the output contains "not logged in" or "auth login", the user needs to authenticate.

**For new users** (need an invite code from Kaya):
```bash
askkaya auth signup -c <INVITE_CODE> -e <EMAIL>
```

**For existing users** (already have an account):
```bash
askkaya auth login -e <EMAIL>
```

Tell them: "Contact Kaya (kaya@forever22studios.com) if you need an invite code or help with your account."

### If Payment Required

If the output contains "Payment required" or "billing", tell the user:

"Your AskKaya subscription needs to be set up. Contact Kaya to complete your billing setup, or run `askkaya billing setup` to get a payment link."

### If Billing Suspended

If the output contains "suspended", tell the user:

"Your subscription appears to be inactive. Please contact Kaya to resolve this."

## Response Handling

On success, display:
- The answer text
- Confidence score (if shown)
- If escalated: "Kaya has been notified and will get back to you shortly!"

## Screenshots

You can include screenshots to help diagnose issues:

```bash
askkaya query "What's this error?" --image /path/to/screenshot.png
```

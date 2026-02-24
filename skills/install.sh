#!/bin/bash
# AskKaya Skill Installer
# Installs the AskKaya skill for Claude Code, Codex, and OpenClaw

set -e

SKILL_URL="https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/askkaya.md"

echo "AskKaya Skill Installer"
echo "======================"
echo ""

# Detect which tools are available
CLAUDE_CODE=false
OPENCLAW=false
CODEX=false

if [ -d "$HOME/.claude" ]; then
    CLAUDE_CODE=true
fi

if [ -d "$HOME/.openclaw" ]; then
    OPENCLAW=true
fi

if [ -d "$HOME/.codex" ]; then
    CODEX=true
fi

# Install for Claude Code (uses directory/SKILL.md structure)
if [ "$CLAUDE_CODE" = true ]; then
    echo "Installing for Claude Code..."
    mkdir -p "$HOME/.claude/skills/askkaya"
    curl -sL "$SKILL_URL" -o "$HOME/.claude/skills/askkaya/SKILL.md"
    echo "  Installed to ~/.claude/skills/askkaya/SKILL.md"
fi

# Install for OpenClaw (uses directory/SKILL.md structure)
if [ "$OPENCLAW" = true ]; then
    echo "Installing for OpenClaw..."
    mkdir -p "$HOME/.openclaw/skills/askkaya"
    curl -sL "$SKILL_URL" -o "$HOME/.openclaw/skills/askkaya/SKILL.md"
    echo "  Installed to ~/.openclaw/skills/askkaya/SKILL.md"
fi

# Install for Codex (uses directory/SKILL.md structure)
if [ "$CODEX" = true ]; then
    echo "Installing for Codex..."
    mkdir -p "$HOME/.codex/skills/askkaya"
    curl -sL "$SKILL_URL" -o "$HOME/.codex/skills/askkaya/SKILL.md"
    echo "  Installed to ~/.codex/skills/askkaya/SKILL.md"
fi

# If none detected, offer manual install
if [ "$CLAUDE_CODE" = false ] && [ "$OPENCLAW" = false ] && [ "$CODEX" = false ]; then
    echo "No supported tools detected."
    echo ""
    echo "Manual installation:"
    echo "  Claude Code: mkdir -p ~/.claude/skills/askkaya && curl -sL $SKILL_URL -o ~/.claude/skills/askkaya/SKILL.md"
    echo "  OpenClaw:    mkdir -p ~/.openclaw/skills/askkaya && curl -sL $SKILL_URL -o ~/.openclaw/skills/askkaya/SKILL.md"
    echo "  Codex:       mkdir -p ~/.codex/skills/askkaya && curl -sL $SKILL_URL -o ~/.codex/skills/askkaya/SKILL.md"
    exit 0
fi

echo ""
echo "Installation complete!"
echo ""
echo "Make sure the AskKaya CLI is installed:"
echo "  brew tap kayacancode/askkaya"
echo "  brew install askkaya"
echo ""
echo "Usage: /askkaya How do I set up Honcho memory?"

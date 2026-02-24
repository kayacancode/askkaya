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

# Install for Claude Code
if [ "$CLAUDE_CODE" = true ]; then
    echo "Installing for Claude Code..."
    mkdir -p "$HOME/.claude/skills"
    curl -sL "$SKILL_URL" -o "$HOME/.claude/skills/askkaya.md"
    echo "  Installed to ~/.claude/skills/askkaya.md"
fi

# Install for OpenClaw
if [ "$OPENCLAW" = true ]; then
    echo "Installing for OpenClaw..."
    mkdir -p "$HOME/.openclaw/skills"
    curl -sL "$SKILL_URL" -o "$HOME/.openclaw/skills/askkaya.md"
    echo "  Installed to ~/.openclaw/skills/askkaya.md"
fi

# Install for Codex
if [ "$CODEX" = true ]; then
    echo "Installing for Codex..."
    mkdir -p "$HOME/.codex/skills"
    curl -sL "$SKILL_URL" -o "$HOME/.codex/skills/askkaya.md"
    echo "  Installed to ~/.codex/skills/askkaya.md"
fi

# If none detected, offer manual install
if [ "$CLAUDE_CODE" = false ] && [ "$OPENCLAW" = false ] && [ "$CODEX" = false ]; then
    echo "No supported tools detected."
    echo ""
    echo "Manual installation:"
    echo "  Claude Code: mkdir -p ~/.claude/skills && curl -sL $SKILL_URL -o ~/.claude/skills/askkaya.md"
    echo "  OpenClaw:    mkdir -p ~/.openclaw/skills && curl -sL $SKILL_URL -o ~/.openclaw/skills/askkaya.md"
    echo "  Codex:       mkdir -p ~/.codex/skills && curl -sL $SKILL_URL -o ~/.codex/skills/askkaya.md"
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

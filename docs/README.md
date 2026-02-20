# AskKaya Documentation

## Overview

AskKaya is a full-stack client support platform with:
- Go CLI with Bubble Tea TUI
- Firebase backend (authentication, billing, RAG)
- Knowledge base ingestion pipeline
- Telegram escalation
- Next.js admin dashboard
- Stripe billing integration

## Structure

```
.
├── cli/                     # Go CLI application
├── firebase/
│   ├── functions/          # TypeScript Cloud Functions v2
│   └── firestore/          # Firestore rules and indexes
├── web/                    # Next.js 14 admin dashboard
├── config/                 # Configuration files
└── docs/                   # Documentation
```

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Go >= 1.21
- Firebase CLI

### Installation

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set up environment variables:
   ```bash
   cp config/.env.example .env
   ```

3. Build the CLI:
   ```bash
   cd cli && go build
   ```

4. Build Firebase functions:
   ```bash
   cd firebase/functions && pnpm build
   ```

## Development

See individual README files in each subdirectory for specific development instructions.

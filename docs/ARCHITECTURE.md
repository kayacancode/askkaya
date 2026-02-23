# AskKaya Architecture

## System Overview

AskKaya is a full-stack client support platform that combines real-time chat capabilities, knowledge base RAG (Retrieval-Augmented Generation), automated escalation workflows, and comprehensive billing management.

## High-Level Architecture

```
┌──────────────┐
│   End Users  │
└──────┬───────┘
       │
       ▼
┌──────────────────┐     ┌─────────────────┐
│   Go CLI (TUI)   │────▶│  Firebase Auth  │
│  Bubble Tea UI   │     └─────────────────┘
└──────┬───────────┘
       │
       ▼
┌──────────────────────────────────────────┐
│       Firebase Cloud Functions v2        │
├──────────────────────────────────────────┤
│  • API Gateway (query.ts)                │
│  • RAG Pipeline (rag.ts, embeddings.ts)  │
│  • Billing Integration (stripe.ts)       │
│  • Notification Router (router.ts)       │
│  • KB Processing (webhook.ts, parser.ts) │
└──────┬───────────────────────────────────┘
       │
       ├─────────────────┬──────────────┬──────────────┐
       ▼                 ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐
│  Firestore  │  │   OpenAI    │  │  Stripe  │  │ Telegram │
│             │  │ Embeddings  │  │  Billing │  │   Bot    │
│ • Users     │  │             │  │          │  │          │
│ • Clients   │  │  Anthropic  │  └──────────┘  └──────────┘
│ • Sessions  │  │   Claude    │
│ • KB Docs   │  │             │
│ • Messages  │  └─────────────┘
└─────────────┘
       ▲
       │
┌──────────────────┐
│  Next.js Admin   │
│    Dashboard     │
│                  │
│ • Client Mgmt    │
│ • KB Ingestion   │
│ • Analytics      │
│ • Billing UI     │
└──────────────────┘
```

## Core Components

### 1. Go CLI (Bubble Tea TUI)

**Location:** `/cli`

**Purpose:** Client-side terminal user interface for support interactions

**Key Features:**
- Interactive Bubble Tea TUI with keyboard navigation
- Firebase authentication via custom token flow
- Session management and message history
- Heartbeat daemon for online presence tracking
- Secure token storage in system keychain

**Technology:**
- Go 1.21+
- Bubble Tea (TUI framework)
- Cobra (CLI framework)
- Firebase Admin SDK
- OS keychain integration

### 2. Firebase Backend

#### Cloud Functions (TypeScript)

**Location:** `/firebase/functions`

**Functions:**

1. **API Gateway (`api/query.ts`)**
   - Handles client query requests
   - Routes to RAG pipeline
   - Returns AI-generated responses
   - Manages conversation context

2. **RAG Pipeline (`services/rag.ts`)**
   - Vector similarity search in knowledge base
   - Context retrieval and ranking
   - Integration with Claude for generation
   - Relevance scoring and filtering

3. **Embeddings Service (`services/embeddings.ts`)**
   - OpenAI text-embedding-ada-002 integration
   - Batch processing for KB documents
   - Vector dimension: 1536
   - Cosine similarity search

4. **Billing System (`billing/stripe.ts`)**
   - Stripe Checkout session creation
   - Webhook event processing
   - Usage tracking and metering
   - Subscription lifecycle management

5. **Notification Router (`notify/router.ts`)**
   - Multi-channel escalation (Telegram, email, iMessage)
   - Priority-based routing
   - Fallback chain configuration
   - Delivery status tracking

6. **KB Processing (`processing/parser.ts`, `processing/webhook.ts`)**
   - GitHub webhook listener
   - Markdown parsing and chunking
   - Automatic embedding generation
   - Incremental updates

#### Firestore Data Model

```typescript
// Collections Schema

clients/
  {clientId}/
    - name: string
    - email: string
    - stripeCustomerId: string
    - plan: 'free' | 'pro' | 'enterprise'
    - createdAt: timestamp
    - kbEnabled: boolean

users/
  {userId}/
    - clientId: reference
    - email: string
    - role: 'admin' | 'user'
    - lastSeen: timestamp
    - status: 'online' | 'offline'

sessions/
  {sessionId}/
    - userId: reference
    - clientId: reference
    - startTime: timestamp
    - endTime: timestamp | null
    - messageCount: number
    - status: 'active' | 'closed'

messages/
  {messageId}/
    - sessionId: reference
    - role: 'user' | 'assistant' | 'system'
    - content: string
    - timestamp: timestamp
    - sources: array<reference> // KB document refs

knowledge_base/
  {clientId}/
    documents/
      {docId}/
        - title: string
        - content: string
        - embedding: array<number> // 1536-dim vector
        - source: string // GitHub URL
        - lastUpdated: timestamp
        - chunkIndex: number
        - parentDoc: reference | null

billing/
  {clientId}/
    subscriptions/
      {subscriptionId}/
        - stripeSubscriptionId: string
        - status: string
        - plan: string
        - currentPeriodEnd: timestamp
    
    usage/
      {month}/
        - queries: number
        - tokens: number
        - cost: number
```

### 3. Next.js Admin Dashboard

**Location:** `/web`

**Purpose:** Web-based admin interface for client management

**Key Pages:**

1. **Dashboard (`/dashboard`)**
   - Real-time metrics
   - Active sessions
   - Usage analytics
   - System health

2. **Client Management (`/clients`)**
   - Client CRUD operations
   - Billing plan management
   - KB configuration
   - User invitations

3. **Knowledge Base (`/kb`)**
   - Document upload interface
   - GitHub integration setup
   - Manual document editing
   - Embedding regeneration

4. **Billing (`/billing`)**
   - Stripe integration UI
   - Subscription management
   - Usage reports
   - Invoice history

5. **Analytics (`/analytics`)**
   - Query volume trends
   - Response quality metrics
   - Escalation patterns
   - Cost analysis

**Technology:**
- Next.js 14 (App Router)
- React 18
- Tailwind CSS 4
- Firebase Admin SDK
- Stripe SDK

### 4. Knowledge Base Ingestion Pipeline

**Flow:**

```
GitHub Repo → Webhook → Cloud Function → Parser → Chunker → Embeddings → Firestore
```

**Process:**

1. Developer pushes markdown to designated KB repository
2. GitHub webhook triggers `onKBUpdate` function
3. Parser extracts and sanitizes markdown content
4. Chunker splits documents into ~500 token segments
5. OpenAI generates embeddings for each chunk
6. Firestore stores chunks with metadata and vectors
7. Old versions automatically replaced

**Supported Formats:**
- Markdown (.md)
- JSON structured docs
- Plain text (.txt)

### 5. Escalation System

**Channels:**

1. **Telegram Bot**
   - High-priority alerts
   - Real-time notifications
   - Bi-directional messaging
   - Rich formatting support

2. **Email (SendGrid/SES)**
   - Medium-priority alerts
   - Detailed reports
   - Digest mode support
   - Template-based

3. **iMessage (Shortcuts Integration)**
   - iOS ecosystem integration
   - Critical alerts only
   - Requires Mac mini or iPhone relay

**Escalation Rules:**

```typescript
interface EscalationRule {
  trigger: 'sentiment' | 'keyword' | 'timeout' | 'manual';
  threshold?: number;
  channels: ('telegram' | 'email' | 'imessage')[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}
```

## Authentication & Authorization

### CLI Authentication Flow

1. User runs `askkaya login`
2. CLI opens browser to Firebase Auth
3. User completes OAuth flow (Google/GitHub/Email)
4. Custom token generated and returned to CLI
5. Token stored in OS keychain
6. Subsequent requests use token from keychain

### Web Authentication

- Firebase Auth with Google/GitHub providers
- Role-based access control (RBAC)
- Admin-only routes protected via middleware
- JWT token validation on API calls

### API Security

- All Cloud Functions protected by auth middleware
- Client ID validated against Firestore
- Rate limiting per client tier
- Request signing for webhook endpoints

## Deployment Architecture

### Production Setup

```
Domain Setup:
  - app.askkaya.com → Firebase Hosting (Next.js)
  - api.askkaya.com → Cloud Functions (REST API)

SSL/TLS:
  - Automatic via Firebase Hosting
  - Custom domain certificates

Scaling:
  - Cloud Functions: Auto-scaling per traffic
  - Firestore: Automatic sharding
  - OpenAI: Rate limit per plan tier
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
Trigger: Push to main branch

Steps:
  1. Run tests (Go + Jest + TypeScript)
  2. Build CLI binaries (darwin-arm64, darwin-amd64, linux-amd64)
  3. Build Next.js app (static export)
  4. Deploy functions to Firebase
  5. Deploy hosting to Firebase
  6. Upload CLI binaries to GitHub Releases
  7. Update Homebrew formula
```

## Performance Considerations

### Latency Targets

- CLI query to response: < 2s (p95)
- RAG vector search: < 200ms
- Embedding generation: < 500ms per chunk
- Dashboard load time: < 1s

### Cost Optimization

- OpenAI embeddings cached indefinitely
- Firestore indexes optimized for common queries
- Cloud Functions cold start mitigation (min instances)
- Stripe webhook idempotency

### Scalability

- Horizontal: Cloud Functions scale automatically
- Vertical: Firestore supports millions of documents
- Caching: Redis layer (future) for hot data
- CDN: Firebase Hosting global edge network

## Monitoring & Observability

### Metrics Collected

- Query latency (p50, p95, p99)
- Token usage per client
- RAG relevance scores
- Escalation rates
- Error rates by function
- Billing events

### Logging Strategy

- Cloud Functions: Structured JSON logs
- CLI: Local file + optional cloud upload
- Web: Browser console + Sentry
- Firestore: Audit trail for sensitive ops

### Alerting

- PagerDuty integration for critical errors
- Slack webhooks for team notifications
- Telegram bot for real-time alerts
- Email digests for daily summaries

## Security Model

### Data Protection

- Encryption at rest (Firestore default)
- Encryption in transit (TLS 1.3)
- API keys in Secret Manager
- Client data isolation (strict RLS)

### Compliance

- GDPR: Data export/deletion APIs
- SOC 2: Audit logging enabled
- PCI DSS: Stripe handles card data
- HIPAA: Optional PHI redaction

### Vulnerability Management

- Dependabot for dependency updates
- Regular security audits
- Penetration testing (annual)
- Bug bounty program (future)

## Technology Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| CLI | Go | 1.21+ |
| TUI Framework | Bubble Tea | Latest |
| Backend | Firebase Functions | v2 |
| Runtime | Node.js | 18+ |
| Database | Firestore | Native |
| Auth | Firebase Auth | Latest |
| AI (Embeddings) | OpenAI | text-embedding-ada-002 |
| AI (Generation) | Anthropic | Claude 3.5 Sonnet |
| Billing | Stripe | Latest |
| Frontend | Next.js | 14 |
| UI | React + Tailwind | 18 + 4 |
| Notifications | Telegram Bot API | Latest |
| Testing | Jest + Go testing | Latest |
| CI/CD | GitHub Actions | Latest |

## Future Enhancements

### Phase 2 (Q2 2026)
- Voice interface (WebRTC + Whisper)
- Mobile app (React Native)
- Advanced analytics dashboard
- Custom AI model fine-tuning

### Phase 3 (Q3 2026)
- Multi-language support
- Slack integration
- Teams integration
- Zapier connectors

### Phase 4 (Q4 2026)
- On-premise deployment option
- White-label solution
- Enterprise SSO (SAML)
- Advanced compliance features

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

Proprietary - All Rights Reserved

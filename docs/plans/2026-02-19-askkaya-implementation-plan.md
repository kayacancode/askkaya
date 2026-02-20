# AskKaya Full Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build AskKaya end-to-end: Go CLI (Bubble Tea TUI) that connects to a Firebase backend with auth, billing, RAG-based query answering, KB ingestion from GitHub, escalation notifications via Telegram, a Next.js admin dashboard, and Stripe billing integration.

**Architecture:** Clean-slate monorepo. Firebase Cloud Functions (TypeScript) handle all server-side logic. Go CLI (Cobra + Bubble Tea + Lipgloss) provides the client interface. Next.js on Firebase Hosting for admin. Telegram Bot API for escalation notifications. Stripe for billing with hard cutoff.

**Tech Stack:** Go 1.22+, Bubble Tea v1, Lipgloss, Cobra | TypeScript, Firebase Cloud Functions v2, Firestore, Firebase Auth | Next.js 14, React | OpenAI Embeddings API, Claude API | Telegram Bot API | Stripe API

---

## File Structure

```
askkaya/
├── cli/                              # Go CLI (Bubble Tea + Cobra)
│   ├── go.mod
│   ├── go.sum
│   ├── main.go
│   ├── cmd/
│   │   ├── root.go
│   │   ├── auth.go
│   │   ├── query.go
│   │   ├── heartbeat.go
│   │   ├── skill.go
│   │   └── status.go
│   ├── internal/
│   │   ├── auth/
│   │   │   ├── client.go            # Firebase Auth REST API client
│   │   │   ├── keychain.go          # OS keychain token storage
│   │   │   ├── client_test.go
│   │   │   └── keychain_test.go
│   │   ├── api/
│   │   │   ├── client.go            # Firebase Functions HTTP client
│   │   │   └── client_test.go
│   │   ├── heartbeat/
│   │   │   ├── daemon.go            # Background health check
│   │   │   ├── launchd.go           # macOS launchd plist management
│   │   │   └── daemon_test.go
│   │   └── tui/
│   │       ├── app.go               # Root Bubble Tea model
│   │       ├── login.go             # Auth TUI
│   │       ├── query.go             # Query input + response display
│   │       ├── status.go            # Status display
│   │       ├── styles.go            # Lipgloss styles
│   │       └── app_test.go
│   └── Formula/
│       └── askkaya.rb               # Homebrew formula
│
├── firebase/
│   ├── functions/
│   │   ├── src/
│   │   │   ├── index.ts             # Cloud Functions exports
│   │   │   ├── api/
│   │   │   │   ├── query.ts         # POST /api/query handler
│   │   │   │   └── health.ts        # GET /api/health
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts          # Token verify + billing gate
│   │   │   ├── services/
│   │   │   │   ├── embeddings.ts    # OpenAI embedding generation
│   │   │   │   ├── rag.ts           # Two-tier KB retrieval
│   │   │   │   ├── generation.ts    # Claude API answer generation
│   │   │   │   └── tickets.ts       # Escalation ticket CRUD
│   │   │   ├── processing/
│   │   │   │   ├── webhook.ts       # GitHub webhook receiver
│   │   │   │   ├── parser.ts        # Markdown structure extraction
│   │   │   │   ├── chunker.ts       # Semantic text chunking
│   │   │   │   ├── embedder.ts      # Batch embedding generation
│   │   │   │   ├── articulator.ts   # LLM article generation
│   │   │   │   └── indexer.ts       # Firestore article storage
│   │   │   ├── billing/
│   │   │   │   ├── stripe.ts        # Stripe webhook handlers
│   │   │   │   ├── gate.ts          # Hard cutoff check
│   │   │   │   └── usage.ts         # Query usage tracking
│   │   │   └── notify/
│   │   │       ├── telegram.ts      # Telegram Bot API
│   │   │       ├── imessage.ts      # iMessage bridge
│   │   │       └── router.ts        # Channel priority routing
│   │   ├── __tests__/
│   │   │   ├── unit/
│   │   │   │   ├── auth.test.ts
│   │   │   │   ├── rag.test.ts
│   │   │   │   ├── generation.test.ts
│   │   │   │   ├── tickets.test.ts
│   │   │   │   ├── parser.test.ts
│   │   │   │   ├── chunker.test.ts
│   │   │   │   ├── telegram.test.ts
│   │   │   │   ├── router.test.ts
│   │   │   │   ├── stripe.test.ts
│   │   │   │   └── gate.test.ts
│   │   │   └── integration/
│   │   │       ├── query-pipeline.test.ts
│   │   │       ├── billing.test.ts
│   │   │       ├── kb-ingest.test.ts
│   │   │       └── escalation.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── firestore/
│   │   ├── firestore.rules
│   │   └── firestore.indexes.json
│   └── firebase.json
│
├── web/                              # Next.js admin dashboard
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Redirect to /dashboard
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── clients/
│   │   │   ├── page.tsx              # Client list
│   │   │   └── [clientId]/
│   │   │       └── page.tsx          # Client detail
│   │   ├── knowledge-base/
│   │   │   └── page.tsx
│   │   ├── escalations/
│   │   │   └── page.tsx
│   │   └── analytics/
│   │       └── page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   └── header.tsx
│   │   ├── clients/
│   │   │   ├── client-list.tsx
│   │   │   ├── client-form.tsx
│   │   │   └── client-card.tsx
│   │   ├── kb/
│   │   │   ├── article-list.tsx
│   │   │   ├── article-viewer.tsx
│   │   │   └── search-bar.tsx
│   │   ├── escalations/
│   │   │   ├── ticket-list.tsx
│   │   │   ├── ticket-detail.tsx
│   │   │   └── reply-form.tsx
│   │   └── analytics/
│   │       ├── query-chart.tsx
│   │       └── confidence-chart.tsx
│   ├── lib/
│   │   ├── firebase.ts              # Firebase client init
│   │   ├── firebase-admin.ts        # Server-side admin SDK
│   │   └── types.ts                 # Shared types
│   ├── __tests__/
│   │   ├── dashboard.test.tsx
│   │   ├── clients.test.tsx
│   │   ├── kb.test.tsx
│   │   └── escalations.test.tsx
│   ├── package.json
│   ├── next.config.js
│   └── tsconfig.json
│
├── config/
│   └── .env.example
├── docs/
│   ├── ARCHITECTURE.md
│   └── plans/
│       └── 2026-02-19-askkaya-implementation-plan.md  # (this file)
├── package.json                      # Monorepo root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Shared Types (used across Firebase + Web)

These types define the data contracts. Every phase references them.

```typescript
// Firestore document types

interface Client {
  id: string;
  name: string;
  email: string;
  api_key: string;
  billing_status: "active" | "suspended" | "cancelled";
  setup_context: string[];           // e.g. ["vapi", "make", "telegram"]
  created_at: Timestamp;
  monthly_query_limit: number;
  stripe_customer_id?: string;
}

interface KnowledgeArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  client_context: string[];          // tags for weighted retrieval
  source_refs: string[];             // originating files
  embedding: number[];               // OpenAI vector
  created_at: Timestamp;
  updated_at: Timestamp;
  auto_generated: boolean;
}

interface Escalation {
  id: string;
  client_id: string;
  client_name: string;
  query: string;
  context: string;                   // retrieved KB context that was insufficient
  status: "pending" | "answered" | "closed";
  kaya_response?: string;
  notification_channel?: string;
  created_at: Timestamp;
  answered_at?: Timestamp;
}

interface UsageRecord {
  client_id: string;
  month: string;                     // "2026-02"
  query_count: number;
  last_query_at: Timestamp;
}

interface QueryRequest {
  query: string;
}

interface QueryResponse {
  text: string;
  confidence: number;
  sources: string[];
  escalated: boolean;
}
```

---

## Firestore Collections

```
clients/{clientId}                    → Client document
knowledge_base/global/articles/{id}   → Global KB articles
knowledge_base/clients/{clientId}/articles/{id}  → Per-client KB articles
knowledge_base/clients/{clientId}/raw_dumps/{id} → Unprocessed ingested files
escalations/{ticketId}                → Escalation tickets
usage/{clientId}                      → Monthly usage records
query_logs/{logId}                    → Individual query audit trail
```

---

## API Endpoints

```
POST /api/query
  Headers: Authorization: Bearer <firebase-id-token>
           X-Client-ID: <client-id>
  Body:    { "query": "How do I configure VAPI webhooks?" }
  Returns: { "text": "...", "confidence": 0.92, "sources": [...], "escalated": false }

GET  /api/health
  Returns: { "status": "ok", "timestamp": "..." }

POST /api/webhook/github
  Headers: X-Hub-Signature-256: <signature>
  Body:    GitHub push event payload
  Returns: { "processed": 3, "skipped": 1 }

POST /api/webhook/stripe
  Headers: Stripe-Signature: <signature>
  Body:    Stripe event payload
  Returns: { "received": true }

POST /api/webhook/telegram
  Body:    Telegram update payload
  Returns: 200 OK
```

---

## Phase 1: Firebase Backend

**Goal:** Build the core query pipeline - auth, billing gate, RAG retrieval, LLM generation, escalation.

### Task 1.1: Firestore Schema and Security Rules

**Files:**
- Create: `firebase/firestore/firestore.rules`
- Create: `firebase/firestore/firestore.indexes.json`

**Step 1: Write security rules**

```
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: check if request comes from authenticated user
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: check if user is admin (custom claim)
    function isAdmin() {
      return isAuthenticated() && request.auth.token.admin == true;
    }

    // Helper: check if user owns this client record
    function isClientOwner(clientId) {
      return isAuthenticated() && request.auth.uid == clientId;
    }

    // Clients: admin full access, client can read own
    match /clients/{clientId} {
      allow read: if isClientOwner(clientId) || isAdmin();
      allow write: if isAdmin();
    }

    // Global KB: anyone authenticated can read, admin can write
    match /knowledge_base/global/articles/{articleId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Per-client KB: client can read own, admin can write
    match /knowledge_base/clients/{clientId}/articles/{articleId} {
      allow read: if isClientOwner(clientId) || isAdmin();
      allow write: if isAdmin();
    }

    // Raw dumps: admin only
    match /knowledge_base/clients/{clientId}/raw_dumps/{dumpId} {
      allow read, write: if isAdmin();
    }

    // Escalations: client can read own, admin full access
    match /escalations/{ticketId} {
      allow read: if isAuthenticated() &&
        (resource.data.client_id == request.auth.uid || isAdmin());
      allow create: if isAuthenticated();
      allow update: if isAdmin();
    }

    // Usage: client can read own, Cloud Functions write via admin SDK
    match /usage/{clientId} {
      allow read: if isClientOwner(clientId) || isAdmin();
      allow write: if false; // Only via admin SDK
    }

    // Query logs: admin only
    match /query_logs/{logId} {
      allow read: if isAdmin();
      allow write: if false; // Only via admin SDK
    }
  }
}
```

**Step 2: Write composite indexes**

```json
{
  "indexes": [
    {
      "collectionGroup": "articles",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "client_context", "arrayConfig": "CONTAINS" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "escalations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "client_id", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "escalations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Step 3: Commit**
```bash
git add firebase/firestore/
git commit -m "feat: add Firestore security rules and composite indexes"
```

---

### Task 1.2: Auth Middleware

**Files:**
- Test: `firebase/functions/__tests__/unit/auth.test.ts`
- Create: `firebase/functions/src/middleware/auth.ts`

**Step 1: Write failing tests**

Test these behaviors:
- Rejects requests with no Authorization header (401)
- Rejects requests with invalid Firebase ID token (401)
- Rejects requests with missing X-Client-ID header (400)
- Rejects requests where client document doesn't exist (404)
- Rejects requests where `billing_status !== "active"` (403, message: "Subscription inactive")
- Passes requests with valid token + active billing, attaches `client` to request context
- Records usage (increments query count for current month)

Key test pattern:
```typescript
import { authMiddleware } from "../../src/middleware/auth";

// Mock firebase-admin
jest.mock("firebase-admin", () => ({
  auth: () => ({
    verifyIdToken: jest.fn(),
  }),
  firestore: () => ({
    collection: jest.fn(),
  }),
}));

describe("authMiddleware", () => {
  it("rejects missing auth header with 401", async () => {
    const req = { headers: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authMiddleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects suspended client with 403", async () => {
    // ... setup with valid token but billing_status = "suspended"
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("inactive") })
    );
  });
});
```

**Step 2: Run test to verify failure**
```bash
cd firebase/functions && npx jest __tests__/unit/auth.test.ts --verbose
```
Expected: FAIL (module not found)

**Step 3: Implement auth middleware**

The middleware must:
1. Extract Bearer token from Authorization header
2. Verify token with `admin.auth().verifyIdToken(token)`
3. Extract client ID from X-Client-ID header
4. Fetch client document from Firestore
5. Check `billing_status === "active"` — if not, return 403 immediately (hard cutoff, no grace)
6. Attach client data to `req.client`
7. Increment usage counter for current month (fire-and-forget, don't block response)
8. Call `next()`

**Step 4: Run test to verify passes**
```bash
cd firebase/functions && npx jest __tests__/unit/auth.test.ts --verbose
```

**Step 5: Commit**
```bash
git add firebase/functions/src/middleware/ firebase/functions/__tests__/unit/auth.test.ts
git commit -m "feat: add auth middleware with billing gate hard cutoff"
```

---

### Task 1.3: Embedding Service

**Files:**
- Test: `firebase/functions/__tests__/unit/embeddings.test.ts`
- Create: `firebase/functions/src/services/embeddings.ts`

**Step 1: Write failing tests**

Test these behaviors:
- `generateEmbedding(text)` returns a number array (vector)
- `generateEmbeddings(texts[])` returns array of vectors (batch)
- `cosineSimilarity(a, b)` returns correct similarity score
- Handles empty text input gracefully
- Handles API errors with retry (1 retry, then throw)

**Step 2: Run test → FAIL**

**Step 3: Implement**

Use OpenAI's `text-embedding-3-small` model. Key function signatures:
```typescript
export async function generateEmbedding(text: string): Promise<number[]>
export async function generateEmbeddings(texts: string[]): Promise<number[][]>
export function cosineSimilarity(a: number[], b: number[]): number
```

Use `openai` npm package. API key from `process.env.OPENAI_API_KEY`.

**Step 4: Run test → PASS**

**Step 5: Commit**
```bash
git commit -m "feat: add OpenAI embedding service with batch support"
```

---

### Task 1.4: RAG Service

**Files:**
- Test: `firebase/functions/__tests__/unit/rag.test.ts`
- Create: `firebase/functions/src/services/rag.ts`

**Step 1: Write failing tests**

Test these behaviors:
- `retrieveContext(clientId, queryEmbedding)` searches both global and per-client KB
- Per-client articles get a 30% score boost over global articles
- Articles matching client's `setup_context` tags get additional weight
- Returns top-K results (K=5) sorted by relevance score
- Returns empty array when no articles match above threshold (0.3)
- Includes article title, summary, and content snippet in results
- Handles missing client KB gracefully (returns only global results)

Key types:
```typescript
interface RetrievalResult {
  articleId: string;
  title: string;
  summary: string;
  content: string;
  score: number;
  source: "global" | "client";
}

export async function retrieveContext(
  clientId: string,
  queryEmbedding: number[],
  setupContext: string[]
): Promise<RetrievalResult[]>
```

**Step 2-5: Standard TDD cycle + commit**

---

### Task 1.5: Generation Service

**Files:**
- Test: `firebase/functions/__tests__/unit/generation.test.ts`
- Create: `firebase/functions/src/services/generation.ts`

**Step 1: Write failing tests**

Test these behaviors:
- `generateResponse(query, context[])` returns `{ text, confidence, sources }`
- Confidence > 0.7: normal response
- Confidence 0.4-0.7: response with low confidence flag
- Confidence < 0.4: triggers escalation, returns "Let me check with Kaya" message
- Uses Claude API (claude-sonnet-4-5-20250929 for generation, claude-haiku-4-5-20251001 for classification)
- Intent classification rejects off-topic queries
- Sources array contains article IDs used in response
- Handles Claude API errors gracefully

Key function:
```typescript
export async function generateResponse(
  query: string,
  context: RetrievalResult[],
  clientName: string
): Promise<{
  text: string;
  confidence: number;
  sources: string[];
  shouldEscalate: boolean;
}>
```

System prompt pattern for generation:
```
You are AskKaya, a support assistant for {clientName}'s OpenClaw setup.
Answer questions using ONLY the provided context. If the context doesn't
contain enough information to answer confidently, say so.

Context:
{formatted context from RAG results}
```

**Step 2-5: Standard TDD cycle + commit**

---

### Task 1.6: Ticket Service

**Files:**
- Test: `firebase/functions/__tests__/unit/tickets.test.ts`
- Create: `firebase/functions/src/services/tickets.ts`

**Step 1: Write failing tests**

Test these behaviors:
- `createTicket(clientId, clientName, query, context)` creates escalation in Firestore with status "pending"
- `getTicket(ticketId)` returns ticket or null
- `answerTicket(ticketId, response)` updates status to "answered", stores response, sets answered_at
- `listPendingTickets()` returns tickets with status "pending" ordered by created_at DESC
- `closeTicket(ticketId)` sets status to "closed"
- Created ticket has auto-generated ID

**Step 2-5: Standard TDD cycle + commit**

---

### Task 1.7: Query Endpoint

**Files:**
- Test: `firebase/functions/__tests__/integration/query-pipeline.test.ts`
- Create: `firebase/functions/src/api/query.ts`
- Create: `firebase/functions/src/api/health.ts`
- Modify: `firebase/functions/src/index.ts`

**Step 1: Write failing integration test**

Test the full query pipeline against Firebase emulator:
1. Seed Firestore with a client (active billing) and KB articles (global + client-specific)
2. POST to `/api/query` with valid auth
3. Verify response contains text, confidence, sources
4. POST with a query that produces low confidence
5. Verify escalation ticket was created in Firestore
6. POST with suspended billing
7. Verify 403 rejection

Run with emulator:
```bash
firebase emulators:exec "npx jest __tests__/integration/query-pipeline.test.ts" --only firestore,auth
```

**Step 2: Run → FAIL**

**Step 3: Implement query handler**

Wire together: auth middleware → embed query → RAG retrieve → generate response → (optional) create escalation ticket → return response.

```typescript
// api/query.ts
import { onRequest } from "firebase-functions/v2/https";

export const query = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Auth middleware (inline or imported)
  const client = await authenticateAndAuthorize(req);

  const { query: userQuery } = req.body as QueryRequest;
  if (!userQuery?.trim()) {
    res.status(400).json({ error: "Query is required" });
    return;
  }

  // 1. Embed the query
  const queryEmbedding = await generateEmbedding(userQuery);

  // 2. RAG retrieval
  const context = await retrieveContext(
    client.id, queryEmbedding, client.setup_context
  );

  // 3. Generate response
  const result = await generateResponse(userQuery, context, client.name);

  // 4. Escalate if needed
  if (result.shouldEscalate) {
    await createTicket(client.id, client.name, userQuery,
      context.map(c => c.content).join("\n"));
  }

  // 5. Log query (fire-and-forget)
  logQuery(client.id, userQuery, result.confidence).catch(console.error);

  res.json({
    text: result.text,
    confidence: result.confidence,
    sources: result.sources,
    escalated: result.shouldEscalate,
  });
});
```

Also implement the health endpoint:
```typescript
export const health = onRequest((req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
```

Export both from `index.ts`.

**Step 4: Run integration tests → PASS**

**Step 5: Commit**
```bash
git commit -m "feat: add query endpoint wiring auth, RAG, generation, and escalation"
```

---

## Phase 2: Go CLI (Bubble Tea)

**Goal:** Build a Go CLI that authenticates with Firebase and queries the backend, with a Bubble Tea interactive mode.

### Task 2.1: Go Module + Cobra Root

**Files:**
- Create: `cli/go.mod`
- Create: `cli/main.go`
- Create: `cli/cmd/root.go`

**Step 1: Initialize Go module**
```bash
cd cli && go mod init github.com/askkaya/cli
```

**Step 2: Add dependencies**
```bash
go get github.com/spf13/cobra@latest
go get github.com/charmbracelet/bubbletea@latest
go get github.com/charmbracelet/lipgloss@latest
go get github.com/charmbracelet/bubbles@latest
go get github.com/zalando/go-keyring@latest
```

**Step 3: Create root command**

`cmd/root.go` - Cobra root with version flag, config path (`~/.config/askkaya/`).

`main.go` - Just calls `cmd.Execute()`.

**Step 4: Verify builds**
```bash
go build -o askkaya . && ./askkaya --help
```

**Step 5: Commit**

---

### Task 2.2: Auth Package (Firebase REST API)

**Files:**
- Test: `cli/internal/auth/client_test.go`
- Create: `cli/internal/auth/client.go`
- Test: `cli/internal/auth/keychain_test.go`
- Create: `cli/internal/auth/keychain.go`

**Step 1: Write failing tests for auth client**

Test these behaviors:
- `SignIn(email, password)` calls Firebase Identity Toolkit REST API, returns tokens
- `RefreshToken(refreshToken)` exchanges refresh token for new ID token
- `GetCurrentToken()` returns valid token or refreshes if expired
- Handles invalid credentials (returns descriptive error)
- Handles network errors

Firebase Auth REST endpoints:
- Sign in: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}`
- Refresh: `POST https://securetoken.googleapis.com/v1/token?key={API_KEY}`

```go
type AuthClient struct {
    APIKey     string
    HTTPClient *http.Client
}

type AuthTokens struct {
    IDToken      string
    RefreshToken string
    ExpiresIn    int
    ExpiresAt    time.Time
}

func (c *AuthClient) SignIn(email, password string) (*AuthTokens, error)
func (c *AuthClient) RefreshToken(refreshToken string) (*AuthTokens, error)
```

**Step 2: Write failing tests for keychain**

Test these behaviors:
- `StoreTokens(tokens)` saves to OS keychain under service "askkaya"
- `LoadTokens()` retrieves from keychain, returns error if not found
- `ClearTokens()` removes from keychain
- Token includes expiry time for refresh logic

```go
func StoreTokens(tokens *AuthTokens) error
func LoadTokens() (*AuthTokens, error)
func ClearTokens() error
```

Use `github.com/zalando/go-keyring` for cross-platform keychain access.

**Step 3-5: Implement, verify, commit**

---

### Task 2.3: API Client (Firebase Functions)

**Files:**
- Test: `cli/internal/api/client_test.go`
- Create: `cli/internal/api/client.go`

**Step 1: Write failing tests**

Test these behaviors:
- `Query(question)` sends POST to Firebase `/api/query` with auth headers, returns response
- `HealthCheck()` sends GET to `/api/health`, returns status
- Automatically refreshes token on 401 response (one retry)
- Returns structured error on 403 (billing suspended)
- Handles network timeouts (10s default)

```go
type APIClient struct {
    BaseURL    string
    ClientID   string
    Auth       *auth.AuthClient
    HTTPClient *http.Client
}

type QueryResponse struct {
    Text       string   `json:"text"`
    Confidence float64  `json:"confidence"`
    Sources    []string `json:"sources"`
    Escalated  bool     `json:"escalated"`
}

func (c *APIClient) Query(question string) (*QueryResponse, error)
func (c *APIClient) HealthCheck() error
```

**Step 2-5: Standard TDD cycle + commit**

---

### Task 2.4: Cobra Commands (auth, query, status)

**Files:**
- Create: `cli/cmd/auth.go`
- Create: `cli/cmd/query.go`
- Create: `cli/cmd/status.go`

**Step 1: Write failing tests for each command**

Test as CLI smoke tests:
- `askkaya auth login` prompts for email/password (or takes flags), authenticates, stores token
- `askkaya auth logout` clears stored tokens
- `askkaya query "How do I configure VAPI?"` sends query, prints formatted response
- `askkaya status` shows auth status, billing status, connectivity

**Step 2-5: Implement each command, verify, commit**

---

### Task 2.5: Bubble Tea Interactive TUI

**Files:**
- Test: `cli/internal/tui/app_test.go`
- Create: `cli/internal/tui/app.go`
- Create: `cli/internal/tui/login.go`
- Create: `cli/internal/tui/query.go`
- Create: `cli/internal/tui/status.go`
- Create: `cli/internal/tui/styles.go`

**Step 1: Write failing tests using teatest**

Test the TUI model:
- App starts on login screen if no stored token
- App starts on query screen if authenticated
- Login screen accepts email/password input, calls auth
- Query screen accepts text input, sends query, displays response
- Response display shows text, confidence indicator, sources
- Error states render correctly (network error, billing suspended)

```go
import (
    tea "github.com/charmbracelet/bubbletea"
    "github.com/charmbracelet/x/exp/teatest"
)

func TestQueryFlow(t *testing.T) {
    m := NewAppModel(mockAPIClient)
    tm := teatest.NewTestModel(t, m, teatest.WithInitialTermSize(80, 24))

    // Type a query
    tm.Type("How do I configure VAPI?")
    tm.Send(tea.KeyMsg{Type: tea.KeyEnter})

    // Wait for response
    teatest.WaitFor(t, tm.Output(), func(bts []byte) bool {
        return bytes.Contains(bts, []byte("confidence"))
    })
}
```

**Step 2: Implement TUI**

Lipgloss styles for:
- Response text (bordered box)
- Confidence indicator (green >0.7, yellow 0.4-0.7, red <0.4)
- Sources list (dimmed)
- Status badges (active=green, suspended=red)
- Error messages (red, bordered)

App model state machine:
```
LoginScreen → (auth success) → QueryScreen
QueryScreen → (submit query) → LoadingScreen → ResponseScreen
ResponseScreen → (new query) → QueryScreen
Any screen → (ctrl+c) → Quit
```

**Step 3-5: Verify tests, commit**

---

### Task 2.6: Heartbeat Daemon

**Files:**
- Test: `cli/internal/heartbeat/daemon_test.go`
- Create: `cli/internal/heartbeat/daemon.go`
- Create: `cli/internal/heartbeat/launchd.go`
- Create: `cli/cmd/heartbeat.go`

**Step 1: Write failing tests**

Test these behaviors:
- `Daemon.Start()` begins periodic health checks (configurable interval, default 5 min)
- `Daemon.Stop()` stops the loop
- Health check calls `/api/health` and reports connectivity
- Detects expired auth token and logs warning
- Detects suspended billing and logs warning
- `InstallLaunchd()` writes plist to `~/Library/LaunchAgents/`
- `UninstallLaunchd()` removes plist

**Step 2-5: Implement, verify, commit**

---

### Task 2.7: OpenClaw Skill Registration

**Files:**
- Create: `cli/cmd/skill.go`

**Step 1: Write failing test**

- `askkaya skill register` outputs skill definition JSON for OpenClaw
- `askkaya skill query "question"` accepts piped input (for OpenClaw invocation), returns JSON response

Skill definition format:
```json
{
  "name": "AskKaya",
  "description": "Ask Kaya about your OpenClaw setup",
  "usage": "skill:AskKaya <question>"
}
```

**Step 2-5: Implement, verify, commit**

---

## Phase 3: Knowledge Base Ingestion Pipeline

**Goal:** GitHub webhook → parse → chunk → embed → articulate → index into Firestore.

### Task 3.1: GitHub Webhook Receiver

**Files:**
- Test: `firebase/functions/__tests__/unit/webhook.test.ts`
- Create: `firebase/functions/src/processing/webhook.ts`

**Step 1: Write failing tests**

Test these behaviors:
- Verifies GitHub webhook signature (X-Hub-Signature-256 header) using HMAC-SHA256
- Rejects requests with invalid signature (401)
- Parses push event payload, extracts added/modified .md files
- Ignores non-.md files
- Ignores deleted files (only processes additions and modifications)
- Returns list of file paths to process
- Maps file paths to client IDs based on directory structure:
  - `global/` → global KB
  - `clients/{clientName}/` → per-client KB

```typescript
export async function handleGitHubWebhook(
  req: Request
): Promise<{ files: FileToProcess[]; skipped: number }>

interface FileToProcess {
  path: string;
  content: string;    // fetched from GitHub API
  target: "global" | { clientId: string };
}
```

**Step 2-5: TDD cycle + commit**

---

### Task 3.2: Markdown Parser

**Files:**
- Test: `firebase/functions/__tests__/unit/parser.test.ts`
- Create: `firebase/functions/src/processing/parser.ts`

**Step 1: Write failing tests**

Test these behaviors:
- Extracts frontmatter (YAML) if present
- Extracts headings hierarchy
- Identifies call transcript format (date, participants, notes)
- Identifies setup notes format (configuration blocks, steps)
- Returns structured representation:

```typescript
interface ParsedDocument {
  title: string;
  frontmatter: Record<string, string>;
  sections: Section[];
  documentType: "transcript" | "setup_notes" | "documentation" | "general";
}

interface Section {
  heading: string;
  level: number;
  content: string;
}

export function parseMarkdown(content: string, filename: string): ParsedDocument
```

**Step 2-5: TDD cycle + commit**

---

### Task 3.3: Semantic Chunker

**Files:**
- Test: `firebase/functions/__tests__/unit/chunker.test.ts`
- Create: `firebase/functions/src/processing/chunker.ts`

**Step 1: Write failing tests**

Test these behaviors:
- Splits parsed document into chunks of ~500 tokens (measured by rough word count / 0.75)
- Preserves section boundaries (doesn't split mid-section unless section is too long)
- Each chunk includes its heading context (breadcrumb: "Setup > VAPI > Webhooks")
- Overlaps chunks by ~50 tokens for context continuity
- Handles very short documents (returns single chunk)
- Handles very long sections (splits at paragraph boundaries)

```typescript
interface Chunk {
  text: string;
  headingContext: string;   // "Setup > VAPI > Webhooks"
  index: number;
  totalChunks: number;
  sourceRef: string;        // original filename
}

export function chunkDocument(doc: ParsedDocument, sourceRef: string): Chunk[]
```

**Step 2-5: TDD cycle + commit**

---

### Task 3.4: Batch Embedder

**Files:**
- Test: `firebase/functions/__tests__/unit/embedder.test.ts`  (can reuse embeddings service)
- Create: `firebase/functions/src/processing/embedder.ts`

**Step 1: Write failing tests**

- `embedChunks(chunks[])` generates embeddings for all chunks
- Batches API calls (max 20 texts per batch to stay within API limits)
- Returns chunks with embeddings attached
- Handles partial failures (retries failed batch, throws after 2 attempts)

```typescript
interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]>
```

**Step 2-5: TDD cycle + commit**

---

### Task 3.5: Article Articulator

**Files:**
- Test: `firebase/functions/__tests__/unit/articulator.test.ts`
- Create: `firebase/functions/src/processing/articulator.ts`

**Step 1: Write failing tests**

Test these behaviors:
- Takes embedded chunks from same source, generates a structured KB article via LLM
- Article has: title, summary (1-2 sentences), content (clean, structured), client_context tags
- Uses Claude Haiku for speed/cost
- Groups related chunks before articulation
- Handles LLM errors gracefully

```typescript
export async function articulateArticle(
  chunks: EmbeddedChunk[],
  sourceRef: string
): Promise<Omit<KnowledgeArticle, "id" | "created_at" | "updated_at">>
```

System prompt:
```
You are a technical writer creating a knowledge base article from raw notes/transcripts.
Create a clear, structured article with:
- A descriptive title
- A 1-2 sentence summary
- Well-organized content with headers
- Relevant client_context tags (e.g., "vapi", "make", "telegram", "webhook")

Source material:
{chunks joined with context}
```

**Step 2-5: TDD cycle + commit**

---

### Task 3.6: Indexer

**Files:**
- Test: `firebase/functions/__tests__/unit/indexer.test.ts`
- Create: `firebase/functions/src/processing/indexer.ts`

**Step 1: Write failing tests**

- `indexArticle(article, target)` stores article in correct Firestore collection
  - target "global" → `knowledge_base/global/articles/{id}`
  - target `{ clientId }` → `knowledge_base/clients/{clientId}/articles/{id}`
- Generates a unique article ID from title slug + timestamp
- Stores embedding as array field
- Updates existing article if source_ref matches (upsert behavior)
- Stores raw dump in `raw_dumps/` subcollection

```typescript
export async function indexArticle(
  article: KnowledgeArticle,
  target: "global" | { clientId: string }
): Promise<string>  // returns article ID
```

**Step 2-5: TDD cycle + commit**

---

### Task 3.7: Full Pipeline Integration

**Files:**
- Test: `firebase/functions/__tests__/integration/kb-ingest.test.ts`
- Modify: `firebase/functions/src/index.ts` (export webhook function)

**Step 1: Write integration test**

Against Firebase emulator:
1. Simulate GitHub webhook push event with a .md file
2. Verify webhook handler processes it
3. Verify article appears in Firestore with correct collection (global or client)
4. Verify article has embedding, title, summary, content
5. Verify RAG retrieval finds the new article when querying related topic

**Step 2-5: Wire the pipeline (webhook → parse → chunk → embed → articulate → index), verify, commit**

---

## Phase 4: Notifications (Telegram + iMessage)

**Goal:** When an escalation ticket is created, notify Kaya via Telegram. When she replies, auto-learn the answer into the KB.

### Task 4.1: Telegram Bot

**Files:**
- Test: `firebase/functions/__tests__/unit/telegram.test.ts`
- Create: `firebase/functions/src/notify/telegram.ts`

**Step 1: Write failing tests**

Test these behaviors:
- `formatEscalationAlert(escalation)` returns formatted Telegram message:
  ```
  🔔 New AskKaya Escalation

  Client: {name}
  Query: "{query}"
  Context: {setup_context tags}

  Reply to this message to answer.
  ```
- `sendMessage(chatId, text)` calls Telegram Bot API `sendMessage` endpoint
- `handleTelegramUpdate(update)` processes reply messages:
  - If reply_to_message matches an escalation alert, extract the answer
  - Call `answerTicket(ticketId, answer)`
  - Trigger auto-learn (store answer as KB article)
  - Send confirmation: "✅ Answer recorded and added to KB"
- Handles Telegram API errors with retry (1 retry)

Telegram Bot API base: `https://api.telegram.org/bot{TOKEN}/`
Env var: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

**Step 2-5: TDD cycle + commit**

---

### Task 4.2: iMessage Bridge

**Files:**
- Test: `firebase/functions/__tests__/unit/imessage.test.ts` (minimal - this is macOS-only)
- Create: `firebase/functions/src/notify/imessage.ts`

This is a fallback channel. Implementation uses AppleScript via a companion process on Kaya's Mac, or Shortcuts automation. For the Cloud Function side, just implement an HTTP call to a configurable webhook URL that the local bridge exposes.

```typescript
export async function sendIMMessage(phoneNumber: string, message: string): Promise<boolean>
```

**Step 1-5: Write test, implement webhook caller, commit**

---

### Task 4.3: Notification Router

**Files:**
- Test: `firebase/functions/__tests__/unit/router.test.ts`
- Create: `firebase/functions/src/notify/router.ts`

**Step 1: Write failing tests**

Test these behaviors:
- `sendNotification(escalation)` tries channels in priority order: telegram → imessage → email
- If primary succeeds, doesn't try fallbacks
- If primary fails, tries next channel
- Records which channel was used on the escalation document
- Returns success/failure

```typescript
export async function sendNotification(escalation: Escalation): Promise<{
  sent: boolean;
  channel: string;
}>
```

**Step 2-5: TDD cycle + commit**

---

### Task 4.4: Firestore Trigger + Auto-Learn

**Files:**
- Test: `firebase/functions/__tests__/integration/escalation.test.ts`
- Modify: `firebase/functions/src/index.ts`

**Step 1: Write integration test**

Against emulator:
1. Create an escalation ticket in Firestore
2. Verify notification trigger fires
3. Simulate Telegram reply (call webhook handler with reply payload)
4. Verify ticket status updated to "answered"
5. Verify new KB article created from the answer
6. Verify the answer is retrievable via RAG

**Step 2: Implement Firestore onCreate trigger**

```typescript
import { onDocumentCreated } from "firebase-functions/v2/firestore";

export const onEscalationCreated = onDocumentCreated(
  "escalations/{ticketId}",
  async (event) => {
    const escalation = event.data?.data() as Escalation;
    await sendNotification(escalation);
  }
);
```

**Step 3: Implement auto-learn pipeline**

When `answerTicket()` is called:
1. Take the answer text
2. Create a KB article: title from query, content from answer
3. Generate embedding
4. Index in the client's KB collection
5. This ensures the same question won't escalate next time

**Step 4-5: Verify, commit**

---

## Phase 5: Web Dashboard (Next.js)

**Goal:** Admin dashboard on Firebase Hosting for managing clients, KB, escalations, and analytics.

### Task 5.1: Next.js Setup

**Files:**
- Create: `web/package.json`
- Create: `web/next.config.js`
- Create: `web/tsconfig.json`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/lib/firebase.ts`
- Create: `web/lib/firebase-admin.ts`

**Step 1: Initialize Next.js**
```bash
cd web && npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*"
```

**Step 2: Add Firebase dependencies**
```bash
pnpm add firebase firebase-admin
```

**Step 3: Configure Firebase client + admin SDK**

`lib/firebase.ts` - client-side Firebase init (for auth)
`lib/firebase-admin.ts` - server-side admin SDK (for Firestore access in Server Components)

**Step 4: Create layout with sidebar navigation**

Sidebar links: Dashboard, Clients, Knowledge Base, Escalations, Analytics

**Step 5: Commit**

---

### Task 5.2: Auth + Login Page

**Files:**
- Test: `web/__tests__/login.test.tsx`
- Create: `web/app/login/page.tsx`
- Create: `web/middleware.ts` (route protection)

Admin login via Firebase Auth. Protect all routes except `/login`. Check for `admin: true` custom claim.

**Step 1-5: TDD cycle + commit**

---

### Task 5.3: Dashboard Page

**Files:**
- Test: `web/__tests__/dashboard.test.tsx`
- Create: `web/app/dashboard/page.tsx`

**Step 1: Write failing tests**

- Renders recent query count (last 24h)
- Renders active escalation count
- Renders client count
- Renders billing summary (active vs suspended)

**Step 2-5: Implement as Server Component fetching from Firestore, commit**

---

### Task 5.4: Client Management

**Files:**
- Test: `web/__tests__/clients.test.tsx`
- Create: `web/app/clients/page.tsx`
- Create: `web/app/clients/[clientId]/page.tsx`
- Create: `web/components/clients/client-list.tsx`
- Create: `web/components/clients/client-form.tsx`

**Step 1: Write failing tests**

- Client list shows all clients with name, status, setup_context tags
- Client detail shows full info + per-client KB article count + recent queries
- Create client form with name, email, setup_context tags
- Edit client updates Firestore document

**Step 2-5: Implement, verify, commit**

---

### Task 5.5: KB Browser

**Files:**
- Test: `web/__tests__/kb.test.tsx`
- Create: `web/app/knowledge-base/page.tsx`
- Create: `web/components/kb/article-list.tsx`
- Create: `web/components/kb/article-viewer.tsx`
- Create: `web/components/kb/search-bar.tsx`

**Step 1: Write failing tests**

- Lists all articles (global + per-client) with title, summary, source
- Search filters by title/content text match
- Filter by client or global
- Article viewer shows full content with metadata
- "Re-process" button triggers re-indexing of source file

**Step 2-5: Implement, verify, commit**

---

### Task 5.6: Escalation Queue

**Files:**
- Test: `web/__tests__/escalations.test.tsx`
- Create: `web/app/escalations/page.tsx`
- Create: `web/components/escalations/ticket-list.tsx`
- Create: `web/components/escalations/ticket-detail.tsx`
- Create: `web/components/escalations/reply-form.tsx`

**Step 1: Write failing tests**

- Lists escalation tickets filtered by status (pending/answered/closed)
- Ticket detail shows client name, query, context, timestamps
- Reply form allows admin to type answer
- Submitting reply: updates ticket status, triggers auto-learn to KB
- Close button marks ticket as closed

**Step 2-5: Implement, verify, commit**

---

### Task 5.7: Analytics Page

**Files:**
- Test: `web/__tests__/analytics.test.tsx`  (minimal)
- Create: `web/app/analytics/page.tsx`
- Create: `web/components/analytics/query-chart.tsx`
- Create: `web/components/analytics/confidence-chart.tsx`

**Step 1: Write failing tests**

- Renders query volume chart (queries per day, last 30 days)
- Renders confidence distribution (histogram)
- Renders escalation rate (% of queries that escalated)
- Renders top queried topics

**Step 2-5: Implement with simple chart library (recharts), verify, commit**

---

## Phase 6: Stripe Billing Integration

**Goal:** Hard cutoff billing - Stripe webhook handlers update Firestore billing status, query middleware enforces immediately.

### Task 6.1: Stripe Webhook Handlers

**Files:**
- Test: `firebase/functions/__tests__/unit/stripe.test.ts`
- Create: `firebase/functions/src/billing/stripe.ts`

**Step 1: Write failing tests**

Test these behaviors:
- Verifies Stripe webhook signature using `stripe.webhooks.constructEvent()`
- `invoice.paid` → sets client `billing_status = "active"`
- `invoice.payment_failed` → sets client `billing_status = "suspended"` immediately (NO grace period)
- `customer.subscription.deleted` → sets client `billing_status = "cancelled"`
- Maps Stripe customer ID to client ID via `stripe_customer_id` field
- Ignores unknown event types (returns 200)
- Rejects invalid signatures (400)

```typescript
export async function handleStripeWebhook(req: Request): Promise<{ received: boolean }>
```

**Step 2-5: TDD cycle + commit**

---

### Task 6.2: Billing Gate

**Files:**
- Test: `firebase/functions/__tests__/unit/gate.test.ts`
- Create: `firebase/functions/src/billing/gate.ts`

**Step 1: Write failing tests**

This may already be covered by the auth middleware in Phase 1. If so, this task is about:
- Extracting billing gate into its own module for reuse
- Adding quota check (monthly query limit)
- `checkBilling(clientId)` returns `{ allowed: boolean, reason?: string }`
- Quota exceeded returns: "Monthly query limit reached"
- Suspended returns: "Subscription inactive"

**Step 2-5: TDD cycle + commit**

---

### Task 6.3: Usage Tracking + Quota Reset

**Files:**
- Test: `firebase/functions/__tests__/unit/usage.test.ts`
- Create: `firebase/functions/src/billing/usage.ts`
- Modify: `firebase/functions/src/index.ts` (add scheduled function)

**Step 1: Write failing tests**

- `recordUsage(clientId)` increments query count for current month
- `getUsage(clientId)` returns current month's usage
- `resetMonthlyQuotas()` resets all usage records (scheduled function)
- Usage document key format: `{clientId}` with field `months.{YYYY-MM}.count`

**Step 2: Implement**

Scheduled function:
```typescript
import { onSchedule } from "firebase-functions/v2/scheduler";

export const resetMonthlyQuotas = onSchedule("0 0 1 * *", async () => {
  // First of each month, reset counters
  // Or: just let the month key naturally roll over
});
```

**Step 3-5: Verify, commit**

---

### Task 6.4: Billing Integration Test

**Files:**
- Test: `firebase/functions/__tests__/integration/billing.test.ts`

**Step 1: Write integration test against emulator**

1. Create a client with `billing_status: "active"` and `monthly_query_limit: 10`
2. Send a query → verify it succeeds
3. Simulate `invoice.payment_failed` Stripe webhook
4. Verify client `billing_status` is now "suspended"
5. Send another query → verify 403 rejection with "Subscription inactive"
6. Simulate `invoice.paid` Stripe webhook
7. Verify client `billing_status` is now "active"
8. Send query → verify it succeeds again
9. Send 10 queries to exhaust quota
10. Send 11th query → verify rejection with "Monthly query limit reached"

**Step 2-5: Run, fix any issues, commit**

---

## Integration Testing

**Goal:** Full end-to-end test across all components.

### Task INT.1: E2E Integration Test

**Files:**
- Create: `tests/e2e/full-pipeline.test.ts` (or shell script)

**Steps to test (against Firebase emulator):**

1. **Setup:** Seed Firestore with a client (active billing, setup_context: ["vapi"]) and global KB articles
2. **CLI Auth:** Run `askkaya auth login` with test credentials against emulator
3. **Query (high confidence):** `askkaya query "How do I set up VAPI webhooks?"` → verify response with sources
4. **Query (low confidence):** `askkaya query "What's the weather?"` → verify "Let me check with Kaya" response
5. **Escalation created:** Verify escalation ticket exists in Firestore with status "pending"
6. **Notification sent:** Verify Telegram notification was triggered (mock or check logs)
7. **Reply + auto-learn:** Simulate Telegram reply, verify ticket updated and new KB article created
8. **KB ingestion:** Push a .md file via webhook, verify article appears in Firestore
9. **Web dashboard:** Verify dashboard page renders (build + serve, check HTTP 200)
10. **Billing cutoff:** Suspend client, verify query rejected with 403

---

## Polish

- Tighten Firestore rules to least-privilege
- Tune RAG parameters: similarity threshold (0.3), top-K (5), client boost (30%)
- Tune confidence thresholds: escalation (0.65), critical (0.4)
- Add rate limiting to query endpoint (100 req/min per client)
- Verify PII redaction in responses (no email/phone in generated text)
- Add structured logging (JSON format for Cloud Logging)
- Clean up TODO comments

---

## Release

- Firebase deployment config (functions, firestore rules, hosting)
- Go CLI cross-compilation: `GOOS=darwin GOARCH=arm64`, `GOOS=darwin GOARCH=amd64`, `GOOS=linux GOARCH=amd64`
- Homebrew tap repository setup + formula
- Environment variable checklist (all required secrets)
- Operator runbook:
  - Onboarding a new client
  - Billing lifecycle (Stripe setup → active → suspended → reactivated)
  - Escalation workflow (ticket created → notified → answered → auto-learned)
  - KB management (adding articles, re-indexing, troubleshooting)

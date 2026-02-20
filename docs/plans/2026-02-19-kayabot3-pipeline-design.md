# kayabot3 Pipeline Design

> Expanded Mammoth pipeline for full AskKaya build from clean slate.

## Decisions

- **Clean slate** - new working directory, not building on kayatest
- **CLI in Go** - Cobra + Bubble Tea TUI + Lipgloss styling
- **Firebase backend** - Cloud Functions, Firestore, Auth
- **Next.js web dashboard** - on Firebase Hosting
- **Sequential phases** - one component at a time
- **TDD per phase** - write tests first, implement to pass, verify

## Pipeline Shape

Each component follows a TDD cycle:

```
test_X → implement_X → verify_X → verify_X_ok
                                      ↓ fail → test_X (retry, max 3)
                                      ↓ pass → next phase
```

Full flow:

```
start → plan → setup
  → test_firebase → impl_firebase → verify_firebase → verify_firebase_ok
  → test_cli → impl_cli → verify_cli → verify_cli_ok
  → test_kb → impl_kb → verify_kb → verify_kb_ok
  → test_notify → impl_notify → verify_notify → verify_notify_ok
  → test_web → impl_web → verify_web → verify_web_ok
  → test_billing → impl_billing → verify_billing → verify_billing_ok
  → integration_test → polish → release → done
```

## Phase Details

### Phase 1: Firebase Backend
- **Tests:** Auth middleware, Firestore security rules, query endpoint handler, RAG service
- **Implement:** Cloud Functions (query, healthCheck, resetQuotas), Firestore schema + hardened rules, embedding service, generation service, ticket service

### Phase 2: Go CLI
- **Tests:** Auth flow, query command, Bubble Tea TUI model, heartbeat daemon, OpenClaw skill registration
- **Implement:** Go CLI (Cobra + Bubble Tea + Lipgloss), interactive TUI mode, Firebase Auth integration, keychain credential storage, heartbeat service (launchd), OpenClaw skill wrapper

### Phase 3: KB Ingestion Pipeline
- **Tests:** GitHub webhook handler, markdown parser, chunker, embedder, article generator, indexer
- **Implement:** GitHub webhook Cloud Function, parse/chunk/embed/articulate/index pipeline, global + per-client KB structure

### Phase 4: Notifications
- **Tests:** Telegram message formatting/sending, escalation routing, fallback chain
- **Implement:** Telegram bot for escalation alerts, iMessage bridge fallback, notification channel priority

### Phase 5: Web Dashboard
- **Tests:** Dashboard routes, client CRUD, KB browser, escalation queue UI
- **Implement:** Next.js app on Firebase Hosting, admin dashboard with KB preview, client management, escalation queue

### Phase 6: Billing
- **Tests:** Hard cutoff behavior, Stripe webhook handlers (invoice.paid, payment_failed, subscription.deleted), quota enforcement
- **Implement:** Stripe integration, webhook handlers, billing status lifecycle, usage analytics

### Integration Test
- Full E2E: CLI authenticates → sends query → Firebase processes (auth, billing, RAG, generation) → response returns → low confidence triggers escalation → Telegram notified → web dashboard shows ticket

### Polish
- Tighten security rules, improve RAG weighting, adjust confidence thresholds, harden error handling

### Release
- Firebase deploy plan, Go CLI binary distribution (Homebrew tap/formula), environment variable checklist, operator runbook

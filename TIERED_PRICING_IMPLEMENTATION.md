# Tiered Pricing Implementation Summary

## Overview
Complete implementation of tiered pricing with Telegram reply → Email user notification flow.

## What Was Implemented

### 1. User Notification System
**File:** `firebase/functions/src/notify/user-notification.ts`
- Sends email to users when their escalations are answered
- Includes question, answer, and CLI command to view more
- Tracks notification status in Firestore

### 2. Firestore Trigger
**File:** `firebase/functions/src/index.ts` (lines 97-141)
- `onEscalationAnswered` - Triggers when escalation status changes to 'answered'
- Calls `notifyUserOfAnswer()` to send email notification
- Automatically fires when you reply via Telegram

### 3. Credit System
**File:** `firebase/functions/src/api/query.ts`
- Added client type differentiation (`retainer` vs `pay_per_query`)
- Credit balance checking before queries
- Credit deduction after query completion:
  - **KB queries**: 1 credit (low cost, automated)
  - **Human queries**: 5 credits (high cost, you responded)

### 4. CLI Error Handling
**File:** `cli/cmd/query.go` (lines 100-109)
- Added `insufficient_credits` error handling
- Shows user-friendly message with contact info
- Directs to credits purchase page

### 5. Backend API Error Response
**File:** `firebase/functions/src/index.ts` (lines 238-246)
- Returns 402 status code for insufficient credits
- Proper error message for CLI to display

### 6. Escalations API
**File:** `firebase/functions/src/api/escalations.ts`
- `getEscalations(clientId, pendingOnly)` - List user's escalations
- `getEscalation(escalationId, clientId)` - Get specific escalation
- Authorization: users can only see their own escalations

### 7. Escalations HTTP Endpoint
**File:** `firebase/functions/src/index.ts` (lines 249-307)
- `GET /escalationsApi?pending=true` - List escalations
- `GET /escalationsApi/{id}` - View specific escalation
- Authenticated with Firebase ID token + Client ID header

### 8. CLI Escalations Command
**File:** `cli/cmd/escalations.go`
- `askkaya escalations` - List all escalations
- `askkaya escalations --pending` - Show only unanswered
- `askkaya escalations view {id}` - View full details
- Pretty formatting with status icons (⏳ Pending, ✅ Answered)

### 9. API Client Methods
**File:** `cli/internal/api/client.go`
- `GetEscalations(pendingOnly bool)` - Fetch escalations list
- `GetEscalation(id string)` - Fetch specific escalation
- Includes Escalation struct with all fields

### 10. Command Registration
**File:** `cli/cmd/root.go`
- Registered `escalationsCmd` as user-facing command
- Available to all authenticated users

## Complete User Flow

### For Human-Required Queries (5 credits)

```
1. User: askkaya query "How do I configure X?"
   ↓
2. System: RAG → Low confidence → Create escalation
   CLI shows: "📬 Kaya will get back to you shortly!"
   Status: pending
   ↓
3. Telegram → Kaya
   "🚨 Escalation [ID:a3f7d2e1]
    Client: Ben Syverson
    Query: How do I configure X?"
   ↓
4. Kaya replies in Telegram (reply to message)
   "You need to configure Y in the settings..."
   ↓
5. Telegram Webhook → Firebase Function
   - Extracts escalation ID from original message
   - Calls answerTicket(escalationId, answer)
   - Updates Firestore: status → 'answered'
   ↓
6. Firestore Trigger fires (onEscalationAnswered)
   - Detects escalation.status → 'answered'
   - Calls notifyUserOfAnswer()
   - Sends email to user
   - Deducts 5 credits (human query cost)
   ↓
7. Email → User
   Subject: "✅ Your AskKaya question has been answered"
   Body: Question + Your answer + CLI command
   ↓
8. User can view in CLI:
   askkaya escalations
   askkaya escalations view a3f7d2e1
```

### For KB Queries (1 credit)

```
1. User: askkaya query "What is OpenClaw?"
   ↓
2. System: RAG → High confidence → KB answers directly
   CLI shows answer immediately
   ↓
3. System deducts 1 credit (KB query cost)
```

## Client Schema Changes

Add to `clients` collection:

```typescript
{
  // Existing fields...
  client_type: 'retainer' | 'pay_per_query',  // NEW

  // For pay-per-query users only:
  credits: {
    balance: number,              // Current credit balance
    trial_credits_given: number,  // How many trial credits they got
    trial_credits_used: boolean,  // Have they used their trial?
  },

  // Pricing config:
  kb_query_cost: number,      // Credits per KB query (default: 1)
  human_query_cost: number,   // Credits per escalated query (default: 5)
}
```

## Escalation Schema Updates

The escalations collection now tracks:

```typescript
{
  // Existing fields...
  answer: string,                    // Your answer (added by Telegram reply)
  answeredAt: Timestamp,             // When you answered
  status: 'pending' | 'answered' | 'dismissed',
  user_notified: boolean,            // Email sent?
  user_notified_at: Timestamp,       // When email was sent
}
```

## Setting Up a New Pay-Per-Query User

When provisioning a new pay-per-query user (like Ben):

```typescript
{
  name: 'Ben Syverson',
  email: 'ben@example.com',
  client_type: 'pay_per_query',      // NEW
  credits: {
    balance: 10,                      // 10 trial credits
    trial_credits_given: 10,
    trial_credits_used: false,
  },
  kb_query_cost: 1,                   // 1 credit per KB query
  human_query_cost: 5,                // 5 credits per human query
  billing_status: 'active',           // Not checked for pay-per-query
  setup_context: ['general'],
  created_at: serverTimestamp(),
}
```

## Testing the Flow

### Test 1: Telegram Reply → Email User
1. Create test escalation in Firestore (or trigger one via low-confidence query)
2. Reply to Telegram message with answer
3. Verify email is sent to user
4. Check Firestore: `user_notified: true`, `user_notified_at` set

### Test 2: Credit Deduction
1. Set up test user with 10 credits
2. Run KB query (high confidence) → should deduct 1 credit
3. Run human query (low confidence) → should deduct 5 credits
4. Run query with 0 credits → should show "Out of credits!" error

### Test 3: CLI Escalations Command
1. `askkaya escalations` → List all
2. `askkaya escalations --pending` → Only pending
3. `askkaya escalations view {id}` → View full details

## Files Created
- `firebase/functions/src/notify/user-notification.ts`
- `firebase/functions/src/api/escalations.ts`
- `cli/cmd/escalations.go`
- `TIERED_PRICING_IMPLEMENTATION.md` (this file)

## Files Modified
- `firebase/functions/src/index.ts` - Added trigger + endpoint
- `firebase/functions/src/api/query.ts` - Credit system
- `cli/cmd/query.go` - Error handling
- `cli/cmd/root.go` - Command registration
- `cli/internal/api/client.go` - API methods

## Next Steps
1. Deploy Firebase Functions: `cd firebase/functions && npm run deploy`
2. Build CLI: `cd cli && go build`
3. Test the complete flow
4. Create admin command to provision pay-per-query users
5. Create credits purchase flow (Stripe integration)
6. Add credits balance to `askkaya status` command

## Pricing Tiers Summary

| Client Type      | Billing Model  | KB Query Cost | Human Query Cost |
|------------------|----------------|---------------|------------------|
| Retainer         | Subscription   | Unlimited     | Unlimited        |
| Pay-Per-Query    | Credits        | 1 credit      | 5 credits        |

Trial: New pay-per-query users get 10 free credits to start.

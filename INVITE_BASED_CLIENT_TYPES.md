# Invite-Based Client Type System

## Overview
Invite codes now determine the client type (retainer vs pay-per-query) automatically during signup.

## The Flow

### Admin Creates Invite Code

```bash
# For retainer client (subscription-based)
askkaya invite generate --type retainer

# For pay-per-query client (credit-based)
askkaya invite generate --type pay_per_query --trial-credits 10

# Multiple codes
askkaya invite generate -n 5 --type pay_per_query --trial-credits 20
```

### User Signs Up

```bash
askkaya auth signup
# Enter invite code: ABC12345
# Enter email: ben@example.com
# Enter password: ********

# System automatically creates the right client type!
```

### What Happens Behind the Scenes

**For Retainer Invite:**
```typescript
{
  client_type: 'retainer',
  billing_status: 'pending',  // Must complete Stripe payment
  // No credits field
}
```

**For Pay-Per-Query Invite:**
```typescript
{
  client_type: 'pay_per_query',
  billing_status: 'active',  // Active immediately!
  credits: {
    balance: 10,             // Trial credits from invite
    trial_credits_given: 10,
    trial_credits_used: false,
  },
  kb_query_cost: 1,
  human_query_cost: 5,
}
```

## Complete User Journeys

### Journey 1: Retainer Client (Ben - Existing Customer)

```
1. You (Admin):
   askkaya invite generate --type retainer
   → Code: ABC12345

2. Send code to Ben via email/Slack

3. Ben:
   askkaya auth signup
   → Enter code: ABC12345
   → Creates account (billing_status: pending)

4. Ben gets payment link email
   → Completes Stripe subscription

5. Stripe webhook → billing_status: active

6. Ben can query (unlimited):
   askkaya query "anything"
   → No credit deduction
```

### Journey 2: Pay-Per-Query Client (New Customer)

```
1. You (Admin):
   askkaya invite generate --type pay_per_query --trial-credits 10
   → Code: XYZ67890

2. Send code to new customer

3. New customer:
   askkaya auth signup
   → Enter code: XYZ67890
   → Creates account (billing_status: active, 10 credits)

4. Can query immediately (no payment required!):
   askkaya query "question 1"  → -1 credit (9 left)
   askkaya query "question 2"  → -1 credit (8 left)
   ...
   askkaya query "question 11" → Error: Out of credits!

5. Customer purchases more:
   askkaya credits buy
   → Stripe one-time payment
   → +50/100/250 credits

6. Continue querying:
   askkaya query "question 12"  → Success!
```

## Admin Commands Reference

### Generate Invite Codes

```bash
# Retainer client
askkaya invite generate --type retainer

# Pay-per-query with custom trial credits
askkaya invite generate --type pay_per_query --trial-credits 25

# Batch generation
askkaya invite generate -n 10 --type pay_per_query

# With expiration
askkaya invite generate --type retainer --expires 30  # 30 days

# With note
askkaya invite generate --type pay_per_query --note "For Betaworks cohort"
```

### Invite Code Types Comparison

| Parameter | Retainer | Pay-Per-Query |
|-----------|----------|---------------|
| `--type` | `retainer` | `pay_per_query` |
| `--trial-credits` | N/A | Default: 10 |
| Billing Status | `pending` (needs payment) | `active` (immediate) |
| Query Cost | Unlimited | 1-5 credits per query |
| Revenue Model | Subscription | One-time purchases |

## Implementation Changes

### Backend

**File:** `firebase/functions/src/api/invite.ts`
- Added `client_type` and `trial_credits` to InviteCode interface
- `createInviteCode()` accepts clientType and trialCredits
- `signupWithInvite()` reads invite type and creates client accordingly

**File:** `firebase/functions/src/index.ts`
- `generateInviteApi` endpoint accepts client_type and trial_credits
- Returns client_type in response

### CLI

**File:** `cli/cmd/invite.go`
- Added `--type` flag (retainer | pay_per_query)
- Added `--trial-credits` flag (default: 10)
- Updated help text and examples
- Pretty-printed output shows client type

## Database Schema

### Invite Codes Collection

```typescript
{
  code: "ABC12345",
  created_at: Timestamp,
  created_by: "admin_uid",
  max_uses: 1,
  uses: 0,
  used_by: [],
  client_type: "pay_per_query",  // NEW
  trial_credits: 10,              // NEW (for pay_per_query only)
  expires_at?: Timestamp,
  note?: string,
}
```

### Clients Collection

```typescript
{
  name: "Ben Syverson",
  email: "ben@example.com",
  client_type: "pay_per_query",  // Copied from invite
  billing_status: "active",       // Different based on type
  credits: {                      // Only for pay_per_query
    balance: 10,
    trial_credits_given: 10,
    trial_credits_used: false,
  },
  kb_query_cost: 1,               // Only for pay_per_query
  human_query_cost: 5,            // Only for pay_per_query
  invited_by_code: "ABC12345",
  created_at: Timestamp,
}
```

## Testing

### Test 1: Retainer Client Signup

```bash
# 1. Generate invite
askkaya invite generate --type retainer

# 2. Note the code (e.g., ABC12345)

# 3. Signup (in new terminal/logout first)
askkaya auth logout
askkaya auth signup
# Enter code: ABC12345
# Enter email: test-retainer@example.com
# Enter password: test1234

# 4. Check Firestore:
# clients collection → should have:
# - client_type: 'retainer'
# - billing_status: 'pending'
# - NO credits field

# 5. Try to query
askkaya query "test"
# Should show: "Payment required"
```

### Test 2: Pay-Per-Query Client Signup

```bash
# 1. Generate invite
askkaya invite generate --type pay_per_query --trial-credits 5

# 2. Note the code (e.g., XYZ67890)

# 3. Signup
askkaya auth logout
askkaya auth signup
# Enter code: XYZ67890
# Enter email: test-credits@example.com
# Enter password: test1234

# 4. Check Firestore:
# clients collection → should have:
# - client_type: 'pay_per_query'
# - billing_status: 'active'
# - credits.balance: 5

# 5. Query until credits run out
askkaya query "test 1"  # -1 credit (4 left)
askkaya query "test 2"  # -1 credit (3 left)
askkaya query "test 3"  # -1 credit (2 left)
askkaya query "test 4"  # -1 credit (1 left)
askkaya query "test 5"  # -1 credit (0 left)
askkaya query "test 6"  # Error: Out of credits!

# 6. Buy more credits
askkaya credits buy
# Complete Stripe test payment

# 7. Query works again
askkaya query "test 7"  # Success!
```

## Migration: Existing Clients

Existing clients (created before this update) will:
- Default to `client_type: 'retainer'` (backwards compatible)
- Continue working as subscription-based
- Need manual update in Firestore if you want to convert them to pay-per-query

## Benefits

1. **Automated Onboarding** - No manual Firestore editing
2. **Flexible Business Model** - Easy to offer both subscription and credits
3. **Trial Credits** - Frictionless onboarding for pay-per-query users
4. **Admin Control** - You decide client type when generating invite
5. **Scalable** - Easy to batch-generate invites for different cohorts

## Next Steps

1. Deploy backend: `cd firebase/functions && npm run deploy`
2. Build CLI: `cd ../../cli && go build`
3. Test both flows (retainer + pay-per-query)
4. Create invite codes for Ben and other users
5. Send codes to users to sign up!

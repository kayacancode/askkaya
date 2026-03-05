# Credit Purchase Flow

## Overview
One-time credit purchases via Stripe Checkout for pay-per-query users.

## Credit Packs

| Pack     | Credits | Price | Per Credit |
|----------|---------|-------|------------|
| Starter  | 50      | $10   | $0.20      |
| Standard | 100     | $18   | $0.18      |
| Pro      | 250     | $40   | $0.16      |

## Complete Flow

```
1. User runs out of credits
   ↓
2. CLI shows:
   "💳 Out of credits!
    Purchase more credits:
      askkaya credits buy"
   ↓
3. User runs: askkaya credits buy
   Browser opens to: https://askkaya.com/credits
   ↓
4. User selects credit pack (Starter/Standard/Pro)
   ↓
5. Frontend calls: POST /purchaseCreditsApi
   Body: { pack: 'standard' }
   ↓
6. Backend creates Stripe Checkout session
   Metadata: { askkaya_client_id, credit_pack, credits_amount }
   ↓
7. User redirected to Stripe Checkout
   Completes payment
   ↓
8. Stripe webhook: checkout.session.completed
   ↓
9. Backend calls handleCreditPurchaseComplete()
   Updates Firestore:
     credits.balance += credits_amount
     last_credit_purchase: { pack, credits, amount_paid, ... }
   ↓
10. User can query again!
```

## Implementation Details

### Backend

**File:** `firebase/functions/src/billing/credits.ts`
- `createCreditPurchaseSession()` - Create Stripe checkout
- `handleCreditPurchaseComplete()` - Process successful payment
- `getAvailableCreditPacks()` - List available packs
- `CREDIT_PACKS` - Configuration for credit tiers

**File:** `firebase/functions/src/billing/stripe.ts`
- Added `checkout.session.completed` event handler
- Differentiates between subscriptions (mode='subscription') and credits (mode='payment')

**File:** `firebase/functions/src/index.ts`
- `GET /purchaseCreditsApi` - List available credit packs
- `POST /purchaseCreditsApi` - Create checkout session for credit purchase

### CLI

**File:** `cli/cmd/credits.go`
- `askkaya credits balance` - View current balance (links to web dashboard)
- `askkaya credits buy` - Open browser to purchase page
- Auto-opens browser on macOS/Linux/Windows

**File:** `cli/cmd/query.go`
- Updated "insufficient_credits" error to show `askkaya credits buy`

### Client Schema Updates

When credits are purchased, the client document is updated:

```typescript
{
  credits: {
    balance: 110,  // Incremented by purchase amount
  },
  last_credit_purchase: {
    pack: 'standard',
    credits: 100,
    amount_paid: 18.00,
    currency: 'usd',
    purchased_at: Timestamp,
    stripe_session_id: 'cs_...',
  }
}
```

## Stripe Setup Required

### 1. Create Stripe Products & Prices

In Stripe Dashboard:

1. **Starter Pack**
   - Product: "AskKaya Credits - Starter Pack"
   - Price: $10.00 one-time
   - Copy Price ID → Set as `STRIPE_CREDITS_50_PRICE_ID`

2. **Standard Pack**
   - Product: "AskKaya Credits - Standard Pack"
   - Price: $18.00 one-time
   - Copy Price ID → Set as `STRIPE_CREDITS_100_PRICE_ID`

3. **Pro Pack**
   - Product: "AskKaya Credits - Pro Pack"
   - Price: $40.00 one-time
   - Copy Price ID → Set as `STRIPE_CREDITS_250_PRICE_ID`

### 2. Environment Variables

Add to Firebase Functions config:

```bash
STRIPE_CREDITS_50_PRICE_ID=price_xxx
STRIPE_CREDITS_100_PRICE_ID=price_yyy
STRIPE_CREDITS_250_PRICE_ID=price_zzz
```

### 3. Webhook Configuration

Your existing Stripe webhook already handles `checkout.session.completed`, so no additional setup needed!

## Frontend Web Page

Create `web/app/credits/page.tsx`:

```typescript
'use client';

import { useState } from 'react';

const CREDIT_PACKS = [
  { id: 'starter', credits: 50, price: 10, perCredit: 0.20 },
  { id: 'standard', credits: 100, price: 18, perCredit: 0.18 },
  { id: 'pro', credits: 250, price: 40, perCredit: 0.16 },
];

export default function CreditsPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handlePurchase(packId: string) {
    setLoading(packId);

    try {
      const token = await getFirebaseIdToken(); // Your auth helper

      const res = await fetch('/api/purchase-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ pack: packId }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url; // Redirect to Stripe
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-8">Purchase Credits</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CREDIT_PACKS.map(pack => (
          <div key={pack.id} className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">
              {pack.id.charAt(0).toUpperCase() + pack.id.slice(1)}
            </h2>
            <p className="text-3xl font-bold mb-4">${pack.price}</p>
            <p className="text-gray-600 mb-4">
              {pack.credits} credits
            </p>
            <p className="text-sm text-gray-500 mb-6">
              ${pack.perCredit.toFixed(2)} per credit
            </p>
            <button
              onClick={() => handlePurchase(pack.id)}
              disabled={loading === pack.id}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading === pack.id ? 'Loading...' : 'Purchase'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Testing

### 1. Test Credit Purchase Flow

```bash
# 1. Set user to have 2 credits (so they run out quickly)
# In Firestore console, set client credits.balance = 2

# 2. Run 2 queries to deplete credits
askkaya query "test 1"  # -1 credit
askkaya query "test 2"  # -1 credit

# 3. Third query should fail
askkaya query "test 3"  # Error: Out of credits!

# 4. Purchase credits
askkaya credits buy
# Browser opens, complete Stripe test payment

# 5. Verify credits added
# Check Firestore: credits.balance should be incremented

# 6. Query should work again
askkaya query "test 4"  # Success!
```

### 2. Test with Stripe Test Mode

Use Stripe test card:
- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits

## Files Created
- `firebase/functions/src/billing/credits.ts` - Credit purchase logic
- `cli/cmd/credits.go` - CLI credits management
- `CREDIT_PURCHASE_FLOW.md` (this file)

## Files Modified
- `firebase/functions/src/billing/stripe.ts` - Added checkout.session.completed handler
- `firebase/functions/src/index.ts` - Added purchaseCreditsApi endpoint
- `cli/cmd/query.go` - Updated error message
- `cli/cmd/root.go` - Registered credits command

## Next Steps

1. **Create Stripe Products** - Set up the 3 credit packs in Stripe Dashboard
2. **Set Environment Variables** - Add price IDs to Firebase config
3. **Build Frontend** - Create `/credits` page in web app
4. **Test Flow** - End-to-end test with Stripe test mode
5. **Add Email Confirmation** - Send receipt email after purchase
6. **Add Balance Display** - Show current balance in `askkaya status`

## Pricing Strategy

The tiered pricing encourages larger purchases:
- Starter: $0.20/credit (baseline)
- Standard: $0.18/credit (10% discount)
- Pro: $0.16/credit (20% discount)

Most users will likely choose Standard pack (100 credits) as best value.

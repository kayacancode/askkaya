# Stripe Price IDs Configuration

## Your Live Price IDs

These are now hardcoded in `firebase/functions/src/billing/credits.ts`:

```
50 Credits (Starter):   price_1T7Qn1EwP9ca9TbJecJQMExj
100 Credits (Standard): price_1T7QneEwP9ca9TbJyXx53dbn
250 Credits (Pro):      price_1T7QoBEwP9ca9TbJRxc3v0ne
```

## Optional: Set as Environment Variables

For better security and flexibility, you can also set these as Firebase environment variables:

```bash
firebase functions:config:set \
  stripe.credits_50_price_id="price_1T7Qn1EwP9ca9TbJecJQMExj" \
  stripe.credits_100_price_id="price_1T7QneEwP9ca9TbJyXx53dbn" \
  stripe.credits_250_price_id="price_1T7QoBEwP9ca9TbJRxc3v0ne"
```

The code will use environment variables first, then fall back to the hardcoded IDs.

## Ready to Deploy!

Your credit purchase system is fully configured. Just deploy:

```bash
cd firebase/functions
npm run deploy
```

Then test:

```bash
# Set a test client to have 0 credits in Firestore
# Then:
askkaya query "test"
# Should show: "Out of credits! Run: askkaya credits buy"

askkaya credits buy
# Opens browser to purchase page
```

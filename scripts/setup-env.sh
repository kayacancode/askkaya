#!/bin/bash
# AskKaya Environment Setup Script
# Run this to interactively set up your environment variables

set -e

echo "=========================================="
echo "  AskKaya Environment Setup"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to prompt for input
prompt_value() {
    local var_name=$1
    local description=$2
    local default=$3

    echo -e "${YELLOW}$description${NC}"
    if [ -n "$default" ]; then
        read -p "[$default]: " value
        value=${value:-$default}
    else
        read -p ": " value
    fi
    echo "$value"
}

# Telegram Setup
echo -e "\n${GREEN}=== Telegram Configuration ===${NC}"
echo "Get your bot token from @BotFather on Telegram"
read -p "Telegram Bot Token: " TELEGRAM_BOT_TOKEN

echo "Get your chat ID by messaging @userinfobot on Telegram"
read -p "Telegram Chat ID: " TELEGRAM_CHAT_ID

# Stripe Setup
echo -e "\n${GREEN}=== Stripe Configuration (Test Mode) ===${NC}"
echo "Get test keys from https://dashboard.stripe.com/test/apikeys"
read -p "Stripe Secret Key (sk_test_...): " STRIPE_SECRET_KEY

echo "Create a webhook at https://dashboard.stripe.com/test/webhooks"
echo "Point it to: https://us-central1-askkaya-test.cloudfunctions.net/stripeWebhook"
echo "Select events: invoice.paid, invoice.payment_failed, customer.subscription.deleted"
read -p "Stripe Webhook Secret (whsec_...): " STRIPE_WEBHOOK_SECRET

# Firebase Setup
echo -e "\n${GREEN}=== Firebase Configuration ===${NC}"
echo "Get from Firebase Console > Project Settings > Your apps"
read -p "Firebase API Key: " FIREBASE_API_KEY
read -p "Firebase Messaging Sender ID: " FIREBASE_MESSAGING_SENDER_ID
read -p "Firebase App ID: " FIREBASE_APP_ID

# Update .env file
echo -e "\n${GREEN}Updating .env file...${NC}"
cat > .env << EOF
# ===========================================
# AskKaya Environment Configuration
# ===========================================

# AI APIs (via Cloudflare AI Gateway)
OPENAI_BASE_URL="https://gateway.ai.cloudflare.com/v1/5108b346e20d363ba4b78b6f9e248870/attractor/openai"
ANTHROPIC_BASE_URL="https://gateway.ai.cloudflare.com/v1/5108b346e20d363ba4b78b6f9e248870/attractor/anthropic"
OPENAI_API_KEY="Bo5InBuou6qfUXw-S5Ol7cSgDhPZbKv4HChmVcB2"
ANTHROPIC_API_KEY="Bo5InBuou6qfUXw-S5Ol7cSgDhPZbKv4HChmVcB2"

# Telegram Bot
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID

# Stripe (Test Mode)
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET

# Firebase
FIREBASE_API_KEY=$FIREBASE_API_KEY
FIREBASE_PROJECT_ID=askkaya-test
EOF

# Update web/.env.local
echo -e "${GREEN}Updating web/.env.local...${NC}"
cat > web/.env.local << EOF
# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=$FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=askkaya-test.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=askkaya-test
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=askkaya-test.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=$FIREBASE_APP_ID

# Telegram (for web UI replies)
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
EOF

# Update cli/.env
echo -e "${GREEN}Updating cli/.env...${NC}"
cat > cli/.env << EOF
FIREBASE_API_KEY=$FIREBASE_API_KEY
ASKKAYA_CLIENT_ID=
EOF

echo -e "\n${GREEN}=========================================="
echo "  Setup Complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Download service account JSON from Firebase Console"
echo "   (Project Settings > Service accounts > Generate new private key)"
echo "2. Add FIREBASE_SERVICE_ACCOUNT to web/.env.local"
echo "3. Create a client in Firestore and add ASKKAYA_CLIENT_ID to cli/.env"
echo "4. Deploy Firebase Functions:"
echo "   cd firebase/functions && firebase deploy --only functions"
echo ""

#!/bin/bash
# Build script for AskKaya CLI
# Injects Firebase API key at build time so it's not in source code

set -e

# Load API key from environment or .env file
if [ -z "$FIREBASE_API_KEY" ]; then
  if [ -f .env ]; then
    export $(grep FIREBASE_API_KEY .env | xargs)
  fi
fi

if [ -z "$FIREBASE_API_KEY" ]; then
  echo "Error: FIREBASE_API_KEY not set"
  echo "Set it in environment or create .env file with FIREBASE_API_KEY=..."
  exit 1
fi

LDFLAGS="-s -w -X github.com/askkaya/cli/cmd.defaultAPIKey=${FIREBASE_API_KEY}"

mkdir -p dist

echo "Building darwin-arm64..."
GOOS=darwin GOARCH=arm64 go build -ldflags="$LDFLAGS" -o dist/askkaya-darwin-arm64 .

echo "Building darwin-amd64..."
GOOS=darwin GOARCH=amd64 go build -ldflags="$LDFLAGS" -o dist/askkaya-darwin-amd64 .

echo "Building linux-amd64..."
GOOS=linux GOARCH=amd64 go build -ldflags="$LDFLAGS" -o dist/askkaya-linux-amd64 .

echo "Building linux-arm64..."
GOOS=linux GOARCH=arm64 go build -ldflags="$LDFLAGS" -o dist/askkaya-linux-arm64 .

echo ""
echo "Build complete!"
echo "SHA256 checksums:"
shasum -a 256 dist/askkaya-*

# AskKaya CLI

Command-line interface for the AskKaya support platform.

## Installation

### Homebrew (Recommended)

```bash
brew tap kayacancode/askkaya
brew install askkaya
```

### Manual Download

Download the latest binary from [GitHub Releases](https://github.com/kayacancode/askkaya/releases).

### Build from Source

```bash
git clone https://github.com/kayacancode/askkaya.git
cd askkaya/cli
go build -o askkaya .
```

## Getting Started

AskKaya is invite-only. Contact [Kaya](mailto:kaya@forever22studios.com) to get an invite code.

### Sign Up

```bash
# Sign up with your invite code
askkaya auth signup -c YOUR_INVITE_CODE -e your@email.com

# You'll be prompted for a password
```

### Authentication

```bash
# Login with email/password
askkaya auth login -e your@email.com

# Or interactive prompt
askkaya auth login

# Logout
askkaya auth logout
```

### Query

```bash
# Ask a question
askkaya query "How do I backup my OpenClaw setup?"

# Interactive TUI mode
askkaya query -i
```

### Status

```bash
# Check authentication and API status
askkaya status
```

### Background Daemon

```bash
# Start heartbeat monitoring
askkaya heartbeat
```

## Examples

```bash
# Get help
askkaya --help
askkaya query --help

# Ask about OpenClaw
askkaya query "What is OpenClaw?"

# Ask about support
askkaya query "How do I contact support?"

# Interactive session
askkaya query -i
```

## Configuration

The CLI stores credentials securely in your system keychain. No environment variables required for normal usage.

### Advanced Options

```bash
# Custom API endpoint (for development)
askkaya --api-url http://localhost:5001/project/us-central1 query "test"
```

## Upgrading

```bash
brew upgrade askkaya
```

## Troubleshooting

### "not logged in" error

```bash
askkaya auth login -e your@email.com
```

### "no client ID found" error

Re-login to fetch your account info:

```bash
askkaya auth logout
askkaya auth login -e your@email.com
```

### Connection issues

Check API status:

```bash
askkaya status
```

## License

MIT

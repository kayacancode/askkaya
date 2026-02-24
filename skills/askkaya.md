# AskKaya Skill

Query the AskKaya knowledge base for help with OpenClaw, Honcho, and other supported tools.

## Usage

Use `/askkaya` followed by your question to get AI-powered answers from the knowledge base.

```
/askkaya How do I set up memory with Honcho?
/askkaya What are the OpenClaw configuration options?
/askkaya How do I backup my setup?
```

## Implementation

When the user invokes `/askkaya <question>`, run the following command:

```bash
askkaya query "<question>"
```

If the CLI is not installed, instruct the user to install it:

```bash
brew tap kayacancode/askkaya
brew install askkaya
askkaya auth signup -c <INVITE_CODE> -e <EMAIL>
askkaya auth login -e <EMAIL>
```

## Response Format

Display the response from AskKaya, including:
- The answer text
- Confidence score (if available)
- Sources referenced (if available)

If confidence is low, inform the user that the question has been escalated to a human.

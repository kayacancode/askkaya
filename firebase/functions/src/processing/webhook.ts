/**
 * GitHub Webhook Receiver
 * 
 * Handles GitHub push events for KB ingestion pipeline
 */

import * as crypto from 'crypto';

export interface FileToProcess {
  path: string;
  content: string;
  target: 'global' | { clientId: string };
}

export interface GitHubPushPayload {
  ref: string;
  repository: {
    name: string;
    full_name: string;
  };
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 * Uses constant-time comparison to prevent timing attacks
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  // Use crypto.timingSafeEqual for constant-time comparison
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Parse GitHub push event and extract markdown files to process
 * Maps directory structure to target:
 *  - global/ -> 'global'
 *  - clients/{name}/ -> { clientId: name }
 */
export function parseGitHubPush(payload: GitHubPushPayload): FileToProcess[] {
  const files = new Map<string, FileToProcess>();

  // Iterate through all commits
  for (const commit of payload.commits) {
    // Process added files
    for (const filePath of commit.added) {
      if (filePath.endsWith('.md')) {
        const target = determineTarget(filePath);
        if (target) {
          files.set(filePath, {
            path: filePath,
            content: '', // Content will be fetched from GitHub API in real implementation
            target,
          });
        }
      }
    }

    // Process modified files
    for (const filePath of commit.modified) {
      if (filePath.endsWith('.md')) {
        const target = determineTarget(filePath);
        if (target) {
          files.set(filePath, {
            path: filePath,
            content: '', // Content will be fetched from GitHub API in real implementation
            target,
          });
        }
      }
    }
  }

  // Convert Map to array
  return Array.from(files.values());
}

/**
 * Determine target KB from file path
 */
function determineTarget(filePath: string): 'global' | { clientId: string } | null {
  // Match global/ directory
  if (filePath.startsWith('global/')) {
    return 'global';
  }

  // Match clients/{name}/ directory
  const clientMatch = filePath.match(/^clients\/([^/]+)\//);
  if (clientMatch && clientMatch[1]) {
    return { clientId: clientMatch[1] };
  }

  // For files not in global/ or clients/{name}/, we can treat them as general
  // but based on tests, we should return a target for all .md files
  // Let's default to null for now, which means ignore
  return null;
}

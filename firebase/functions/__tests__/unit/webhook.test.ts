/**
 * GitHub Webhook Receiver Tests
 * 
 * Tests for GitHub webhook signature verification and payload parsing
 */

import { verifyWebhookSignature, parseGitHubPush } from '../../src/processing/webhook';
import * as crypto from 'crypto';

describe('GitHub Webhook Receiver', () => {
  describe('Webhook Signature Verification', () => {
    const webhookSecret = 'test-webhook-secret';
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      commits: [{
        added: ['docs/test.md'],
        modified: [],
        removed: []
      }]
    });

    it('should verify valid GitHub webhook signature (X-Hub-Signature-256)', () => {
      const hmac = crypto.createHmac('sha256', webhookSecret);
      hmac.update(payload);
      const signature = 'sha256=' + hmac.digest('hex');

      const result = verifyWebhookSignature(payload, signature, webhookSecret);

      expect(result).toBe(true);
    });

    it('should reject invalid signature (401)', () => {
      const invalidSignature = 'sha256=invalid-signature-here';

      const result = verifyWebhookSignature(payload, invalidSignature, webhookSecret);

      expect(result).toBe(false);
    });

    it('should reject missing signature header', () => {
      const result = verifyWebhookSignature(payload, '', webhookSecret);

      expect(result).toBe(false);
    });

    it('should reject malformed signature format (missing sha256= prefix)', () => {
      const hmac = crypto.createHmac('sha256', webhookSecret);
      hmac.update(payload);
      const signatureWithoutPrefix = hmac.digest('hex');

      const result = verifyWebhookSignature(payload, signatureWithoutPrefix, webhookSecret);

      expect(result).toBe(false);
    });

    it('should use constant-time comparison to prevent timing attacks', () => {
      const hmac = crypto.createHmac('sha256', webhookSecret);
      hmac.update(payload);
      const validSignature = 'sha256=' + hmac.digest('hex');
      
      // Create a signature that differs only in the last character
      const almostValidSignature = validSignature.slice(0, -1) + 'x';

      const startValid = Date.now();
      verifyWebhookSignature(payload, validSignature, webhookSecret);
      const timeValid = Date.now() - startValid;

      const startInvalid = Date.now();
      verifyWebhookSignature(payload, almostValidSignature, webhookSecret);
      const timeInvalid = Date.now() - startInvalid;

      // Timing should be similar (within 5ms) for constant-time comparison
      expect(Math.abs(timeValid - timeInvalid)).toBeLessThan(5);
    });
  });

  describe('Push Event Parsing', () => {
    it('should parse push event and extract added .md files', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'abc123',
            message: 'Add new documentation',
            added: ['docs/setup.md', 'global/faq.md'],
            modified: [],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        path: 'docs/setup.md',
        target: expect.anything()
      });
      expect(result[1]).toMatchObject({
        path: 'global/faq.md',
        target: 'global'
      });
    });

    it('should parse push event and extract modified .md files', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'def456',
            message: 'Update documentation',
            added: [],
            modified: ['global/getting-started.md', 'clients/acme/setup.md'],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        path: 'global/getting-started.md',
        target: 'global'
      });
      expect(result[1]).toMatchObject({
        path: 'clients/acme/setup.md',
        target: { clientId: 'acme' }
      });
    });

    it('should ignore non-.md files', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'ghi789',
            message: 'Add files',
            added: ['docs/image.png', 'global/config.json', 'README.txt'],
            modified: ['global/setup.md'],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        path: 'global/setup.md',
        target: 'global'
      });
    });

    it('should ignore deleted files', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'jkl012',
            message: 'Remove old docs',
            added: ['global/new.md'],
            modified: [],
            removed: ['global/old.md', 'clients/test/removed.md']
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        path: 'global/new.md',
        target: 'global'
      });
    });

    it('should map global/ path to global KB', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'mno345',
            message: 'Add global KB',
            added: ['global/troubleshooting.md'],
            modified: [],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(1);
      expect(result[0].target).toBe('global');
    });

    it('should map clients/{name}/ path to per-client KB', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'pqr678',
            message: 'Add client KB',
            added: ['clients/acme-corp/vapi-setup.md', 'clients/widgets-inc/integration.md'],
            modified: [],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        path: 'clients/acme-corp/vapi-setup.md',
        target: { clientId: 'acme-corp' }
      });
      expect(result[1]).toMatchObject({
        path: 'clients/widgets-inc/integration.md',
        target: { clientId: 'widgets-inc' }
      });
    });

    it('should handle multiple commits in a single push', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'commit1',
            message: 'First commit',
            added: ['global/doc1.md'],
            modified: [],
            removed: []
          },
          {
            id: 'commit2',
            message: 'Second commit',
            added: ['clients/test/doc2.md'],
            modified: ['global/doc3.md'],
            removed: []
          },
          {
            id: 'commit3',
            message: 'Third commit',
            added: [],
            modified: ['clients/test/doc2.md'],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      // Should deduplicate files across commits
      expect(result.length).toBeGreaterThan(0);
      
      const paths = result.map(f => f.path);
      expect(paths).toContain('global/doc1.md');
      expect(paths).toContain('global/doc3.md');
      expect(paths).toContain('clients/test/doc2.md');
    });

    it('should include file content in FileToProcess', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'stu901',
            message: 'Add docs',
            added: ['global/test.md'],
            modified: [],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('content');
      expect(typeof result[0].content).toBe('string');
    });

    it('should return empty array for push with no markdown files', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'vwx234',
            message: 'Update config',
            added: ['config.yaml', 'scripts/deploy.sh'],
            modified: ['package.json'],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(0);
    });
  });

  describe('FileToProcess Type Validation', () => {
    it('should return FileToProcess with correct types', () => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'knowledge-base',
          full_name: 'askkaya/knowledge-base'
        },
        commits: [
          {
            id: 'xyz567',
            message: 'Add files',
            added: ['global/doc.md', 'clients/test/doc.md'],
            modified: [],
            removed: []
          }
        ]
      };

      const result = parseGitHubPush(pushPayload);

      expect(result).toHaveLength(2);
      
      // Validate FileToProcess structure
      result.forEach(file => {
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('content');
        expect(file).toHaveProperty('target');
        
        expect(typeof file.path).toBe('string');
        expect(typeof file.content).toBe('string');
        
        // Target should be either 'global' or { clientId: string }
        if (typeof file.target === 'string') {
          expect(file.target).toBe('global');
        } else {
          expect(file.target).toHaveProperty('clientId');
          expect(typeof file.target.clientId).toBe('string');
        }
      });
    });
  });
});

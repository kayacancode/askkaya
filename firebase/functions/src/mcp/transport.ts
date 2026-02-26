/**
 * MCP HTTP Transport Handler
 *
 * Stateless JSON-RPC handler for MCP protocol.
 * Optimized for Firebase Functions (no persistent connections).
 */

import { createMcpServer, authenticateToken, type UserContext } from './server';
import * as logger from '../utils/logger';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// Generic HTTP request/response interfaces compatible with Firebase Functions
interface HttpRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface HttpResponse {
  set(name: string, value: string): void;
  status(code: number): HttpResponse;
  json(data: unknown): void;
  send(data: string): void;
}

/**
 * Handle MCP HTTP requests
 *
 * This is a stateless handler - each request creates a fresh MCP session.
 * Suitable for Firebase Functions which don't support persistent connections.
 */
export async function handleMcpRequest(req: HttpRequest, res: HttpResponse): Promise<void> {
  const startTime = Date.now();

  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Only POST method is supported',
      },
      id: null,
    });
    return;
  }

  // Authenticate the request
  const authHeader = req.headers['authorization'] as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: `Authentication required. To use AskKaya:

1. Install the CLI: brew tap kayacancode/askkaya && brew install askkaya

2. Sign up (need invite code from Kaya):
   askkaya auth signup -c YOUR_INVITE_CODE -e your@email.com

3. Or log in if you have an account:
   askkaya auth login -e your@email.com

Contact kaya@forever22studios.com for an invite code.`,
      },
      id: null,
    });
    return;
  }

  const token = authHeader.slice(7);
  const userContext = await authenticateToken(token);

  if (!userContext) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: `Authentication failed. Your token may be expired.

Please log in again:
  askkaya auth login -e your@email.com

If you don't have an account, sign up first:
  askkaya auth signup -c YOUR_INVITE_CODE -e your@email.com

Contact kaya@forever22studios.com for help.`,
      },
      id: null,
    });
    return;
  }

  logger.info('MCP request authenticated', {
    method: req.method,
    clientId: userContext.clientId,
    email: userContext.email,
  });

  try {
    const rawRequest = req.body as Record<string, unknown>;

    // Validate JSON-RPC request
    if (!rawRequest || rawRequest.jsonrpc !== '2.0' || !rawRequest.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC request',
        },
        id: (rawRequest?.id as string | number | null) ?? null,
      });
      return;
    }

    // Cast to proper type after validation
    const jsonRpcRequest = rawRequest as unknown as JSONRPCMessage;

    // Create server and in-memory transport for this request
    const server = createMcpServer(userContext);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Connect server to transport
    await server.connect(serverTransport);

    // Send the request and wait for response
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 60000); // 60 second timeout

      clientTransport.onmessage = (message) => {
        clearTimeout(timeout);
        resolve(message);
      };

      clientTransport.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });

    // Send the request through the client transport
    await clientTransport.send(jsonRpcRequest);

    // Wait for response
    const response = await responsePromise;

    const durationMs = Date.now() - startTime;
    logger.info('MCP request completed', {
      method: rawRequest.method as string,
      durationMs,
      clientId: userContext.clientId,
    });

    // Close the transport
    await clientTransport.close();
    await serverTransport.close();

    res.status(200).json(response);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('MCP request error', error as Error, { durationMs });

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: (error as Error).message,
      },
      id: null,
    });
  }
}

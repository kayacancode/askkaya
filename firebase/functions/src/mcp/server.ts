/**
 * AskKaya MCP Server
 *
 * Exposes AskKaya knowledge base as MCP tools for AI agents.
 * Bots can query the KB without users needing to invoke commands.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { processQuery } from '../api/query';
import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';

// Lazy initialize Firebase Admin
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

// Get auth instance
function getAuth(): admin.auth.Auth {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.auth();
}

/**
 * User context from authentication
 */
export interface UserContext {
  userId: string;
  email: string;
  clientId: string;
  clientName: string;
  role: 'admin' | 'client';
  billingStatus: string;
}

/**
 * Authenticate a Firebase ID token and return user context
 */
export async function authenticateToken(token: string): Promise<UserContext | null> {
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const db = getDb();

    // Get user document
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    if (!userData?.client_id) {
      logger.warn('User has no client_id', { userId: decodedToken.uid });
      return null;
    }

    // Get client document
    const clientDoc = await db.collection('clients').doc(userData.client_id).get();
    const clientData = clientDoc.data();

    if (!clientData) {
      logger.warn('Client not found', { clientId: userData.client_id });
      return null;
    }

    return {
      userId: decodedToken.uid,
      email: decodedToken.email || '',
      clientId: userData.client_id,
      clientName: clientData.name || '',
      role: userData.is_admin ? 'admin' : 'client',
      billingStatus: clientData.billing_status || 'active',
    };
  } catch (error) {
    logger.error('Token authentication failed', error as Error);
    return null;
  }
}

/**
 * Create an MCP server instance for a specific user context
 */
export function createMcpServer(userContext: UserContext): McpServer {
  const server = new McpServer({
    name: 'askkaya',
    version: '1.0.0',
  });

  // Tool: Query the AskKaya knowledge base
  server.tool(
    'query',
    'Query the AskKaya knowledge base for help with OpenClaw, Honcho, and other supported tools. Use this for setup help, configuration questions, and troubleshooting. You can optionally include a screenshot to help diagnose issues.',
    {
      question: z.string().describe('The question to ask the knowledge base'),
      image_data: z.string().optional().describe('Base64-encoded image data (for screenshots, error messages, etc.)'),
      image_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']).optional().describe('MIME type of the image'),
    },
    async ({ question, image_data, image_type }) => {
      logger.info('MCP query tool invoked', {
        clientId: userContext.clientId,
        questionLength: question.length,
      });

      // Check billing status
      if (userContext.billingStatus === 'pending') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Payment required. Please complete your subscription setup at https://askkaya.com/billing',
            },
          ],
        };
      }

      if (userContext.billingStatus === 'suspended') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Your subscription is inactive. Please contact support to reactivate.',
            },
          ],
        };
      }

      try {
        // Build image input if provided
        const image = image_data && image_type
          ? { data: image_data, mediaType: image_type }
          : undefined;

        const response = await processQuery(
          userContext.clientId,
          question,
          userContext.userId,
          image
        );

        let resultText = response.text;

        if (response.escalated) {
          resultText += '\n\n---\nKaya has been notified and will get back to you shortly!';
        }

        if (response.confidence !== undefined) {
          resultText += `\n\n[Confidence: ${Math.round(response.confidence * 100)}%]`;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: resultText,
            },
          ],
        };
      } catch (error) {
        logger.error('MCP query failed', error as Error, {
          clientId: userContext.clientId,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Error processing query: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Get account status
  server.tool(
    'status',
    'Check your AskKaya account status including billing and subscription details.',
    {},
    async () => {
      logger.info('MCP status tool invoked', {
        clientId: userContext.clientId,
      });

      const statusText = [
        `**Account Status**`,
        ``,
        `Email: ${userContext.email}`,
        `Client: ${userContext.clientName}`,
        `Role: ${userContext.role}`,
        `Billing: ${userContext.billingStatus}`,
      ].join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: statusText,
          },
        ],
      };
    }
  );

  // Tool: List recent escalations (for the current user)
  server.tool(
    'escalations',
    'List your recent support escalations and their status.',
    {
      limit: z.number().optional().default(5).describe('Number of escalations to return (default: 5)'),
    },
    async ({ limit }) => {
      logger.info('MCP escalations tool invoked', {
        clientId: userContext.clientId,
        limit,
      });

      try {
        const db = getDb();
        const escalationsQuery = await db
          .collection('escalations')
          .where('clientId', '==', userContext.clientId)
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get();

        if (escalationsQuery.empty) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No recent escalations found.',
              },
            ],
          };
        }

        const escalations = escalationsQuery.docs.map((doc) => {
          const data = doc.data();
          const createdAt = data.createdAt?.toDate?.() || new Date();
          return `- [${data.status}] "${data.query}" (${createdAt.toLocaleDateString()})`;
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `**Recent Escalations**\n\n${escalations.join('\n')}`,
            },
          ],
        };
      } catch (error) {
        logger.error('MCP escalations failed', error as Error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error fetching escalations: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

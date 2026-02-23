/**
 * KB Ingestion API
 *
 * Unified endpoint for ingesting content from multiple sources into the KB.
 * Supports: Granola notes, Telegram messages, manual content, and more.
 *
 * Features:
 * - Upsert by source_id (prevents duplicates)
 * - Automatic embedding generation (via Firestore trigger)
 * - Source tagging for filtering
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

export interface IngestItem {
  // Required
  content: string;
  source: 'granola' | 'telegram' | 'notion' | 'slack' | 'email' | 'manual' | string;

  // Optional - for upsert
  source_id?: string;  // Unique ID from source (e.g., Telegram message_id, Granola note ID)

  // Optional - metadata
  title?: string;
  summary?: string;
  tags?: string[];
  client_id?: string;  // For client-specific KB (only this client can access)
  owner_id?: string;   // For personal KB (only this user can access)
  is_global?: boolean; // If true, accessible to all (default for no client_id/owner_id)
  metadata?: Record<string, unknown>;  // Source-specific metadata

  // Optional - timestamps
  source_created_at?: Date | string;
}

export interface IngestResult {
  success: boolean;
  article_id?: string;
  action?: 'created' | 'updated' | 'skipped';
  error?: string;
}

export interface BulkIngestResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: IngestResult[];
}

/**
 * Generate a deterministic hash for content deduplication
 */
function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Ingest a single item into the KB
 */
export async function ingestItem(
  db: admin.firestore.Firestore,
  item: IngestItem
): Promise<IngestResult> {
  try {
    // Validate required fields
    if (!item.content || !item.source) {
      return { success: false, error: 'Missing required fields: content, source' };
    }

    // Generate source_id if not provided (hash of content)
    const sourceId = item.source_id || generateContentHash(item.content);
    const lookupKey = `${item.source}:${sourceId}`;

    // Check for existing article by source lookup key
    const existingQuery = await db
      .collection('kb_articles')
      .where('lookup_key', '==', lookupKey)
      .limit(1)
      .get();

    // Determine access control settings
    const hasClientId = !!item.client_id;
    const hasOwnerId = !!item.owner_id;
    // is_global only if explicitly set OR no access restrictions
    const isGlobal = item.is_global === true || (!hasClientId && !hasOwnerId);

    const articleData = {
      title: item.title || `${item.source} - ${new Date().toISOString().split('T')[0]}`,
      content: item.content,
      summary: item.summary || item.content.substring(0, 200),
      source: item.source,
      source_id: sourceId,
      lookup_key: lookupKey,
      tags: item.tags || [item.source],
      // Access control fields
      client_id: item.client_id || null,
      owner_id: item.owner_id || null,
      is_global: isGlobal,
      metadata: item.metadata || {},
      source_created_at: item.source_created_at
        ? new Date(item.source_created_at)
        : null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!existingQuery.empty) {
      // Update existing article
      const existingDoc = existingQuery.docs[0]!;
      const existingData = existingDoc.data();

      // Check if content changed
      if (existingData.content === item.content) {
        return {
          success: true,
          article_id: existingDoc.id,
          action: 'skipped'
        };
      }

      // Content changed - update and regenerate embedding
      await existingDoc.ref.update({
        ...articleData,
        status: 'pending_embedding',  // Trigger re-embedding
      });

      return {
        success: true,
        article_id: existingDoc.id,
        action: 'updated'
      };
    }

    // Create new article
    const newDoc = await db.collection('kb_articles').add({
      ...articleData,
      status: 'pending_embedding',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      article_id: newDoc.id,
      action: 'created'
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Bulk ingest multiple items
 */
export async function bulkIngest(
  db: admin.firestore.Firestore,
  items: IngestItem[]
): Promise<BulkIngestResult> {
  const results: IngestResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Process in batches of 10 for rate limiting
  const batchSize = 10;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => ingestItem(db, item))
    );

    for (const result of batchResults) {
      results.push(result);
      if (!result.success) {
        failed++;
      } else if (result.action === 'created') {
        created++;
      } else if (result.action === 'updated') {
        updated++;
      } else {
        skipped++;
      }
    }
  }

  return {
    total: items.length,
    created,
    updated,
    skipped,
    failed,
    results,
  };
}

/**
 * Parse Granola export format
 * Granola typically exports as markdown or JSON
 */
export function parseGranolaExport(data: string | object): IngestItem[] {
  const items: IngestItem[] = [];

  if (typeof data === 'string') {
    // Markdown format - split by headers
    const sections = data.split(/^# /gm).filter(Boolean);
    for (const section of sections) {
      const lines = section.split('\n');
      const title = lines[0]?.trim() || 'Untitled Note';
      const content = lines.slice(1).join('\n').trim();

      if (content) {
        items.push({
          content,
          title,
          source: 'granola',
          source_id: generateContentHash(content),
          tags: ['granola', 'meeting-notes'],
        });
      }
    }
  } else if (Array.isArray(data)) {
    // JSON array format
    for (const note of data) {
      items.push({
        content: note.content || note.transcript || note.summary || '',
        title: note.title || note.name || 'Untitled Note',
        source: 'granola',
        source_id: note.id || generateContentHash(note.content || ''),
        tags: ['granola', 'meeting-notes', ...(note.tags || [])],
        source_created_at: note.created_at || note.date,
        metadata: {
          participants: note.participants,
          duration: note.duration,
        },
      });
    }
  }

  return items;
}

/**
 * Parse Telegram message history export
 * Telegram exports as JSON with messages array
 */
export function parseTelegramExport(data: {
  messages: Array<{
    id: number;
    type: string;
    date: string;
    text: string | Array<{ type: string; text: string }>;
    from?: string;
  }>;
}): IngestItem[] {
  const items: IngestItem[] = [];

  for (const msg of data.messages || []) {
    // Only process text messages
    if (msg.type !== 'message') continue;

    // Handle both string and array text formats
    let text = '';
    if (typeof msg.text === 'string') {
      text = msg.text;
    } else if (Array.isArray(msg.text)) {
      text = msg.text.map(t => typeof t === 'string' ? t : t.text).join('');
    }

    // Skip empty or very short messages
    if (!text || text.length < 20) continue;

    items.push({
      content: text,
      title: `Telegram: ${msg.from || 'Unknown'} - ${msg.date.split('T')[0]}`,
      source: 'telegram',
      source_id: String(msg.id),
      tags: ['telegram', 'chat'],
      source_created_at: msg.date,
      metadata: {
        from: msg.from,
        message_id: msg.id,
      },
    });
  }

  return items;
}

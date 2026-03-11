/**
 * Migration: KB Articles to Sources + Chunks
 *
 * Splits the legacy `kb_articles` collection into:
 * - `sources`: Metadata about ingested content
 * - `chunks`: Searchable content with embeddings
 *
 * Prerequisites:
 * - migrate-clients-to-tenants.ts must run first
 * - Organization twins must exist for each tenant
 *
 * Run with: npx ts-node src/migrations/migrate-kb-to-sources-chunks.ts
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin with explicit project
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'askkaya-47cef',
  });
}

const db = admin.firestore();

/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 */
function removeUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as T;
}

interface KBArticleDoc {
  title?: string;
  content?: string;
  embedding?: number[];
  client_id?: string;
  owner_id?: string;
  is_global?: boolean;
  source?: string;
  source_url?: string;
  tags?: string[];
  status?: string;
  created_at?: admin.firestore.Timestamp;
}

interface SourceDoc {
  tenantId: string;
  twinIds: string[];
  sourceType: string;
  title: string;
  originalUrl?: string;
  visibility: 'private' | 'team' | 'tenant';
  ownerUid?: string;
  teamId?: string;
  status: 'active' | 'pending' | 'failed';
  metadata: Record<string, unknown>;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  _migratedFromArticleId: string;
  _migratedAt: admin.firestore.FieldValue;
}

interface ChunkDoc {
  tenantId: string;
  sourceId: string;
  twinIds: string[];
  ownerUid?: string;
  teamId?: string;
  visibility: 'private' | 'team' | 'tenant';
  content: string;
  embedding: number[];
  position: number;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
}

// Cache for tenant org twins
const tenantOrgTwinCache = new Map<string, string>();

/**
 * Get or create the organization twin for a tenant
 */
async function getOrCreateOrgTwin(tenantId: string): Promise<string> {
  // Check cache
  if (tenantOrgTwinCache.has(tenantId)) {
    return tenantOrgTwinCache.get(tenantId)!;
  }

  // Look for existing org twin
  const existingTwin = await db
    .collection('twins')
    .where('tenantId', '==', tenantId)
    .where('type', '==', 'organization')
    .limit(1)
    .get();

  if (!existingTwin.empty) {
    const twinId = existingTwin.docs[0]!.id;
    tenantOrgTwinCache.set(tenantId, twinId);
    return twinId;
  }

  // Create org twin
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  const tenantData = tenantDoc.data();
  const tenantName = tenantData?.name || 'Organization';
  const tenantSlug = tenantData?.slug || tenantId;

  const twinRef = await db.collection('twins').add({
    tenantId,
    type: 'organization',
    name: tenantName,
    slug: `${tenantSlug}-org`,
    description: `Organization knowledge base for ${tenantName}`,
    expertiseAreas: [],
    visibility: 'tenant',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    _createdByMigration: true,
  });

  tenantOrgTwinCache.set(tenantId, twinRef.id);
  console.log(`  📌 Created org twin ${twinRef.id} for tenant ${tenantId}`);
  return twinRef.id;
}

/**
 * Determine the tenant ID for an article
 */
function determineTenantId(article: KBArticleDoc): string | null {
  // Client-specific article → tenant is the client
  if (article.client_id) {
    return article.client_id;
  }

  // Global article → will be added to all tenants (handled separately)
  if (article.is_global) {
    return 'global';
  }

  return null;
}

/**
 * Determine source type from article data
 */
function determineSourceType(article: KBArticleDoc): string {
  const source = article.source?.toLowerCase() || '';

  if (source.includes('granola')) return 'granola';
  if (source.includes('telegram')) return 'telegram';
  if (source.includes('slack')) return 'slack';
  if (source.includes('github')) return 'github';
  if (source.includes('notion')) return 'notion';

  return 'manual';
}

/**
 * Determine visibility based on article ownership
 */
function determineVisibility(article: KBArticleDoc): 'private' | 'team' | 'tenant' {
  if (article.owner_id) {
    return 'private';
  }
  if (article.is_global) {
    return 'tenant';
  }
  return 'tenant';
}

/**
 * Migrate a single article to source + chunk
 */
async function migrateArticle(
  articleId: string,
  articleData: KBArticleDoc,
  dryRun: boolean
): Promise<{ success: boolean; sourceId?: string; error?: string; skipped?: boolean }> {
  try {
    // Skip articles without content or embedding
    if (!articleData.content || !articleData.embedding) {
      console.log(`  ⏭️  Article ${articleId} has no content/embedding, skipping`);
      return { success: true, skipped: true };
    }

    // Skip inactive articles
    if (articleData.status && articleData.status !== 'active') {
      console.log(`  ⏭️  Article ${articleId} is not active (${articleData.status}), skipping`);
      return { success: true, skipped: true };
    }

    // Determine tenant
    const tenantId = determineTenantId(articleData);
    if (!tenantId) {
      console.log(`  ⏭️  Article ${articleId} has no tenant association, skipping`);
      return { success: true, skipped: true };
    }

    // Handle global articles separately (would need to copy to all tenants)
    if (tenantId === 'global') {
      console.log(`  ⏭️  Article ${articleId} is global, skipping (handle separately)`);
      return { success: true, skipped: true };
    }

    // Verify tenant exists
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      console.log(`  ⚠️  Tenant ${tenantId} not found for article ${articleId}, skipping`);
      return { success: true, skipped: true };
    }

    // Check if already migrated
    const existingSource = await db
      .collection('sources')
      .where('_migratedFromArticleId', '==', articleId)
      .limit(1)
      .get();

    if (!existingSource.empty) {
      console.log(`  ⏭️  Article ${articleId} already migrated to source ${existingSource.docs[0]!.id}`);
      return { success: true, sourceId: existingSource.docs[0]!.id };
    }

    // Get or create org twin for this tenant
    const orgTwinId = await getOrCreateOrgTwin(tenantId);

    // Determine attributes
    const sourceType = determineSourceType(articleData);
    const visibility = determineVisibility(articleData);

    // Build source document
    const sourceDoc: SourceDoc = {
      tenantId,
      twinIds: [orgTwinId],
      sourceType,
      title: articleData.title || 'Untitled',
      originalUrl: articleData.source_url,
      visibility,
      ownerUid: articleData.owner_id,
      status: 'active',
      metadata: {
        legacyTags: articleData.tags || [],
        legacySource: articleData.source,
      },
      createdAt: articleData.created_at || admin.firestore.FieldValue.serverTimestamp(),
      _migratedFromArticleId: articleId,
      _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Build chunk document
    const chunkDoc: ChunkDoc = {
      tenantId,
      sourceId: '', // Will be set after source creation
      twinIds: [orgTwinId],
      ownerUid: articleData.owner_id,
      visibility,
      content: articleData.content,
      embedding: articleData.embedding,
      position: 0, // Single chunk per article in migration
      createdAt: articleData.created_at || admin.firestore.FieldValue.serverTimestamp(),
    };

    if (dryRun) {
      console.log(`  🔍 Would create source:`, JSON.stringify({ ...sourceDoc, embedding: '[...]' }, null, 2));
      return { success: true, sourceId: `dry-run-${articleId}` };
    }

    // Create source
    const sourceRef = await db.collection('sources').add(removeUndefined(sourceDoc));

    // Create chunk with source reference
    chunkDoc.sourceId = sourceRef.id;
    await db.collection('chunks').add(removeUndefined(chunkDoc));

    console.log(`  ✅ Migrated article ${articleId} → source ${sourceRef.id}`);
    return { success: true, sourceId: sourceRef.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Failed to migrate article ${articleId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Run the migration
 */
async function runMigration(dryRun: boolean = true): Promise<void> {
  console.log('='.repeat(60));
  console.log('Migration: KB Articles → Sources + Chunks');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('='.repeat(60));

  // Verify tenants exist
  const tenantsCount = await db.collection('tenants').count().get();
  console.log(`\nFound ${tenantsCount.data().count} tenants`);

  if (tenantsCount.data().count === 0) {
    console.error('\n❌ No tenants found. Run migrate-clients-to-tenants.ts first!');
    process.exit(1);
  }

  // Fetch all KB articles
  const articlesSnapshot = await db.collection('kb_articles').get();

  console.log(`Found ${articlesSnapshot.size} KB articles to process\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const doc of articlesSnapshot.docs) {
    const articleId = doc.id;
    const articleData = doc.data() as KBArticleDoc;

    console.log(`Processing article: ${articleId} (${articleData.title || 'untitled'})`);

    const result = await migrateArticle(articleId, articleData, dryRun);

    if (result.success) {
      if (result.skipped) {
        skipCount++;
      } else {
        successCount++;
      }
    } else {
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total articles: ${articlesSnapshot.size}`);
  console.log(`Migrated:       ${successCount}`);
  console.log(`Skipped:        ${skipCount}`);
  console.log(`Errors:         ${errorCount}`);

  if (dryRun) {
    console.log('\n⚠️  This was a DRY RUN. No changes were made.');
    console.log('   Run with --live to apply changes.');
  }
}

// CLI entry point
const args = process.argv.slice(2);
const isLive = args.includes('--live');

runMigration(!isLive)
  .then(() => {
    console.log('\nMigration complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });

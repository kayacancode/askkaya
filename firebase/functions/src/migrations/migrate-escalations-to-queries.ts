/**
 * Migration: Escalations to Queries
 *
 * Migrates the legacy `escalations` collection to the new `queries` collection
 * with embedded escalation data.
 *
 * Prerequisites:
 * - migrate-clients-to-tenants.ts must run first
 * - migrate-kb-to-sources-chunks.ts (for org twins)
 *
 * Run with: npx ts-node src/migrations/migrate-escalations-to-queries.ts
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

/**
 * Remove undefined values recursively for nested objects
 */
function removeUndefinedDeep<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof admin.firestore.Timestamp) && !(value instanceof admin.firestore.FieldValue)) {
      result[key] = removeUndefinedDeep(value as object);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

interface EscalationDoc {
  clientId: string;
  clientName?: string;
  query: string;
  contextTags?: string[];
  status: 'pending' | 'answered' | 'closed';
  confidence?: number;
  reasoning?: string;
  answer?: string;
  answeredBy?: string;
  answeredAt?: admin.firestore.Timestamp;
  createdAt?: admin.firestore.Timestamp;
}

interface QueryDoc {
  tenantId: string;
  requesterUid: string;
  targetTwinId: string;
  targetTwinName: string;
  queryText: string;
  retrievedChunkIds: string[];
  response: {
    text: string;
    confidence: number;
    shouldEscalate: boolean;
  };
  escalation: {
    status: 'pending' | 'answered' | 'closed';
    answer?: string;
    answeredBy?: string;
    answeredAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    twinOwnerUid?: string;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
  };
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  _migratedFromEscalationId: string;
  _migratedAt: admin.firestore.FieldValue;
}

// Cache for tenant org twins
const tenantOrgTwinCache = new Map<string, { twinId: string; twinName: string; ownerUid?: string }>();

/**
 * Get org twin info for a tenant
 */
async function getOrgTwinInfo(tenantId: string): Promise<{ twinId: string; twinName: string; ownerUid?: string } | null> {
  // Check cache
  if (tenantOrgTwinCache.has(tenantId)) {
    return tenantOrgTwinCache.get(tenantId)!;
  }

  // Look for org twin
  const orgTwins = await db
    .collection('twins')
    .where('tenantId', '==', tenantId)
    .where('type', '==', 'organization')
    .limit(1)
    .get();

  if (orgTwins.empty) {
    return null;
  }

  const twinDoc = orgTwins.docs[0]!;
  const twinData = twinDoc.data();

  const info = {
    twinId: twinDoc.id,
    twinName: twinData.name || 'Organization',
    ownerUid: twinData.ownerUid,
  };

  tenantOrgTwinCache.set(tenantId, info);
  return info;
}

/**
 * Find a user UID associated with a client
 */
async function findUserForClient(clientId: string): Promise<string | null> {
  const usersWithClient = await db
    .collection('users')
    .where('client_id', '==', clientId)
    .limit(1)
    .get();

  if (!usersWithClient.empty) {
    return usersWithClient.docs[0]!.id;
  }

  return null;
}

/**
 * Migrate a single escalation to query
 */
async function migrateEscalation(
  escalationId: string,
  escalationData: EscalationDoc,
  dryRun: boolean
): Promise<{ success: boolean; queryId?: string; error?: string; skipped?: boolean }> {
  try {
    // Get tenant ID (same as client ID in migration)
    const tenantId = escalationData.clientId;

    if (!tenantId) {
      console.log(`  ⏭️  Escalation ${escalationId} has no clientId, skipping`);
      return { success: true, skipped: true };
    }

    // Verify tenant exists
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      console.log(`  ⚠️  Tenant ${tenantId} not found for escalation ${escalationId}, skipping`);
      return { success: true, skipped: true };
    }

    // Check if already migrated
    const existingQuery = await db
      .collection('queries')
      .where('_migratedFromEscalationId', '==', escalationId)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      console.log(`  ⏭️  Escalation ${escalationId} already migrated to query ${existingQuery.docs[0]!.id}`);
      return { success: true, queryId: existingQuery.docs[0]!.id };
    }

    // Get org twin for this tenant
    const orgTwinInfo = await getOrgTwinInfo(tenantId);
    if (!orgTwinInfo) {
      console.log(`  ⚠️  No org twin found for tenant ${tenantId}, skipping`);
      return { success: true, skipped: true };
    }

    // Find requester UID
    const requesterUid = await findUserForClient(tenantId) || 'unknown';

    // Build query document
    const queryDoc: QueryDoc = {
      tenantId,
      requesterUid,
      targetTwinId: orgTwinInfo.twinId,
      targetTwinName: orgTwinInfo.twinName,
      queryText: escalationData.query,
      retrievedChunkIds: [], // Not available in legacy data
      response: {
        text: escalationData.answer || 'Escalated to human support.',
        confidence: escalationData.confidence || 0.3,
        shouldEscalate: true,
      },
      escalation: {
        status: escalationData.status,
        answer: escalationData.answer,
        answeredBy: escalationData.answeredBy,
        answeredAt: escalationData.answeredAt,
        twinOwnerUid: orgTwinInfo.ownerUid,
        createdAt: escalationData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      },
      createdAt: escalationData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      _migratedFromEscalationId: escalationId,
      _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (dryRun) {
      console.log(`  🔍 Would create query:`, JSON.stringify(queryDoc, null, 2));
      return { success: true, queryId: `dry-run-${escalationId}` };
    }

    // Create query
    const queryRef = await db.collection('queries').add(removeUndefinedDeep(queryDoc));

    console.log(`  ✅ Migrated escalation ${escalationId} → query ${queryRef.id} (status: ${escalationData.status})`);
    return { success: true, queryId: queryRef.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Failed to migrate escalation ${escalationId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Run the migration
 */
async function runMigration(dryRun: boolean = true): Promise<void> {
  console.log('='.repeat(60));
  console.log('Migration: Escalations → Queries');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('='.repeat(60));

  // Verify tenants exist
  const tenantsCount = await db.collection('tenants').count().get();
  console.log(`\nFound ${tenantsCount.data().count} tenants`);

  if (tenantsCount.data().count === 0) {
    console.error('\n❌ No tenants found. Run migrate-clients-to-tenants.ts first!');
    process.exit(1);
  }

  // Verify twins exist
  const twinsCount = await db.collection('twins').count().get();
  console.log(`Found ${twinsCount.data().count} twins`);

  if (twinsCount.data().count === 0) {
    console.error('\n❌ No twins found. Run migrate-kb-to-sources-chunks.ts first!');
    process.exit(1);
  }

  // Fetch all escalations
  const escalationsSnapshot = await db.collection('escalations').get();

  console.log(`Found ${escalationsSnapshot.size} escalations to process\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // Track status counts
  const statusCounts = { pending: 0, answered: 0, closed: 0 };

  for (const doc of escalationsSnapshot.docs) {
    const escalationId = doc.id;
    const escalationData = doc.data() as EscalationDoc;

    console.log(`Processing escalation: ${escalationId} (${escalationData.status})`);

    const result = await migrateEscalation(escalationId, escalationData, dryRun);

    if (result.success) {
      if (result.skipped) {
        skipCount++;
      } else {
        successCount++;
        statusCounts[escalationData.status]++;
      }
    } else {
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total escalations: ${escalationsSnapshot.size}`);
  console.log(`Migrated:          ${successCount}`);
  console.log(`  - pending:       ${statusCounts.pending}`);
  console.log(`  - answered:      ${statusCounts.answered}`);
  console.log(`  - closed:        ${statusCounts.closed}`);
  console.log(`Skipped:           ${skipCount}`);
  console.log(`Errors:            ${errorCount}`);

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

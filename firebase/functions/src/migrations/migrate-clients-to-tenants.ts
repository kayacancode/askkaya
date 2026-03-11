/**
 * Migration: Clients to Tenants
 *
 * Migrates the legacy `clients` collection to the new `tenants` collection.
 * Creates a 1:1 mapping with migration tracking.
 *
 * Run with: npx ts-node src/migrations/migrate-clients-to-tenants.ts
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

interface ClientDoc {
  name: string;
  email?: string;
  billing_status?: string;
  setup_context?: string[];
  created_at?: admin.firestore.Timestamp;
  stripe_customer_id?: string;
}

interface TenantDoc {
  name: string;
  slug: string;
  ownerUid?: string;
  ownerEmail?: string;
  defaultModel: string;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  _migratedFromClientId: string;
  _migratedAt: admin.firestore.FieldValue;
  // Legacy fields preserved for backward compatibility
  legacyBillingStatus?: string;
  legacyStripeCustomerId?: string;
}

/**
 * Generate a URL-safe slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

/**
 * Ensure slug is unique within tenants collection
 */
async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await db
      .collection('tenants')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (existing.empty) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;

    if (counter > 100) {
      throw new Error(`Could not generate unique slug for ${baseSlug}`);
    }
  }
}

/**
 * Find the owner UID for a client by looking up users collection
 */
async function findOwnerUid(clientId: string, email?: string): Promise<string | undefined> {
  // First, check users collection for direct client_id mapping
  const usersWithClient = await db
    .collection('users')
    .where('client_id', '==', clientId)
    .limit(1)
    .get();

  if (!usersWithClient.empty) {
    return usersWithClient.docs[0]!.id;
  }

  // Fallback: try to find user by email
  if (email) {
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      return userRecord.uid;
    } catch {
      // User doesn't exist in auth
    }
  }

  return undefined;
}

/**
 * Migrate a single client to tenant
 */
async function migrateClient(
  clientId: string,
  clientData: ClientDoc,
  dryRun: boolean
): Promise<{ success: boolean; tenantId?: string; error?: string }> {
  try {
    // Check if already migrated
    const existingTenant = await db
      .collection('tenants')
      .where('_migratedFromClientId', '==', clientId)
      .limit(1)
      .get();

    if (!existingTenant.empty) {
      console.log(`  ⏭️  Client ${clientId} already migrated to tenant ${existingTenant.docs[0]!.id}`);
      return { success: true, tenantId: existingTenant.docs[0]!.id };
    }

    // Generate unique slug
    const baseSlug = generateSlug(clientData.name || clientId);
    const slug = await ensureUniqueSlug(baseSlug);

    // Find owner
    const ownerUid = await findOwnerUid(clientId, clientData.email);

    // Build tenant document
    const tenantDoc: TenantDoc = {
      name: clientData.name || 'Unnamed Tenant',
      slug,
      ownerUid,
      ownerEmail: clientData.email,
      defaultModel: 'gpt-4o-mini',
      createdAt: clientData.created_at || admin.firestore.FieldValue.serverTimestamp(),
      _migratedFromClientId: clientId,
      _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      legacyBillingStatus: clientData.billing_status,
      legacyStripeCustomerId: clientData.stripe_customer_id,
    };

    if (dryRun) {
      console.log(`  🔍 Would create tenant:`, JSON.stringify(tenantDoc, null, 2));
      return { success: true, tenantId: `dry-run-${clientId}` };
    }

    // Create tenant with same ID as client for easier mapping
    await db.collection('tenants').doc(clientId).set(removeUndefined(tenantDoc));

    console.log(`  ✅ Migrated client ${clientId} → tenant ${clientId} (slug: ${slug})`);
    return { success: true, tenantId: clientId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Failed to migrate client ${clientId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Run the migration
 */
async function runMigration(dryRun: boolean = true): Promise<void> {
  console.log('='.repeat(60));
  console.log('Migration: Clients → Tenants');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('='.repeat(60));

  // Fetch all clients
  const clientsSnapshot = await db.collection('clients').get();

  console.log(`\nFound ${clientsSnapshot.size} clients to migrate\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const doc of clientsSnapshot.docs) {
    const clientId = doc.id;
    const clientData = doc.data() as ClientDoc;

    console.log(`Processing client: ${clientId} (${clientData.name || 'unnamed'})`);

    const result = await migrateClient(clientId, clientData, dryRun);

    if (result.success) {
      if (result.tenantId?.startsWith('dry-run')) {
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
  console.log(`Total clients:  ${clientsSnapshot.size}`);
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

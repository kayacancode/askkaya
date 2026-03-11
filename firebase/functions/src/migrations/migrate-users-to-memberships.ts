/**
 * Migration: Users to Memberships
 *
 * Creates membership records linking users to their tenants.
 * Preserves the users collection but adds membership documents.
 *
 * Prerequisites: migrate-clients-to-tenants.ts must run first
 *
 * Run with: npx ts-node src/migrations/migrate-users-to-memberships.ts
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

interface UserDoc {
  client_id?: string;
  email?: string;
  is_admin?: boolean;
  created_at?: admin.firestore.Timestamp;
}

interface MembershipDoc {
  uid: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  displayName: string;
  email: string;
  teamIds: string[];
  defaultTwinId?: string;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  _migratedFromUserId: string;
  _migratedAt: admin.firestore.FieldValue;
}

/**
 * Determine role based on user and tenant data
 */
async function determineRole(
  uid: string,
  tenantId: string,
  userData: UserDoc
): Promise<'owner' | 'admin' | 'member'> {
  // Check if user is the tenant owner
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (tenantDoc.exists) {
    const tenantData = tenantDoc.data();
    if (tenantData?.ownerUid === uid) {
      return 'owner';
    }
  }

  // Check if user has admin flag
  if (userData.is_admin === true) {
    return 'admin';
  }

  return 'member';
}

/**
 * Get display name from Firebase Auth or email
 */
async function getDisplayName(uid: string, email?: string): Promise<string> {
  try {
    const userRecord = await admin.auth().getUser(uid);
    return userRecord.displayName || userRecord.email?.split('@')[0] || 'User';
  } catch {
    return email?.split('@')[0] || 'User';
  }
}

/**
 * Get email from Firebase Auth or user doc
 */
async function getEmail(uid: string, userData: UserDoc): Promise<string> {
  if (userData.email) {
    return userData.email;
  }

  try {
    const userRecord = await admin.auth().getUser(uid);
    return userRecord.email || '';
  } catch {
    return '';
  }
}

/**
 * Migrate a single user to membership
 */
async function migrateUser(
  uid: string,
  userData: UserDoc,
  dryRun: boolean
): Promise<{ success: boolean; membershipId?: string; error?: string; skipped?: boolean }> {
  try {
    // Skip if no client_id (user not associated with any client)
    if (!userData.client_id) {
      console.log(`  ⏭️  User ${uid} has no client_id, skipping`);
      return { success: true, skipped: true };
    }

    const tenantId = userData.client_id;

    // Check if tenant exists (was migrated)
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      console.log(`  ⚠️  Tenant ${tenantId} not found for user ${uid}, skipping`);
      return { success: true, skipped: true };
    }

    // Membership document ID format: {uid}_{tenantId}
    const membershipId = `${uid}_${tenantId}`;

    // Check if already migrated
    const existingMembership = await db.collection('memberships').doc(membershipId).get();
    if (existingMembership.exists) {
      console.log(`  ⏭️  Membership ${membershipId} already exists`);
      return { success: true, membershipId };
    }

    // Get user details
    const displayName = await getDisplayName(uid, userData.email);
    const email = await getEmail(uid, userData);
    const role = await determineRole(uid, tenantId, userData);

    // Build membership document
    const membershipDoc: MembershipDoc = {
      uid,
      tenantId,
      role,
      displayName,
      email,
      teamIds: [], // No teams in legacy system
      createdAt: userData.created_at || admin.firestore.FieldValue.serverTimestamp(),
      _migratedFromUserId: uid,
      _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (dryRun) {
      console.log(`  🔍 Would create membership:`, JSON.stringify(membershipDoc, null, 2));
      return { success: true, membershipId: `dry-run-${membershipId}` };
    }

    // Create membership
    await db.collection('memberships').doc(membershipId).set(removeUndefined(membershipDoc));

    // Update user doc with default_tenant_id for quick lookup
    await db.collection('users').doc(uid).update({
      default_tenant_id: tenantId,
      _membershipMigrated: true,
      _membershipMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`  ✅ Created membership ${membershipId} (role: ${role})`);
    return { success: true, membershipId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Failed to migrate user ${uid}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Run the migration
 */
async function runMigration(dryRun: boolean = true): Promise<void> {
  console.log('='.repeat(60));
  console.log('Migration: Users → Memberships');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('='.repeat(60));

  // Verify tenants exist
  const tenantsCount = await db.collection('tenants').count().get();
  console.log(`\nFound ${tenantsCount.data().count} tenants`);

  if (tenantsCount.data().count === 0) {
    console.error('\n❌ No tenants found. Run migrate-clients-to-tenants.ts first!');
    process.exit(1);
  }

  // Fetch all users
  const usersSnapshot = await db.collection('users').get();

  console.log(`Found ${usersSnapshot.size} users to process\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const doc of usersSnapshot.docs) {
    const uid = doc.id;
    const userData = doc.data() as UserDoc;

    console.log(`Processing user: ${uid} (${userData.email || 'no email'})`);

    const result = await migrateUser(uid, userData, dryRun);

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
  console.log(`Total users:    ${usersSnapshot.size}`);
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

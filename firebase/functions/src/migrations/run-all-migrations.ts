/**
 * Master Migration Runner
 *
 * Runs all migrations in the correct order for the multi-tenant twins architecture.
 *
 * Order:
 * 1. Clients → Tenants
 * 2. Users → Memberships
 * 3. KB Articles → Sources + Chunks (also creates org twins)
 * 4. Escalations → Queries
 *
 * Run with: npx ts-node src/migrations/run-all-migrations.ts [--live]
 */

import * as admin from 'firebase-admin';
import { execSync } from 'child_process';
import * as path from 'path';

// Initialize Firebase Admin with explicit project
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'askkaya-47cef',
  });
}

const db = admin.firestore();

interface MigrationStatus {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

const migrations: MigrationStatus[] = [
  { name: 'migrate-clients-to-tenants', status: 'pending' },
  { name: 'migrate-users-to-memberships', status: 'pending' },
  { name: 'migrate-kb-to-sources-chunks', status: 'pending' },
  { name: 'migrate-escalations-to-queries', status: 'pending' },
];

/**
 * Check if a migration has already been completed
 */
async function checkMigrationCompleted(migrationName: string): Promise<boolean> {
  const migrationDoc = await db.collection('_migrations').doc(migrationName).get();
  return migrationDoc.exists && migrationDoc.data()?.status === 'completed';
}

/**
 * Record migration status in Firestore
 */
async function recordMigrationStatus(
  migrationName: string,
  status: 'running' | 'completed' | 'failed',
  error?: string
): Promise<void> {
  await db.collection('_migrations').doc(migrationName).set(
    {
      status,
      error: error || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(status === 'completed' ? { completedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    },
    { merge: true }
  );
}

/**
 * Run a single migration script
 */
function runMigration(migrationName: string, isLive: boolean): void {
  const scriptPath = path.join(__dirname, `${migrationName}.ts`);
  const liveFlag = isLive ? '--live' : '';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${migrationName}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    execSync(`npx ts-node ${scriptPath} ${liveFlag}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..'),
    });
  } catch (error) {
    throw new Error(`Migration ${migrationName} failed`);
  }
}

/**
 * Run all migrations in order
 */
async function runAllMigrations(isLive: boolean): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  MULTI-TENANT TWINS MIGRATION');
  console.log(`█  Mode: ${isLive ? 'LIVE' : 'DRY RUN'}`);
  console.log('█'.repeat(60) + '\n');

  if (!isLive) {
    console.log('⚠️  Running in DRY RUN mode. No changes will be made.');
    console.log('   Add --live flag to apply changes.\n');
  }

  // Pre-flight checks
  console.log('Pre-flight checks...\n');

  // Check existing data
  const clientsCount = await db.collection('clients').count().get();
  const usersCount = await db.collection('users').count().get();
  const articlesCount = await db.collection('kb_articles').count().get();
  const escalationsCount = await db.collection('escalations').count().get();

  console.log(`  Clients:      ${clientsCount.data().count}`);
  console.log(`  Users:        ${usersCount.data().count}`);
  console.log(`  KB Articles:  ${articlesCount.data().count}`);
  console.log(`  Escalations:  ${escalationsCount.data().count}`);

  // Check target collections
  const tenantsCount = await db.collection('tenants').count().get();
  const membershipsCount = await db.collection('memberships').count().get();
  const twinsCount = await db.collection('twins').count().get();
  const sourcesCount = await db.collection('sources').count().get();
  const chunksCount = await db.collection('chunks').count().get();
  const queriesCount = await db.collection('queries').count().get();

  console.log(`\n  Tenants:      ${tenantsCount.data().count} (target)`);
  console.log(`  Memberships:  ${membershipsCount.data().count} (target)`);
  console.log(`  Twins:        ${twinsCount.data().count} (target)`);
  console.log(`  Sources:      ${sourcesCount.data().count} (target)`);
  console.log(`  Chunks:       ${chunksCount.data().count} (target)`);
  console.log(`  Queries:      ${queriesCount.data().count} (target)`);

  console.log('\n');

  // Run migrations
  for (const migration of migrations) {
    // Check if already completed
    const alreadyCompleted = await checkMigrationCompleted(migration.name);
    if (alreadyCompleted && isLive) {
      console.log(`⏭️  Skipping ${migration.name} (already completed)`);
      migration.status = 'skipped';
      continue;
    }

    migration.status = 'running';
    migration.startedAt = new Date();

    if (isLive) {
      await recordMigrationStatus(migration.name, 'running');
    }

    try {
      runMigration(migration.name, isLive);
      migration.status = 'completed';
      migration.completedAt = new Date();

      if (isLive) {
        await recordMigrationStatus(migration.name, 'completed');
      }
    } catch (error) {
      migration.status = 'failed';
      migration.error = error instanceof Error ? error.message : String(error);

      if (isLive) {
        await recordMigrationStatus(migration.name, 'failed', migration.error);
      }

      console.error(`\n❌ Migration failed: ${migration.name}`);
      console.error(`   Error: ${migration.error}`);
      console.error('\n   Stopping migration sequence.');
      break;
    }
  }

  // Summary
  console.log('\n' + '█'.repeat(60));
  console.log('█  MIGRATION SUMMARY');
  console.log('█'.repeat(60) + '\n');

  for (const migration of migrations) {
    const statusIcon = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      skipped: '⏭️',
    }[migration.status];

    console.log(`  ${statusIcon} ${migration.name}: ${migration.status}`);
  }

  const failedCount = migrations.filter((m) => m.status === 'failed').length;
  const completedCount = migrations.filter((m) => m.status === 'completed').length;

  console.log('\n');

  if (failedCount > 0) {
    console.log('❌ Migration sequence failed. Please check errors above.');
  } else if (completedCount === migrations.length) {
    console.log('✅ All migrations completed successfully!');
  } else if (!isLive) {
    console.log('ℹ️  Dry run complete. Run with --live to apply changes.');
  }
}

// CLI entry point
const args = process.argv.slice(2);
const isLive = args.includes('--live');

runAllMigrations(isLive)
  .then(() => {
    console.log('\nMigration runner complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration runner failed:', error);
    process.exit(1);
  });

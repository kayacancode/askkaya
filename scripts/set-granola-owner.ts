#!/usr/bin/env npx ts-node
/**
 * Set owner_id for all Granola notes
 *
 * Usage: FIREBASE_SERVICE_ACCOUNT='...' OWNER_ID='your-uid' npx ts-node scripts/set-granola-owner.ts
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function setGranolaOwner() {
  const ownerId = process.env.OWNER_ID || 'kayajones';

  console.log(`Setting owner_id='${ownerId}' for all Granola notes...`);

  // Get all articles with source='granola'
  const snapshot = await db
    .collection('kb_articles')
    .where('source', '==', 'granola')
    .get();

  console.log(`Found ${snapshot.size} Granola articles`);

  // Update in batches
  const batchSize = 500;
  let updated = 0;

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + batchSize);

    for (const doc of chunk) {
      batch.update(doc.ref, {
        owner_id: ownerId,
        is_global: false, // Personal notes are not global
      });
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`Updated ${updated}/${docs.length} articles`);
  }

  console.log('Done!');
}

setGranolaOwner()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

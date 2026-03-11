/**
 * Quick script to create org twins for tenants that don't have them
 */
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'askkaya-47cef' });
}

const db = admin.firestore();

async function createMissingOrgTwins(): Promise<void> {
  const tenants = await db.collection('tenants').get();

  for (const doc of tenants.docs) {
    const tenantId = doc.id;
    const tenantData = doc.data();

    const existingTwin = await db
      .collection('twins')
      .where('tenantId', '==', tenantId)
      .where('type', '==', 'organization')
      .limit(1)
      .get();

    if (!existingTwin.empty) {
      console.log('[exists]', tenantId, '-', tenantData.name);
      continue;
    }

    const twinRef = await db.collection('twins').add({
      tenantId,
      type: 'organization',
      name: tenantData.name || 'Organization',
      slug: (tenantData.slug || tenantId) + '-org',
      description: 'Organization knowledge base for ' + (tenantData.name || tenantId),
      expertiseAreas: [],
      visibility: 'tenant',
      ownerUid: tenantData.ownerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      _createdByMigration: true,
    });

    console.log('[created]', twinRef.id, 'for', tenantId, '-', tenantData.name);
  }

  console.log('Done');
}

createMissingOrgTwins()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

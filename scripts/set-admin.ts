#!/usr/bin/env npx ts-node

/**
 * Set a user's admin status
 * Usage: npx ts-node scripts/set-admin.ts <email> [true|false]
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

const db = admin.firestore();

async function setAdmin(email: string, isAdmin: boolean) {
  // Find the user by email in Firebase Auth
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`Found user: ${userRecord.uid} (${userRecord.email})`);

    // Update the users collection
    await db.collection('users').doc(userRecord.uid).set(
      {
        is_admin: isAdmin,
        email: email,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`Set is_admin=${isAdmin} for ${email}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Main
const email = process.argv[2];
const isAdmin = process.argv[3] !== 'false'; // default to true if not specified

if (!email) {
  console.log('Usage: npx ts-node scripts/set-admin.ts <email> [true|false]');
  console.log('Example: npx ts-node scripts/set-admin.ts kayarjones901@gmail.com true');
  process.exit(1);
}

setAdmin(email, isAdmin).then(() => process.exit(0));

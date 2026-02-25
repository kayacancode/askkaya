#!/usr/bin/env npx ts-node
/**
 * Add KB Article Script
 *
 * Usage: npx ts-node scripts/add-kb-article.ts --title "Article Title" --content "Content here" [--client-id CLIENT_ID]
 */

import * as admin from 'firebase-admin';
import OpenAI from 'openai';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0]?.embedding || [];
}

async function addKBArticle(
  title: string,
  content: string,
  clientId?: string,
  tags: string[] = []
) {
  console.log(`Generating embedding for: ${title}`);

  // Combine title and content for embedding
  const textForEmbedding = `${title}\n\n${content}`;
  const embedding = await generateEmbedding(textForEmbedding);

  console.log(`Embedding generated: ${embedding.length} dimensions`);

  // Create article
  const articleData = {
    title,
    content,
    summary: content.substring(0, 200) + '...',
    embedding,
    tags,
    source: 'manual',
    is_global: !clientId,
    client_id: clientId || null,
    status: 'active',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection('kb_articles').add(articleData);
  console.log(`Article created with ID: ${docRef.id}`);

  return docRef.id;
}

// Parse CLI arguments
const args = process.argv.slice(2);
let title = '';
let content = '';
let clientId: string | undefined;
let tags: string[] = [];

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--title':
      title = args[++i] || '';
      break;
    case '--content':
      content = args[++i] || '';
      break;
    case '--client-id':
      clientId = args[++i];
      break;
    case '--tags':
      tags = (args[++i] || '').split(',');
      break;
  }
}

if (!title || !content) {
  console.log(`
Usage: npx ts-node scripts/add-kb-article.ts --title "Title" --content "Content" [options]

Options:
  --title     Article title (required)
  --content   Article content (required)
  --client-id Client ID for client-specific article
  --tags      Comma-separated tags

Environment variables required:
  FIREBASE_SERVICE_ACCOUNT  JSON string of service account
  OPENAI_API_KEY            OpenAI API key
  OPENAI_BASE_URL           OpenAI base URL (optional)
`);
  process.exit(1);
}

addKBArticle(title, content, clientId, tags)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

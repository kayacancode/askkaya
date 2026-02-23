import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { escalationId } = await req.json();

    if (!escalationId || typeof escalationId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid escalationId' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // Get escalation
    const escalationDoc = await db
      .collection('escalations')
      .doc(escalationId)
      .get();

    if (!escalationDoc.exists) {
      return NextResponse.json(
        { error: 'Escalation not found' },
        { status: 404 }
      );
    }

    const escalationData = escalationDoc.data();

    if (!escalationData?.answer) {
      return NextResponse.json(
        { error: 'Escalation has no answer to learn from' },
        { status: 400 }
      );
    }

    // Create KB article from Q&A
    const articleRef = await db.collection('kb_articles').add({
      title: `FAQ: ${escalationData.query?.substring(0, 50)}...`,
      summary: escalationData.query,
      content: escalationData.answer,
      source: 'auto-learn',
      client_id: escalationData.client_id || null,
      is_global: !escalationData.client_id,
      status: 'pending_embedding',
      created_at: new Date(),
      learned_from_escalation: escalationId,
    });

    // Update escalation to mark it as learned
    await db.collection('escalations').doc(escalationId).update({
      auto_learned: true,
      kb_article_id: articleRef.id,
    });

    return NextResponse.json({ success: true, article_id: articleRef.id });
  } catch (error) {
    console.error('Learn error:', error);
    return NextResponse.json(
      { error: 'Failed to create KB article' },
      { status: 500 }
    );
  }
}

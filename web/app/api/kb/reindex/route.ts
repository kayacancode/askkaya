import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { articleId } = await req.json();

    if (!articleId || typeof articleId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid articleId' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // Check if article exists
    const articleDoc = await db.collection('kb_articles').doc(articleId).get();
    if (!articleDoc.exists) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // Update article to trigger re-processing
    await db.collection('kb_articles').doc(articleId).update({
      reindex_requested: true,
      reindex_requested_at: new Date(),
      status: 'pending_embedding',
    });

    return NextResponse.json({ success: true, articleId });
  } catch (error) {
    console.error('Reindex error:', error);
    return NextResponse.json(
      { error: 'Failed to start re-indexing' },
      { status: 500 }
    );
  }
}

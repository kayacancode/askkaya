'use client'

import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { KnowledgeArticle } from '@/lib/types'
import { useRouter } from 'next/navigation'

export default function KBArticlePage({ params }: { params: { id: string } }) {
  const [article, setArticle] = useState<KnowledgeArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadArticle()
  }, [params.id])

  async function loadArticle() {
    try {
      const articleDoc = await getDoc(doc(db, 'kb_articles', params.id))
      if (!articleDoc.exists()) {
        router.push('/kb')
        return
      }
      
      const articleData = { id: articleDoc.id, ...articleDoc.data() } as KnowledgeArticle
      setArticle(articleData)
      setLoading(false)
    } catch (error) {
      console.error('Error loading article:', error)
      setLoading(false)
    }
  }

  async function handleReindex() {
    setReindexing(true)
    setMessage('')
    
    try {
      const response = await fetch('/api/kb/reindex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ article_id: params.id }),
      })
      
      if (response.ok) {
        setMessage('Re-indexing started successfully')
      } else {
        setMessage('Failed to start re-indexing')
      }
    } catch (error) {
      console.error('Error re-indexing:', error)
      setMessage('Failed to start re-indexing')
    } finally {
      setReindexing(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!article) {
    return null
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{article.title}</h1>
        
        {article.summary && (
          <p className="text-lg text-gray-600 mb-4">{article.summary}</p>
        )}

        {/* Metadata */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Source</dt>
              <dd className="mt-1 text-sm text-gray-900">{article.source}</dd>
            </div>
            {article.source_url && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Source URL</dt>
                <dd className="mt-1 text-sm text-gray-900 truncate">
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-500"
                  >
                    {article.source_url}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="mt-1">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    article.is_global
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {article.is_global ? 'Global' : `Client: ${article.client_id}`}
                </span>
              </dd>
            </div>
            {article.chunk_count && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Chunks</dt>
                <dd className="mt-1 text-sm text-gray-900">{article.chunk_count} chunks</dd>
              </div>
            )}
            {article.embedding_model && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Embedding Model</dt>
                <dd className="mt-1 text-sm text-gray-900">{article.embedding_model}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Content */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Content</h2>
          <div className="prose max-w-none">
            <p className="whitespace-pre-wrap text-gray-700">{article.content}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex space-x-4">
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
          >
            {reindexing ? 'Re-indexing...' : 'Re-process'}
          </button>
          <button
            onClick={() => router.push('/kb')}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Back to List
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-md bg-green-50 p-4">
            <div className="text-sm text-green-700">{message}</div>
          </div>
        )}
      </div>
    </div>
  )
}

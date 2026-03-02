'use client'

import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Client, KnowledgeArticle, QueryResponse } from '@/lib/types'
import { useRouter } from 'next/navigation'

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<Client | null>(null)
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [recentQueries, setRecentQueries] = useState<QueryResponse[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadData()
  }, [params.id])

  async function loadData() {
    try {
      // Load client
      const clientDoc = await getDoc(doc(db, 'clients', params.id))
      if (!clientDoc.exists()) {
        router.push('/clients')
        return
      }
      
      const clientData = { id: clientDoc.id, ...clientDoc.data() } as Client
      setClient(clientData)
      setEditedName(clientData.name)

      // Load KB articles for this client
      const articlesQuery = query(
        collection(db, 'kb_articles'),
        where('client_id', '==', params.id)
      )
      const articlesSnapshot = await getDocs(articlesQuery)
      const articlesData = articlesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as KnowledgeArticle))
      setArticles(articlesData)

      // Load recent queries
      const queriesQuery = query(
        collection(db, 'queries'),
        where('client_id', '==', params.id),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const queriesSnapshot = await getDocs(queriesQuery)
      const queriesData = queriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as QueryResponse))
      setRecentQueries(queriesData)

      setLoading(false)
    } catch (error) {
      console.error('Error loading client data:', error)
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!client) return
    
    try {
      await updateDoc(doc(db, 'clients', params.id), {
        name: editedName,
      })
      
      setClient({ ...client, name: editedName })
      setIsEditing(false)
    } catch (error) {
      console.error('Error updating client:', error)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!client) {
    return null
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="text-3xl font-bold text-gray-900 border-b-2 border-indigo-500 focus:outline-none"
              />
            ) : (
              <h1 className="text-3xl font-bold text-gray-900">{client.name}</h1>
            )}
          </div>
          <div className="flex space-x-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditedName(client.name)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Edit
              </button>
            )}
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-gray-500">Email</p>
            <p className="mt-1 text-sm text-gray-900">{client.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Status</p>
            <span
              className={`mt-1 inline-flex px-2 text-xs leading-5 font-semibold rounded-full ${
                client.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {client.status}
            </span>
          </div>
          {client.setup_context && client.setup_context.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-gray-500 mb-2">Setup Context</p>
              <div className="flex flex-wrap gap-2">
                {client.setup_context.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KB Articles */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Knowledge Base ({articles.length} articles)
        </h2>
        {articles.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {articles.map((article) => (
                <li key={article.id} className="px-4 py-4">
                  <p className="text-sm font-medium text-gray-900">{article.title}</p>
                  <p className="text-sm text-gray-500">{article.summary}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-gray-500">No articles yet.</p>
        )}
      </div>

      {/* Recent Queries */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Queries</h2>
        {recentQueries.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {recentQueries.map((q) => (
                <li key={q.id} className="px-4 py-4">
                  <p className="text-sm font-medium text-gray-900">{q.query}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {q.timestamp instanceof Date 
                      ? q.timestamp.toLocaleString()
                      : new Date(q.timestamp.toDate()).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-gray-500">No recent queries.</p>
        )}
      </div>
    </div>
  )
}

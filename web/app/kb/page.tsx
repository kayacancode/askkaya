'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { KnowledgeArticle } from '@/lib/types'
import Link from 'next/link'

export default function KBListPage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [filteredArticles, setFilteredArticles] = useState<KnowledgeArticle[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadArticles()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [articles, searchTerm, filter])

  async function loadArticles() {
    try {
      const articlesQuery = collection(db, 'kb_articles')
      const snapshot = await getDocs(articlesQuery)
      const articlesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as KnowledgeArticle))
      
      setArticles(articlesData)
      setLoading(false)
    } catch (error) {
      console.error('Error loading articles:', error)
      setLoading(false)
    }
  }

  function applyFilters() {
    let filtered = [...articles]

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        article =>
          article.title.toLowerCase().includes(term) ||
          article.content?.toLowerCase().includes(term) ||
          article.summary?.toLowerCase().includes(term)
      )
    }

    // Apply type filter
    if (filter === 'global') {
      filtered = filtered.filter(article => article.is_global)
    } else if (filter !== 'all') {
      filtered = filtered.filter(article => article.client_id === filter)
    }

    setFilteredArticles(filtered)
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Knowledge Base</h1>
      
      {/* Search and Filter */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <input
            type="text"
            placeholder="Search articles..."
            className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div>
          <select
            className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter"
          >
            <option value="all">All Articles</option>
            <option value="global">Global Only</option>
          </select>
        </div>
      </div>

      {/* Articles List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {filteredArticles.map((article) => (
            <li key={article.id}>
              <Link href={`/kb/${article.id}`} className="block hover:bg-gray-50">
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-medium text-indigo-600 truncate">
                        {article.title}
                      </p>
                      {article.summary && (
                        <p className="mt-1 text-sm text-gray-500">
                          {article.summary}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex-shrink-0 flex items-center space-x-2">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        {article.source}
                      </span>
                      {article.is_global && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          Global
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
          {filteredArticles.length === 0 && (
            <li className="px-4 py-8 text-center text-gray-500">
              No articles found.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

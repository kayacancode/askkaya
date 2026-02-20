'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Escalation } from '@/lib/types'
import Link from 'next/link'

export default function EscalationsListPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [statusFilter, setStatusFilter] = useState<'pending' | 'answered' | 'closed' | 'all'>('pending')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEscalations()
  }, [statusFilter])

  async function loadEscalations() {
    try {
      let escalationsQuery

      if (statusFilter === 'all') {
        escalationsQuery = query(
          collection(db, 'escalations'),
          orderBy('created_at', 'desc')
        )
      } else {
        escalationsQuery = query(
          collection(db, 'escalations'),
          where('status', '==', statusFilter),
          orderBy('created_at', 'desc')
        )
      }

      const snapshot = await getDocs(escalationsQuery)
      const escalationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Escalation))
      
      setEscalations(escalationsData)
      setLoading(false)
    } catch (error) {
      console.error('Error loading escalations:', error)
      setLoading(false)
    }
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
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Escalations</h1>
      
      {/* Status Filter */}
      <div className="mb-6">
        <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
          Status Filter
        </label>
        <select
          id="status-filter"
          className="block w-full sm:w-64 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          aria-label="Status"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="answered">Answered</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Escalations List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {escalations.map((escalation) => (
            <li key={escalation.id}>
              <Link href={`/escalations/${escalation.id}`} className="block hover:bg-gray-50">
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-indigo-600 truncate">
                        {escalation.client_name}
                      </p>
                      <p className="mt-1 text-sm text-gray-900">
                        {escalation.query}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {escalation.created_at instanceof Date
                          ? escalation.created_at.toLocaleString()
                          : new Date(escalation.created_at.toDate()).toLocaleString()}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          escalation.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : escalation.status === 'answered'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {escalation.status}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
          {escalations.length === 0 && (
            <li className="px-4 py-8 text-center text-gray-500">
              No {statusFilter !== 'all' ? statusFilter : ''} escalations found.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

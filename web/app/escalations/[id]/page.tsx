'use client'

import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Escalation } from '@/lib/types'
import { useRouter } from 'next/navigation'

export default function EscalationDetailPage({ params }: { params: { id: string } }) {
  const [escalation, setEscalation] = useState<Escalation | null>(null)
  const [answer, setAnswer] = useState('')
  const [autoLearn, setAutoLearn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadEscalation()
  }, [params.id])

  async function loadEscalation() {
    try {
      const escalationDoc = await getDoc(doc(db, 'escalations', params.id))
      if (!escalationDoc.exists()) {
        router.push('/escalations')
        return
      }
      
      const escalationData = { id: escalationDoc.id, ...escalationDoc.data() } as Escalation
      setEscalation(escalationData)
      setAnswer(escalationData.answer || '')
      setLoading(false)
    } catch (error) {
      console.error('Error loading escalation:', error)
      setLoading(false)
    }
  }

  async function handleSubmitReply() {
    if (!escalation || !answer.trim()) return
    
    setSubmitting(true)
    setMessage('')

    try {
      // Update escalation status
      await updateDoc(doc(db, 'escalations', params.id), {
        status: 'answered',
        answer: answer,
        answered_at: Timestamp.now(),
      })

      // Send to Telegram if applicable
      if (escalation.telegram_chat_id) {
        await fetch('/api/telegram/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: escalation.telegram_chat_id,
            message_id: escalation.telegram_message_id,
            text: answer,
          }),
        })
      }

      // Trigger auto-learn if requested
      if (autoLearn) {
        await fetch('/api/kb/learn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            escalation_id: params.id,
            query: escalation.query,
            answer: answer,
            client_id: escalation.client_id,
          }),
        })
      }

      setMessage('Reply sent successfully')
      setEscalation({ ...escalation, status: 'answered', answer })
    } catch (error) {
      console.error('Error submitting reply:', error)
      setMessage('Failed to send reply')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClose() {
    if (!escalation) return
    
    try {
      await updateDoc(doc(db, 'escalations', params.id), {
        status: 'closed',
        closed_at: Timestamp.now(),
      })

      setMessage('Ticket closed successfully')
      setEscalation({ ...escalation, status: 'closed' })
    } catch (error) {
      console.error('Error closing ticket:', error)
      setMessage('Failed to close ticket')
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!escalation) {
    return null
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Escalation Details</h1>
          <span
            className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${
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

        {/* Client and Query Info */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Query Information</h2>
          <dl className="grid grid-cols-1 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Client</dt>
              <dd className="mt-1 text-sm text-gray-900">{escalation.client_name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Query</dt>
              <dd className="mt-1 text-sm text-gray-900">{escalation.query}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created At</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {escalation.created_at instanceof Date
                  ? escalation.created_at.toLocaleString()
                  : new Date(escalation.created_at.toDate()).toLocaleString()}
              </dd>
            </div>
            {escalation.context && escalation.context.length > 0 && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Context</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  <ul className="list-disc list-inside space-y-1">
                    {escalation.context.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Reply Form */}
        {escalation.status === 'pending' && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reply</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="answer" className="block text-sm font-medium text-gray-700 mb-2">
                  Answer
                </label>
                <textarea
                  id="answer"
                  rows={6}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  aria-label="Answer"
                />
              </div>
              <div className="flex items-center">
                <input
                  id="auto-learn"
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  checked={autoLearn}
                  onChange={(e) => setAutoLearn(e.target.checked)}
                />
                <label htmlFor="auto-learn" className="ml-2 block text-sm text-gray-900">
                  Add to Knowledge Base (Auto-learn)
                </label>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleSubmitReply}
                  disabled={submitting || !answer.trim()}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {submitting ? 'Sending...' : 'Submit Reply'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Existing Answer */}
        {escalation.answer && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Answer</h2>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{escalation.answer}</p>
            {escalation.answered_at && (
              <p className="mt-2 text-xs text-gray-500">
                Answered at:{' '}
                {escalation.answered_at instanceof Date
                  ? escalation.answered_at.toLocaleString()
                  : new Date(escalation.answered_at.toDate()).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex space-x-4">
          {escalation.status === 'answered' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700"
            >
              Mark as Closed
            </button>
          )}
          <button
            onClick={() => router.push('/escalations')}
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

'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, orderBy, Timestamp as FirestoreTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { QueryResponse } from '@/lib/types'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ChartData {
  date: string
  queries: number
  escalations: number
  avgConfidence: number
}

export default function AnalyticsPage() {
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    try {
      // Get queries from last 7 days
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const queriesQuery = query(
        collection(db, 'queries'),
        where('timestamp', '>=', FirestoreTimestamp.fromDate(sevenDaysAgo)),
        orderBy('timestamp', 'asc')
      )
      
      const queriesSnapshot = await getDocs(queriesQuery)
      const queries = queriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as QueryResponse))

      // Get escalations from last 7 days
      const escalationsQuery = query(
        collection(db, 'escalations'),
        where('created_at', '>=', FirestoreTimestamp.fromDate(sevenDaysAgo)),
        orderBy('created_at', 'asc')
      )
      
      const escalationsSnapshot = await getDocs(escalationsQuery)
      const escalations = escalationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Array<{ id: string; created_at: Date | { toDate: () => Date } }>

      // Aggregate by day
      const dataByDay: Record<string, { queries: number; escalations: number; confidences: number[] }> = {}
      
      queries.forEach(q => {
        const date = q.timestamp instanceof Date 
          ? q.timestamp.toLocaleDateString()
          : new Date(q.timestamp.toDate()).toLocaleDateString()
        
        if (!dataByDay[date]) {
          dataByDay[date] = { queries: 0, escalations: 0, confidences: [] }
        }
        dataByDay[date].queries++
        if (q.confidence) {
          dataByDay[date].confidences.push(q.confidence)
        }
      })

      escalations.forEach(e => {
        const date = e.created_at instanceof Date
          ? e.created_at.toLocaleDateString()
          : new Date(e.created_at.toDate()).toLocaleDateString()
        
        if (!dataByDay[date]) {
          dataByDay[date] = { queries: 0, escalations: 0, confidences: [] }
        }
        dataByDay[date].escalations++
      })

      // Convert to chart format
      const chartData: ChartData[] = Object.keys(dataByDay)
        .sort()
        .map(date => ({
          date,
          queries: dataByDay[date].queries,
          escalations: dataByDay[date].escalations,
          avgConfidence: dataByDay[date].confidences.length > 0
            ? dataByDay[date].confidences.reduce((a, b) => a + b, 0) / dataByDay[date].confidences.length
            : 0,
        }))

      setChartData(chartData)
      setLoading(false)
    } catch (error) {
      console.error('Error loading analytics:', error)
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
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Analytics</h1>
      
      {/* Query Volume Chart */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Query Volume (Last 7 Days)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="queries" fill="#4F46E5" name="Queries" />
            <Bar dataKey="escalations" fill="#EF4444" name="Escalations" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence Chart */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Average Confidence (Last 7 Days)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="avgConfidence" 
              stroke="#10B981" 
              name="Avg Confidence"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Escalation } from '@/lib/types'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type StatusFilter = 'pending' | 'answered' | 'dismissed' | 'all'

export default function EscalationsListPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEscalations()
  }, [statusFilter])

  async function loadEscalations() {
    setLoading(true)
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
    } catch (error) {
      console.error('Error loading escalations:', error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>
      case 'answered':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Answered</Badge>
      case 'dismissed':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Dismissed</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  function formatDate(timestamp: any): string {
    if (!timestamp) return '-'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function truncate(text: string | undefined, length: number): string {
    if (!text) return '-'
    return text.length > length ? text.slice(0, length) + '...' : text
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Escalations</h1>
        <p className="text-muted-foreground">
          Review and respond to escalated queries
        </p>
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {!loading && statusFilter !== 'pending' && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {escalations.filter(e => e.status === 'pending').length || '?'}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="answered">Answered</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Escalations Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-12 w-24" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-[50%]">Query</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {escalations.map((escalation) => (
                  <TableRow key={escalation.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/escalations/${escalation.id}`} className="font-medium hover:underline">
                        {escalation.client_name || 'Unknown'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/escalations/${escalation.id}`} className="block">
                        <p className="text-sm">{truncate(escalation.query, 100)}</p>
                        {escalation.auto_learned && (
                          <Badge variant="outline" className="mt-1 text-xs">Auto-learned</Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {formatDate(escalation.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {getStatusBadge(escalation.status)}
                    </TableCell>
                  </TableRow>
                ))}
                {escalations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No {statusFilter !== 'all' ? statusFilter : ''} escalations found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

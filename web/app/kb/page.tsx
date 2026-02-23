'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { KnowledgeArticle } from '@/lib/types'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 25

export default function KBListPage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [filteredArticles, setFilteredArticles] = useState<KnowledgeArticle[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [stats, setStats] = useState({ total: 0, sources: {} as Record<string, number> })

  useEffect(() => {
    loadArticles()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [articles, searchTerm, sourceFilter])

  async function loadArticles(loadMore = false) {
    try {
      let articlesQuery = query(
        collection(db, 'kb_articles'),
        orderBy('created_at', 'desc'),
        limit(PAGE_SIZE)
      )

      if (loadMore && lastDoc) {
        articlesQuery = query(
          collection(db, 'kb_articles'),
          orderBy('created_at', 'desc'),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        )
      }

      const snapshot = await getDocs(articlesQuery)
      const articlesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as KnowledgeArticle))

      if (loadMore) {
        setArticles(prev => [...prev, ...articlesData])
      } else {
        setArticles(articlesData)
        // Calculate stats from first load
        const sourceCounts: Record<string, number> = {}
        articlesData.forEach(a => {
          sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1
        })
        setStats({ total: articlesData.length, sources: sourceCounts })
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null)
      setHasMore(snapshot.docs.length === PAGE_SIZE)
      setLoading(false)
    } catch (error) {
      console.error('Error loading articles:', error)
      setLoading(false)
    }
  }

  function applyFilters() {
    let filtered = [...articles]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        article =>
          article.title?.toLowerCase().includes(term) ||
          article.content?.toLowerCase().includes(term) ||
          article.summary?.toLowerCase().includes(term)
      )
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(article => article.source === sourceFilter)
    }

    setFilteredArticles(filtered)
  }

  function getSourceBadgeVariant(source: string): 'default' | 'secondary' | 'outline' | 'destructive' {
    switch (source) {
      case 'granola': return 'default'
      case 'escalation': return 'secondary'
      case 'telegram': return 'outline'
      default: return 'outline'
    }
  }

  function formatDate(timestamp: any): string {
    if (!timestamp) return '-'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function truncate(text: string | undefined, length: number): string {
    if (!text) return '-'
    return text.length > length ? text.slice(0, length) + '...' : text
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  const uniqueSources = [...new Set(articles.map(a => a.source))]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground">
            {articles.length} articles loaded
          </p>
        </div>
        <Button asChild>
          <Link href="/kb/new">Add Article</Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Articles</CardDescription>
            <CardTitle className="text-3xl">{articles.length}</CardTitle>
          </CardHeader>
        </Card>
        {uniqueSources.slice(0, 3).map(source => (
          <Card key={source}>
            <CardHeader className="pb-2">
              <CardDescription className="capitalize">{source}</CardDescription>
              <CardTitle className="text-3xl">
                {articles.filter(a => a.source === source).length}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Input
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sm:max-w-sm"
            />
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Filter by source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {uniqueSources.map(source => (
                  <SelectItem key={source} value={source} className="capitalize">
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Articles Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Title</TableHead>
                <TableHead className="hidden md:table-cell">Summary</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredArticles.map((article) => (
                <TableRow key={article.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/kb/${article.id}`} className="font-medium hover:underline">
                      {truncate(article.title, 60)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {truncate(article.summary, 80)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSourceBadgeVariant(article.source)} className="capitalize">
                      {article.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {formatDate(article.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {article.is_global ? (
                      <Badge variant="outline">Global</Badge>
                    ) : (
                      <Badge variant="secondary">Personal</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredArticles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No articles found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {hasMore && (
          <div className="p-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => loadArticles(true)}
            >
              Load More
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

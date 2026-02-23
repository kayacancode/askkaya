import { Timestamp } from 'firebase/firestore'

export interface Client {
  id: string
  name: string
  email: string
  status: 'active' | 'suspended'
  setup_context: string[]
  created_at: Date | Timestamp
  updated_at?: Date | Timestamp
  stripe_customer_id?: string
  stripe_subscription_id?: string
}

export interface KnowledgeArticle {
  id: string
  title: string
  summary?: string
  content?: string
  source: string
  source_url?: string
  source_id?: string
  client_id?: string | null
  owner_id?: string
  is_global?: boolean
  created_at: Date | Timestamp
  updated_at?: Date | Timestamp
  embedding_model?: string
  chunk_count?: number
  tags?: string[]
  status?: string
}

export interface Escalation {
  id: string
  client_id: string
  client_name: string
  query: string
  context?: string[]
  status: 'pending' | 'answered' | 'dismissed' | 'closed'
  created_at: Date | Timestamp
  answered_at?: Date | Timestamp
  dismissed_at?: Date | Timestamp
  closed_at?: Date | Timestamp
  answer?: string
  telegram_chat_id?: string
  telegram_message_id?: string
  confidence_score?: number
  auto_learned?: boolean
  kb_article_id?: string
}

export interface UsageRecord {
  id: string
  client_id: string
  timestamp: Date | Timestamp
  query_count: number
  embedding_tokens: number
  completion_tokens: number
  total_cost_usd: number
}

export interface QueryResponse {
  id: string
  client_id: string
  query: string
  answer: string
  confidence: number
  sources: string[]
  timestamp: Date | Timestamp
  escalated: boolean
}

export interface DashboardStats {
  recentQueries: number
  activeEscalations: number
  totalClients: number
  activeClients: number
  suspendedClients: number
  kbArticles?: number
}

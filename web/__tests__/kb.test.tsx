import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import KBListPage from '@/app/kb/page'
import KBArticlePage from '@/app/kb/[id]/page'
import { getDocs, getDoc, query, where, orderBy, updateDoc } from 'firebase/firestore'

// Mock Firestore
jest.mock('firebase/firestore')

describe('Knowledge Base Browser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('KB Article List', () => {
    it('lists all articles (global + per-client) with title, summary, source', async () => {
      const mockArticles = [
        {
          id: 'art-1',
          title: 'Global Shipping Policy',
          summary: 'Standard shipping information for all clients',
          source: 'manual',
          client_id: null,
          is_global: true,
        },
        {
          id: 'art-2',
          title: 'Payment Gateway Setup',
          summary: 'How to configure payment processing',
          source: 'imported',
          client_id: null,
          is_global: true,
        },
        {
          id: 'art-3',
          title: 'Acme Corp Specific Policy',
          summary: 'Custom policy for Acme',
          source: 'url',
          client_id: 'client-1',
          is_global: false,
        },
        {
          id: 'art-4',
          title: 'TechStart API Documentation',
          summary: 'API endpoints and usage',
          source: 'pdf',
          client_id: 'client-2',
          is_global: false,
        },
      ]

      const mockGetDocs = getDocs as jest.Mock
      mockGetDocs.mockResolvedValue({
        docs: mockArticles.map(a => ({
          id: a.id,
          data: () => a,
        })),
      })

      render(await KBListPage())

      await waitFor(() => {
        expect(screen.getByText('Global Shipping Policy')).toBeInTheDocument()
        expect(screen.getByText('Payment Gateway Setup')).toBeInTheDocument()
        expect(screen.getByText('Acme Corp Specific Policy')).toBeInTheDocument()
        expect(screen.getByText('TechStart API Documentation')).toBeInTheDocument()
      })

      // Check summaries
      expect(screen.getByText(/Standard shipping information/i)).toBeInTheDocument()
      expect(screen.getByText(/How to configure payment/i)).toBeInTheDocument()

      // Check sources
      expect(screen.getByText(/manual/i)).toBeInTheDocument()
      expect(screen.getByText(/imported/i)).toBeInTheDocument()
      expect(screen.getByText(/url/i)).toBeInTheDocument()
      expect(screen.getByText(/pdf/i)).toBeInTheDocument()
    })

    it('search filters by title/content text match', async () => {
      const allArticles = [
        {
          id: 'art-1',
          title: 'Shipping Policy',
          content: 'We ship worldwide',
          summary: 'Shipping info',
        },
        {
          id: 'art-2',
          title: 'Returns Policy',
          content: 'Return within 30 days',
          summary: 'Returns info',
        },
        {
          id: 'art-3',
          title: 'Payment Methods',
          content: 'We accept credit cards and PayPal',
          summary: 'Payment info',
        },
      ]

      const mockGetDocs = getDocs as jest.Mock
      mockGetDocs.mockResolvedValue({
        docs: allArticles.map(a => ({
          id: a.id,
          data: () => a,
        })),
      })

      render(await KBListPage())

      // Initial render shows all articles
      await waitFor(() => {
        expect(screen.getByText('Shipping Policy')).toBeInTheDocument()
        expect(screen.getByText('Returns Policy')).toBeInTheDocument()
        expect(screen.getByText('Payment Methods')).toBeInTheDocument()
      })

      // Search for "shipping"
      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'shipping' } })

      await waitFor(() => {
        expect(screen.getByText('Shipping Policy')).toBeInTheDocument()
        expect(screen.queryByText('Returns Policy')).not.toBeInTheDocument()
        expect(screen.queryByText('Payment Methods')).not.toBeInTheDocument()
      })
    })

    it('filter by client or global', async () => {
      const mockArticles = [
        {
          id: 'art-1',
          title: 'Global Article 1',
          client_id: null,
          is_global: true,
        },
        {
          id: 'art-2',
          title: 'Global Article 2',
          client_id: null,
          is_global: true,
        },
        {
          id: 'art-3',
          title: 'Client Article 1',
          client_id: 'client-1',
          is_global: false,
        },
      ]

      const mockGetDocs = getDocs as jest.Mock
      mockGetDocs.mockImplementation((q) => {
        const queryStr = JSON.stringify(q)
        if (queryStr.includes('client-1')) {
          return Promise.resolve({
            docs: [mockArticles[2]].map(a => ({ id: a.id, data: () => a })),
          })
        }
        if (queryStr.includes('is_global')) {
          return Promise.resolve({
            docs: mockArticles.slice(0, 2).map(a => ({ id: a.id, data: () => a })),
          })
        }
        return Promise.resolve({
          docs: mockArticles.map(a => ({ id: a.id, data: () => a })),
        })
      })

      render(await KBListPage())

      // Filter by global
      const filterSelect = screen.getByLabelText(/filter/i)
      fireEvent.change(filterSelect, { target: { value: 'global' } })

      await waitFor(() => {
        expect(screen.getByText('Global Article 1')).toBeInTheDocument()
        expect(screen.getByText('Global Article 2')).toBeInTheDocument()
        expect(screen.queryByText('Client Article 1')).not.toBeInTheDocument()
      })

      // Filter by specific client
      fireEvent.change(filterSelect, { target: { value: 'client-1' } })

      await waitFor(() => {
        expect(where).toHaveBeenCalledWith('client_id', '==', 'client-1')
      })
    })
  })

  describe('Article Viewer', () => {
    it('shows full content with metadata', async () => {
      const mockArticle = {
        id: 'art-1',
        title: 'Comprehensive Shipping Guide',
        summary: 'Everything about shipping',
        content: 'Full detailed content about shipping policies...',
        source: 'pdf',
        source_url: 'https://example.com/shipping.pdf',
        client_id: 'client-1',
        is_global: false,
        created_at: new Date('2024-01-15'),
        updated_at: new Date('2024-02-01'),
        embedding_model: 'text-embedding-ada-002',
        chunk_count: 5,
      }

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockArticle.id,
        data: () => mockArticle,
      })

      render(await KBArticlePage({ params: { id: 'art-1' } }))

      await waitFor(() => {
        expect(screen.getByText('Comprehensive Shipping Guide')).toBeInTheDocument()
        expect(screen.getByText(/Everything about shipping/i)).toBeInTheDocument()
        expect(screen.getByText(/Full detailed content about shipping/i)).toBeInTheDocument()
      })

      // Metadata
      expect(screen.getByText(/source.*pdf/i)).toBeInTheDocument()
      expect(screen.getByText(/shipping.pdf/i)).toBeInTheDocument()
      expect(screen.getByText(/client-1/i)).toBeInTheDocument()
      expect(screen.getByText(/5.*chunks/i)).toBeInTheDocument()
      expect(screen.getByText(/text-embedding-ada-002/i)).toBeInTheDocument()
    })

    it('re-process button triggers re-indexing', async () => {
      const mockArticle = {
        id: 'art-1',
        title: 'Sample Article',
        content: 'Content to re-index',
        source: 'manual',
      }

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockArticle.id,
        data: () => mockArticle,
      })

      const mockUpdateDoc = updateDoc as jest.Mock
      mockUpdateDoc.mockResolvedValue(undefined)

      // Mock fetch for re-indexing API
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      render(await KBArticlePage({ params: { id: 'art-1' } }))

      await waitFor(() => {
        expect(screen.getByText('Sample Article')).toBeInTheDocument()
      })

      const reprocessButton = screen.getByRole('button', { name: /re-process|re-index/i })
      fireEvent.click(reprocessButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/kb/reindex'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('art-1'),
          })
        )
      })

      // Verify success message
      expect(screen.getByText(/re-indexing started|successfully queued/i)).toBeInTheDocument()
    })
  })
})

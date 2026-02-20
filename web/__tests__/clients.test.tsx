import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClientsListPage from '@/app/clients/page'
import ClientDetailPage from '@/app/clients/[id]/page'
import ClientCreatePage from '@/app/clients/create/page'
import { getDocs, getDoc, doc, addDoc, updateDoc, query, where } from 'firebase/firestore'

// Mock Firestore
jest.mock('firebase/firestore')

describe('Client Management', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Client List', () => {
    it('shows all clients with name, status, setup_context tags', async () => {
      const mockClients = [
        {
          id: 'client-1',
          name: 'Acme Corp',
          email: 'admin@acme.com',
          status: 'active',
          setup_context: ['e-commerce', 'shipping'],
        },
        {
          id: 'client-2',
          name: 'TechStart Inc',
          email: 'hello@techstart.io',
          status: 'active',
          setup_context: ['saas', 'billing', 'api'],
        },
        {
          id: 'client-3',
          name: 'Old Corp',
          email: 'contact@oldcorp.com',
          status: 'suspended',
          setup_context: ['legacy'],
        },
      ]

      const mockGetDocs = getDocs as jest.Mock
      mockGetDocs.mockResolvedValue({
        docs: mockClients.map(c => ({
          id: c.id,
          data: () => c,
        })),
      })

      render(await ClientsListPage())

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument()
        expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
        expect(screen.getByText('Old Corp')).toBeInTheDocument()
      })

      // Check status display
      expect(screen.getAllByText(/active/i)).toHaveLength(2)
      expect(screen.getByText(/suspended/i)).toBeInTheDocument()

      // Check setup_context tags
      expect(screen.getByText('e-commerce')).toBeInTheDocument()
      expect(screen.getByText('shipping')).toBeInTheDocument()
      expect(screen.getByText('saas')).toBeInTheDocument()
      expect(screen.getByText('billing')).toBeInTheDocument()
      expect(screen.getByText('api')).toBeInTheDocument()
      expect(screen.getByText('legacy')).toBeInTheDocument()
    })
  })

  describe('Client Detail', () => {
    it('shows full client info + per-client KB article count + recent queries', async () => {
      const mockClient = {
        id: 'client-1',
        name: 'Acme Corp',
        email: 'admin@acme.com',
        status: 'active',
        setup_context: ['e-commerce', 'shipping'],
        created_at: new Date('2024-01-01'),
      }

      const mockArticles = [
        { id: 'art-1', title: 'Shipping Policy', client_id: 'client-1' },
        { id: 'art-2', title: 'Returns Process', client_id: 'client-1' },
        { id: 'art-3', title: 'Payment Methods', client_id: 'client-1' },
      ]

      const mockQueries = [
        {
          id: 'q-1',
          query: 'How do I track my order?',
          timestamp: new Date('2024-02-20T10:00:00'),
        },
        {
          id: 'q-2',
          query: 'What are your shipping rates?',
          timestamp: new Date('2024-02-20T09:30:00'),
        },
      ]

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockClient.id,
        data: () => mockClient,
      })

      const mockGetDocs = getDocs as jest.Mock
      mockGetDocs.mockImplementation((q) => {
        const queryStr = JSON.stringify(q)
        if (queryStr.includes('kb_articles')) {
          return Promise.resolve({
            docs: mockArticles.map(a => ({ id: a.id, data: () => a })),
            size: mockArticles.length,
          })
        }
        if (queryStr.includes('queries')) {
          return Promise.resolve({
            docs: mockQueries.map(q => ({ id: q.id, data: () => q })),
          })
        }
        return Promise.resolve({ docs: [], size: 0 })
      })

      render(await ClientDetailPage({ params: { id: 'client-1' } }))

      await waitFor(() => {
        // Full client info
        expect(screen.getByText('Acme Corp')).toBeInTheDocument()
        expect(screen.getByText('admin@acme.com')).toBeInTheDocument()
        expect(screen.getByText(/active/i)).toBeInTheDocument()
        expect(screen.getByText('e-commerce')).toBeInTheDocument()
        expect(screen.getByText('shipping')).toBeInTheDocument()

        // KB article count
        expect(screen.getByText(/3.*articles/i)).toBeInTheDocument()

        // Recent queries
        expect(screen.getByText('How do I track my order?')).toBeInTheDocument()
        expect(screen.getByText('What are your shipping rates?')).toBeInTheDocument()
      })
    })
  })

  describe('Client Create', () => {
    it('shows create form with name, email, setup_context tags', async () => {
      render(await ClientCreatePage())

      await waitFor(() => {
        expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/setup.*context/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /create client/i })).toBeInTheDocument()
      })
    })

    it('submits form and creates client in Firestore', async () => {
      const mockAddDoc = addDoc as jest.Mock
      mockAddDoc.mockResolvedValue({ id: 'new-client-id' })

      render(await ClientCreatePage())

      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)
      const setupContextInput = screen.getByLabelText(/setup.*context/i)
      const submitButton = screen.getByRole('button', { name: /create client/i })

      fireEvent.change(nameInput, { target: { value: 'New Client Corp' } })
      fireEvent.change(emailInput, { target: { value: 'contact@newclient.com' } })
      fireEvent.change(setupContextInput, { target: { value: 'saas, api, webhooks' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockAddDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            name: 'New Client Corp',
            email: 'contact@newclient.com',
            setup_context: expect.arrayContaining(['saas', 'api', 'webhooks']),
            status: 'active',
          })
        )
      })
    })
  })

  describe('Client Edit', () => {
    it('updates Firestore document on edit', async () => {
      const mockClient = {
        id: 'client-1',
        name: 'Acme Corp',
        email: 'admin@acme.com',
        status: 'active',
        setup_context: ['e-commerce', 'shipping'],
      }

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockClient.id,
        data: () => mockClient,
      })

      const mockUpdateDoc = updateDoc as jest.Mock
      mockUpdateDoc.mockResolvedValue(undefined)

      render(await ClientDetailPage({ params: { id: 'client-1' } }))

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      })

      const editButton = screen.getByRole('button', { name: /edit/i })
      fireEvent.click(editButton)

      const nameInput = screen.getByDisplayValue('Acme Corp')
      fireEvent.change(nameInput, { target: { value: 'Acme Corporation' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            name: 'Acme Corporation',
          })
        )
      })
    })
  })
})

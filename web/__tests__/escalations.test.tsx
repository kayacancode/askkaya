import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EscalationsListPage from '@/app/escalations/page'
import EscalationDetailPage from '@/app/escalations/[id]/page'
import { getDocs, getDoc, query, where, updateDoc, addDoc } from 'firebase/firestore'

// Mock Firestore
jest.mock('firebase/firestore')

describe('Escalation Queue', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Escalation List', () => {
    it('lists tickets filtered by status (pending/answered/closed)', async () => {
      const mockEscalations = [
        {
          id: 'esc-1',
          client_id: 'client-1',
          client_name: 'Acme Corp',
          query: 'How do I cancel my subscription?',
          status: 'pending',
          created_at: new Date('2024-02-20T10:00:00'),
        },
        {
          id: 'esc-2',
          client_id: 'client-2',
          client_name: 'TechStart Inc',
          query: 'API rate limits not working',
          status: 'pending',
          created_at: new Date('2024-02-20T09:00:00'),
        },
        {
          id: 'esc-3',
          client_id: 'client-1',
          client_name: 'Acme Corp',
          query: 'Previous issue resolved',
          status: 'answered',
          created_at: new Date('2024-02-19T15:00:00'),
          answered_at: new Date('2024-02-19T16:00:00'),
        },
        {
          id: 'esc-4',
          client_id: 'client-3',
          client_name: 'Old Corp',
          query: 'Old closed ticket',
          status: 'closed',
          created_at: new Date('2024-02-18T10:00:00'),
          closed_at: new Date('2024-02-18T11:00:00'),
        },
      ]

      const mockGetDocs = getDocs as jest.Mock
      mockGetDocs.mockImplementation((q) => {
        const queryStr = JSON.stringify(q)
        if (queryStr.includes('pending')) {
          return Promise.resolve({
            docs: mockEscalations
              .filter(e => e.status === 'pending')
              .map(e => ({ id: e.id, data: () => e })),
          })
        }
        return Promise.resolve({
          docs: mockEscalations.map(e => ({ id: e.id, data: () => e })),
        })
      })

      render(await EscalationsListPage())

      // Default view should show pending tickets
      await waitFor(() => {
        expect(screen.getByText('How do I cancel my subscription?')).toBeInTheDocument()
        expect(screen.getByText('API rate limits not working')).toBeInTheDocument()
      })

      // Verify client names are shown
      expect(screen.getAllByText('Acme Corp')).toHaveLength(1)
      expect(screen.getByText('TechStart Inc')).toBeInTheDocument()

      // Change filter to "answered"
      const statusFilter = screen.getByLabelText(/status|filter/i)
      fireEvent.change(statusFilter, { target: { value: 'answered' } })

      await waitFor(() => {
        expect(where).toHaveBeenCalledWith('status', '==', 'answered')
      })

      // Change filter to "closed"
      fireEvent.change(statusFilter, { target: { value: 'closed' } })

      await waitFor(() => {
        expect(where).toHaveBeenCalledWith('status', '==', 'closed')
      })
    })
  })

  describe('Ticket Detail', () => {
    it('shows client name, query, context, timestamps', async () => {
      const mockEscalation = {
        id: 'esc-1',
        client_id: 'client-1',
        client_name: 'Acme Corp',
        query: 'How do I cancel my subscription?',
        context: [
          'User asked about cancellation',
          'Bot confidence was 0.45',
          'No relevant KB articles found',
        ],
        status: 'pending',
        created_at: new Date('2024-02-20T10:30:00'),
        telegram_message_id: '12345',
      }

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockEscalation.id,
        data: () => mockEscalation,
      })

      render(await EscalationDetailPage({ params: { id: 'esc-1' } }))

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument()
        expect(screen.getByText('How do I cancel my subscription?')).toBeInTheDocument()
        expect(screen.getByText(/pending/i)).toBeInTheDocument()
      })

      // Check context
      expect(screen.getByText(/User asked about cancellation/i)).toBeInTheDocument()
      expect(screen.getByText(/Bot confidence was 0.45/i)).toBeInTheDocument()
      expect(screen.getByText(/No relevant KB articles found/i)).toBeInTheDocument()

      // Check timestamp
      expect(screen.getByText(/2024-02-20/i)).toBeInTheDocument()
      expect(screen.getByText(/10:30/i)).toBeInTheDocument()
    })

    it('reply form submits answer, updates status, triggers auto-learn', async () => {
      const mockEscalation = {
        id: 'esc-1',
        client_id: 'client-1',
        client_name: 'Acme Corp',
        query: 'How do I cancel my subscription?',
        status: 'pending',
        created_at: new Date('2024-02-20T10:30:00'),
      }

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockEscalation.id,
        data: () => mockEscalation,
      })

      const mockUpdateDoc = updateDoc as jest.Mock
      mockUpdateDoc.mockResolvedValue(undefined)

      const mockAddDoc = addDoc as jest.Mock
      mockAddDoc.mockResolvedValue({ id: 'new-kb-article-id' })

      // Mock fetch for auto-learn API
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, article_id: 'new-kb-article-id' }),
      })

      render(await EscalationDetailPage({ params: { id: 'esc-1' } }))

      await waitFor(() => {
        expect(screen.getByText('How do I cancel my subscription?')).toBeInTheDocument()
      })

      // Fill in reply
      const answerTextarea = screen.getByLabelText(/answer|reply/i)
      fireEvent.change(answerTextarea, {
        target: {
          value: 'To cancel your subscription, go to Settings > Billing > Cancel Subscription.',
        },
      })

      // Check auto-learn checkbox
      const autoLearnCheckbox = screen.getByLabelText(/auto-learn|add to kb/i)
      fireEvent.click(autoLearnCheckbox)

      // Submit reply
      const submitButton = screen.getByRole('button', { name: /send|submit reply/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        // Verify escalation status updated
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: 'answered',
            answer: expect.stringContaining('To cancel your subscription'),
            answered_at: expect.any(Object),
          })
        )
      })

      // Verify auto-learn triggered
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/kb/learn'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('esc-1'),
        })
      )

      // Verify success message
      expect(screen.getByText(/reply sent|answer submitted/i)).toBeInTheDocument()
    })

    it('close button marks ticket as closed', async () => {
      const mockEscalation = {
        id: 'esc-1',
        client_id: 'client-1',
        client_name: 'Acme Corp',
        query: 'How do I cancel my subscription?',
        status: 'answered',
        answer: 'Go to Settings > Billing > Cancel',
        created_at: new Date('2024-02-20T10:30:00'),
        answered_at: new Date('2024-02-20T11:00:00'),
      }

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockEscalation.id,
        data: () => mockEscalation,
      })

      const mockUpdateDoc = updateDoc as jest.Mock
      mockUpdateDoc.mockResolvedValue(undefined)

      render(await EscalationDetailPage({ params: { id: 'esc-1' } }))

      await waitFor(() => {
        expect(screen.getByText('How do I cancel my subscription?')).toBeInTheDocument()
        expect(screen.getByText(/answered/i)).toBeInTheDocument()
      })

      const closeButton = screen.getByRole('button', { name: /close|mark.*closed/i })
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: 'closed',
            closed_at: expect.any(Object),
          })
        )
      })

      // Verify success message
      expect(screen.getByText(/ticket closed|marked as closed/i)).toBeInTheDocument()
    })
  })

  describe('Telegram Integration', () => {
    it('sends reply to Telegram when answering escalation', async () => {
      const mockEscalation = {
        id: 'esc-1',
        client_id: 'client-1',
        query: 'Help needed',
        status: 'pending',
        telegram_chat_id: '123456789',
        telegram_message_id: '987654321',
      }

      const mockGetDoc = getDoc as jest.Mock
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: mockEscalation.id,
        data: () => mockEscalation,
      })

      const mockUpdateDoc = updateDoc as jest.Mock
      mockUpdateDoc.mockResolvedValue(undefined)

      // Mock Telegram API
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      render(await EscalationDetailPage({ params: { id: 'esc-1' } }))

      await waitFor(() => {
        expect(screen.getByText('Help needed')).toBeInTheDocument()
      })

      const answerTextarea = screen.getByLabelText(/answer|reply/i)
      fireEvent.change(answerTextarea, {
        target: { value: 'Here is the solution to your problem.' },
      })

      const submitButton = screen.getByRole('button', { name: /send|submit reply/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/telegram/reply'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('123456789'),
          })
        )
      })
    })
  })
})

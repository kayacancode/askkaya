import { render, screen, waitFor } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'
import { getDocs, query, where, collection, Timestamp } from 'firebase/firestore'

// Mock Firestore
jest.mock('firebase/firestore')

describe('Dashboard Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders recent query count (last 24 hours)', async () => {
    const mockQueries = [
      { id: '1', query: 'Test query 1', timestamp: Timestamp.now() },
      { id: '2', query: 'Test query 2', timestamp: Timestamp.now() },
      { id: '3', query: 'Test query 3', timestamp: Timestamp.now() },
    ]

    const mockGetDocs = getDocs as jest.Mock
    mockGetDocs.mockResolvedValue({
      docs: mockQueries.map(q => ({
        id: q.id,
        data: () => q,
      })),
      size: mockQueries.length,
    })

    render(await DashboardPage())

    await waitFor(() => {
      expect(screen.getByText(/recent queries/i)).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    // Verify it queried for last 24 hours
    expect(query).toHaveBeenCalled()
    expect(where).toHaveBeenCalledWith(
      'timestamp',
      '>=',
      expect.any(Object)
    )
  })

  it('renders active escalation count', async () => {
    const mockEscalations = [
      { id: '1', status: 'pending', query: 'Help needed' },
      { id: '2', status: 'pending', query: 'Another issue' },
    ]

    const mockGetDocs = getDocs as jest.Mock
    mockGetDocs.mockImplementation((q) => {
      // Return different results based on collection
      const queryStr = JSON.stringify(q)
      if (queryStr.includes('escalations')) {
        return Promise.resolve({
          docs: mockEscalations.map(e => ({
            id: e.id,
            data: () => e,
          })),
          size: mockEscalations.length,
        })
      }
      return Promise.resolve({ docs: [], size: 0 })
    })

    render(await DashboardPage())

    await waitFor(() => {
      expect(screen.getByText(/active escalations/i)).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    // Verify it filtered by pending status
    expect(where).toHaveBeenCalledWith('status', '==', 'pending')
  })

  it('renders client count', async () => {
    const mockClients = [
      { id: '1', name: 'Client A', status: 'active' },
      { id: '2', name: 'Client B', status: 'active' },
      { id: '3', name: 'Client C', status: 'active' },
      { id: '4', name: 'Client D', status: 'suspended' },
    ]

    const mockGetDocs = getDocs as jest.Mock
    mockGetDocs.mockImplementation((q) => {
      const queryStr = JSON.stringify(q)
      if (queryStr.includes('clients')) {
        return Promise.resolve({
          docs: mockClients.map(c => ({
            id: c.id,
            data: () => c,
          })),
          size: mockClients.length,
        })
      }
      return Promise.resolve({ docs: [], size: 0 })
    })

    render(await DashboardPage())

    await waitFor(() => {
      expect(screen.getByText(/total clients/i)).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
    })
  })

  it('renders billing summary (active vs suspended)', async () => {
    const mockClients = [
      { id: '1', name: 'Active Client 1', status: 'active' },
      { id: '2', name: 'Active Client 2', status: 'active' },
      { id: '3', name: 'Active Client 3', status: 'active' },
      { id: '4', name: 'Suspended Client 1', status: 'suspended' },
      { id: '5', name: 'Suspended Client 2', status: 'suspended' },
    ]

    const mockGetDocs = getDocs as jest.Mock
    mockGetDocs.mockImplementation((q) => {
      const queryStr = JSON.stringify(q)
      if (queryStr.includes('clients')) {
        return Promise.resolve({
          docs: mockClients.map(c => ({
            id: c.id,
            data: () => c,
          })),
          size: mockClients.length,
        })
      }
      return Promise.resolve({ docs: [], size: 0 })
    })

    render(await DashboardPage())

    await waitFor(() => {
      expect(screen.getByText(/billing summary/i)).toBeInTheDocument()
      expect(screen.getByText(/active.*3/i)).toBeInTheDocument()
      expect(screen.getByText(/suspended.*2/i)).toBeInTheDocument()
    })
  })

  it('uses Server Components fetching from Firestore', async () => {
    const mockGetDocs = getDocs as jest.Mock
    mockGetDocs.mockResolvedValue({
      docs: [],
      size: 0,
    })

    // Dashboard page should be an async Server Component
    const dashboardPromise = DashboardPage()
    expect(dashboardPromise).toBeInstanceOf(Promise)

    render(await dashboardPromise)

    // Verify Firestore was called during server render
    expect(collection).toHaveBeenCalled()
    expect(getDocs).toHaveBeenCalled()
  })
})

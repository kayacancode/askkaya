import { getAdminDb } from '@/lib/firebase-admin'
import { DashboardStats } from '@/lib/types'
import { Timestamp } from 'firebase-admin/firestore'

// Disable static generation - requires runtime data
export const dynamic = 'force-dynamic'

async function getDashboardStats(): Promise<DashboardStats> {
  const db = getAdminDb()
  
  // Get recent queries (last 24 hours)
  const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const queriesSnapshot = await db
    .collection('queries')
    .where('timestamp', '>=', oneDayAgo)
    .get()
  
  // Get active escalations
  const escalationsSnapshot = await db
    .collection('escalations')
    .where('status', '==', 'pending')
    .get()
  
  // Get all clients
  const clientsSnapshot = await db.collection('clients').get()
  
  // Calculate billing summary
  let activeClients = 0
  let suspendedClients = 0
  
  clientsSnapshot.docs.forEach((doc) => {
    const data = doc.data()
    if (data.status === 'active') {
      activeClients++
    } else if (data.status === 'suspended') {
      suspendedClients++
    }
  })
  
  return {
    recentQueries: queriesSnapshot.size,
    activeEscalations: escalationsSnapshot.size,
    totalClients: clientsSnapshot.size,
    activeClients,
    suspendedClients,
  }
}

export default async function DashboardPage() {
  const stats = await getDashboardStats()
  
  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Recent Queries Card */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Recent Queries (24h)
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.recentQueries}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Active Escalations Card */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Active Escalations
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.activeEscalations}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Total Clients Card */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Clients
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.totalClients}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Billing Summary */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Billing Summary</h2>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Clients</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">{stats.activeClients}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Suspended Clients</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{stats.suspendedClients}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

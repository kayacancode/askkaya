import { getAdminDb } from '@/lib/firebase-admin'
import { Client } from '@/lib/types'
import Link from 'next/link'

async function getClients(): Promise<Client[]> {
  const db = getAdminDb()
  const snapshot = await db.collection('clients').get()
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Client))
}

export default async function ClientsListPage() {
  const clients = await getClients()
  
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
        <Link
          href="/clients/create"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Create Client
        </Link>
      </div>
      
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {clients.map((client) => (
            <li key={client.id}>
              <Link href={`/clients/${client.id}`} className="block hover:bg-gray-50">
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-medium text-indigo-600 truncate">
                        {client.name}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {client.email}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0 flex items-center space-x-2">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          client.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {client.status}
                      </span>
                    </div>
                  </div>
                  {client.setup_context && client.setup_context.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {client.setup_context.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {clients.length === 0 && (
            <li className="px-4 py-8 text-center text-gray-500">
              No clients found. Create your first client to get started.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

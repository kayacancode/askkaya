'use client';

import { Client } from '@/lib/types';
import { ClientCard } from './ClientCard';

interface ClientListProps {
  clients: Client[];
}

export function ClientList({ clients }: ClientListProps) {
  if (clients.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No clients found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {clients.map((client) => (
          <li key={client.id}>
            <ClientCard client={client} />
          </li>
        ))}
      </ul>
    </div>
  );
}

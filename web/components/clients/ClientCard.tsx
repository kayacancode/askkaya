'use client';

import Link from 'next/link';
import { Client } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

interface ClientCardProps {
  client: Client;
}

export function ClientCard({ client }: ClientCardProps) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="block hover:bg-gray-50 transition-colors"
    >
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium text-indigo-600 truncate">
              {client.name}
            </p>
            <p className="mt-1 text-sm text-gray-500">{client.email}</p>
          </div>
          <div className="ml-4 flex-shrink-0">
            <StatusBadge status={client.status} />
          </div>
        </div>
        {client.setup_context && client.setup_context.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {client.setup_context.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

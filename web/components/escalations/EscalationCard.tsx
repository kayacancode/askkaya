'use client';

import Link from 'next/link';
import { Escalation } from '@/lib/types';
import { EscalationStatusBadge } from './StatusBadge';

interface EscalationCardProps {
  escalation: Escalation;
}

function formatDate(date: Date | { toDate: () => Date } | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : date.toDate();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EscalationCard({ escalation }: EscalationCardProps) {
  const formattedDate = formatDate(escalation.created_at);

  return (
    <Link
      href={`/escalations/${escalation.id}`}
      className="block hover:bg-gray-50 transition-colors"
    >
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-indigo-600">
              {escalation.client_name}
            </p>
            <p className="mt-1 text-sm text-gray-900 truncate">
              {escalation.query}
            </p>
            <p className="mt-1 text-xs text-gray-500">{formattedDate}</p>
          </div>
          <div className="ml-4 flex-shrink-0">
            <EscalationStatusBadge status={escalation.status} />
          </div>
        </div>
        {escalation.confidence_score !== undefined && (
          <div className="mt-2">
            <span className="text-xs text-gray-500">
              Confidence: {Math.round(escalation.confidence_score * 100)}%
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

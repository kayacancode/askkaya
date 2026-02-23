'use client';

import { Escalation } from '@/lib/types';
import { EscalationCard } from './EscalationCard';

interface EscalationListProps {
  escalations: Escalation[];
}

export function EscalationList({ escalations }: EscalationListProps) {
  if (escalations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No escalations found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {escalations.map((escalation) => (
          <li key={escalation.id}>
            <EscalationCard escalation={escalation} />
          </li>
        ))}
      </ul>
    </div>
  );
}

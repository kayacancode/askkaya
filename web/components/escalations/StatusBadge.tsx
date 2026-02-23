'use client';

interface EscalationStatusBadgeProps {
  status: 'pending' | 'answered' | 'closed';
}

export function EscalationStatusBadge({ status }: EscalationStatusBadgeProps) {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800',
    answered: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

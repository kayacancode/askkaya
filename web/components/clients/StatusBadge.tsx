'use client';

interface StatusBadgeProps {
  status: 'active' | 'suspended';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  );
}

'use client';

import { useState } from 'react';

interface ReprocessButtonProps {
  articleId: string;
}

export function ReprocessButton({ articleId }: ReprocessButtonProps) {
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReprocess() {
    setProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/kb/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });

      if (!response.ok) {
        throw new Error('Failed to start re-indexing');
      }

      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={handleReprocess}
        disabled={processing}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {processing ? 'Re-indexing...' : 'Re-index'}
      </button>
      {success && (
        <span className="text-sm text-green-600">Re-indexing started</span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

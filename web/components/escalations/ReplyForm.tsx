'use client';

import { useState } from 'react';

interface ReplyFormProps {
  escalationId: string;
  telegramChatId?: string;
  onSubmit: (answer: string, autoLearn: boolean) => Promise<void>;
}

export function ReplyForm({
  escalationId,
  telegramChatId,
  onSubmit,
}: ReplyFormProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const isDismiss = answer.trim().toUpperCase() === 'DISMISS';

    try {
      if (isDismiss) {
        // Just close the escalation without reply or learning
        await onSubmit('', false);
        setSuccessMessage('Escalation dismissed');
      } else {
        // Normal flow: reply + auto-learn
        await onSubmit(answer, true);

        // Send reply via Telegram if configured
        if (telegramChatId) {
          await fetch('/api/telegram/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: telegramChatId, message: answer }),
          });
        }

        // Auto-learn to KB
        await fetch('/api/kb/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escalationId }),
        });

        setSuccessMessage('Reply sent and added to KB');
      }

      setSuccess(true);
      setAnswer('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-700">{successMessage}</p>
        </div>
      )}

      <div>
        <label
          htmlFor="answer"
          className="block text-sm font-medium text-gray-700"
        >
          Answer
        </label>
        <textarea
          id="answer"
          aria-label="answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="Type your answer (or DISMISS to close without saving)..."
        />
      </div>

      <p className="text-xs text-gray-500">
        Replies are automatically saved to the KB. Type DISMISS to close without saving.
      </p>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !answer.trim()}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Processing...' : answer.trim().toUpperCase() === 'DISMISS' ? 'Dismiss' : 'Reply & Learn'}
        </button>
      </div>
    </form>
  );
}

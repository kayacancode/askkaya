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
  const [autoLearn, setAutoLearn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(answer, autoLearn);

      // If telegram chat, send reply
      if (telegramChatId) {
        await fetch('/api/telegram/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: telegramChatId, message: answer }),
        });
      }

      // If auto-learn, trigger KB learning
      if (autoLearn) {
        await fetch('/api/kb/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escalationId }),
        });
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
          <p className="text-sm text-green-700">Reply sent successfully</p>
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
          placeholder="Type your answer here..."
        />
      </div>

      <div className="flex items-center">
        <input
          id="auto-learn"
          type="checkbox"
          checked={autoLearn}
          onChange={(e) => setAutoLearn(e.target.checked)}
          aria-label="Add to KB"
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="auto-learn" className="ml-2 block text-sm text-gray-700">
          Add to KB (auto-learn from this Q&A)
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !answer.trim()}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Sending...' : 'Submit Reply'}
        </button>
      </div>
    </form>
  );
}

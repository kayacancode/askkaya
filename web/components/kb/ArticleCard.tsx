'use client';

import Link from 'next/link';
import { KnowledgeArticle } from '@/lib/types';

interface ArticleCardProps {
  article: KnowledgeArticle;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const sourceStyles: Record<string, string> = {
    manual: 'bg-blue-100 text-blue-800',
    url: 'bg-purple-100 text-purple-800',
    pdf: 'bg-orange-100 text-orange-800',
    github: 'bg-gray-100 text-gray-800',
    'auto-learn': 'bg-green-100 text-green-800',
  };

  const sourceStyle = sourceStyles[article.source] || 'bg-gray-100 text-gray-800';

  return (
    <Link
      href={`/kb/${article.id}`}
      className="block hover:bg-gray-50 transition-colors"
    >
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium text-indigo-600 truncate">
              {article.title}
            </p>
            {article.summary && (
              <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                {article.summary}
              </p>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sourceStyle}`}
          >
            {article.source}
          </span>
          {article.is_global && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
              Global
            </span>
          )}
          {article.tags?.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

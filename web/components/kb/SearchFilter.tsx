'use client';

interface SearchFilterProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filter: string;
  onFilterChange: (filter: string) => void;
  clientOptions?: { id: string; name: string }[];
}

export function SearchFilter({
  searchTerm,
  onSearchChange,
  filter,
  onFilterChange,
  clientOptions = [],
}: SearchFilterProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
      <div>
        <label htmlFor="search" className="sr-only">
          Search articles
        </label>
        <input
          type="text"
          id="search"
          placeholder="Search articles..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="filter" className="sr-only">
          Filter
        </label>
        <select
          id="filter"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="Filter"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          <option value="all">All Articles</option>
          <option value="global">Global Only</option>
          {clientOptions.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

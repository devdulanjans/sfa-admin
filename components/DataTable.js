import { useState } from 'react';
import clsx from 'clsx';

export default function DataTable({
  columns,
  data = [],
  loading = false,
  totalPages = 1,
  currentPage = 0,
  onPageChange,
  onSearch,
  actions,
  emptyMessage = 'No records found',
  selectable = false,
  selectedIds,
  onSelectionChange,
}) {
  const [searchValue, setSearchValue] = useState('');

  function handleSearch(e) {
    e.preventDefault();
    onSearch?.(searchValue);
  }

  const allOnPageSelected = selectable && data.length > 0 && data.every(row => selectedIds?.has(row.id));

  function toggleRow(id) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange?.(next);
  }

  function toggleAllOnPage() {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      data.forEach(row => next.delete(row.id));
    } else {
      data.forEach(row => next.add(row.id));
    }
    onSelectionChange?.(next);
  }

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      {(onSearch || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
          {onSearch && (
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search..."
                className="input w-64"
              />
              <button type="submit" className="btn-secondary">Search</button>
              {searchValue && (
                <button type="button" className="btn-secondary"
                  onClick={() => { setSearchValue(''); onSearch?.(''); }}>
                  Clear
                </button>
              )}
            </form>
          )}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap"
                  style={col.width ? { width: col.width } : {}}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {selectable && <td className="px-4 py-3" />}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-gray-50 transition-colors">
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(row.id) ?? false}
                        onChange={() => toggleRow(row.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Page {currentPage + 1} of {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage === 0}
              className="btn-secondary px-3 py-1 text-xs disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              className="btn-secondary px-3 py-1 text-xs disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

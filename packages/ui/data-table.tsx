import * as React from "react"

// Moon Design System — DataTable
// Generic sortable table with optional search + pagination

export type Column<T> = {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  width?: string
  align?: "left" | "right" | "center"
  sortable?: boolean
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[var(--line,rgba(12,16,24,0.08))]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-3.5 rounded-md bg-[var(--line-strong,rgba(12,16,24,0.16))] animate-pulse"
            style={{ width: i === 0 ? "60%" : i === cols - 1 ? "40%" : "80%" }}
          />
        </td>
      ))}
    </tr>
  )
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  loading = false,
  empty = "데이터가 없습니다",
  onRowClick,
  keyField = "id",
  skeletonRows = 5,
  searchable = false,
  searchPlaceholder = "검색...",
  pageSize,
}: {
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  empty?: string
  onRowClick?: (row: T) => void
  keyField?: keyof T
  skeletonRows?: number
  searchable?: boolean
  searchPlaceholder?: string
  pageSize?: number
}) {
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(1)

  React.useEffect(() => { setPage(1) }, [query])

  const alignClass = (align?: "left" | "right" | "center") =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"

  const filtered = React.useMemo(() => {
    if (!searchable || !query.trim()) return rows
    const q = query.trim().toLowerCase()
    return rows.filter((row) =>
      Object.values(row).some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q)
      )
    )
  }, [rows, query, searchable])

  const totalPages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1
  const safePageSize = pageSize ?? filtered.length
  const start = (page - 1) * safePageSize
  const paged = pageSize ? filtered.slice(start, start + safePageSize) : filtered

  return (
    <div className="w-full">
      {/* Search bar */}
      {searchable && (
        <div className="px-4 py-3 border-b border-[var(--line,rgba(12,16,24,0.08))]">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted,#4a5568)]"
              width="13" height="13" viewBox="0 0 13 13" fill="none"
              aria-hidden="true"
            >
              <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-3 py-2 text-sm bg-[var(--surface-strong,#f4f5f8)] border border-[var(--line,rgba(12,16,24,0.08))] rounded-xl text-[var(--text,#0c1018)] placeholder:text-[var(--muted,#4a5568)] focus:outline-none focus:ring-2 focus:ring-[var(--accent,#5274a8)]/20 focus:border-[var(--accent,#5274a8)] transition-all duration-150"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted,#4a5568)] hover:text-[var(--text,#0c1018)] transition-colors"
                aria-label="검색어 지우기"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--line-strong,rgba(12,16,24,0.16))]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "px-4 py-3 text-[10px] font-semibold text-[var(--muted,#4a5568)] uppercase tracking-[0.1em] whitespace-nowrap",
                    alignClass(col.align),
                    col.width,
                  ].filter(Boolean).join(" ")}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length} />
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-16 text-center text-sm text-[var(--muted,#4a5568)]"
                >
                  {query ? `"${query}" 검색 결과 없음` : empty}
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={String(row[keyField as string] ?? i)}
                  onClick={() => onRowClick?.(row)}
                  className={[
                    "border-b border-[var(--line,rgba(12,16,24,0.08))] transition-colors duration-100",
                    onRowClick ? "cursor-pointer hover:bg-[var(--surface,rgba(12,16,24,0.03))]" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={["px-4 py-3.5 text-[var(--text,#0c1018)]", alignClass(col.align)].join(" ")}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageSize && !loading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--line,rgba(12,16,24,0.08))]">
          <span className="text-xs text-[var(--muted,#4a5568)] tabular-nums">
            {start + 1}–{Math.min(start + safePageSize, filtered.length)} / {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-7 h-7 flex items-center justify-center rounded-xl text-[var(--muted,#4a5568)] hover:bg-[var(--surface-strong,#f4f5f8)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="이전"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-xs text-[var(--text,#0c1018)] font-medium tabular-nums px-1">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded-xl text-[var(--muted,#4a5568)] hover:bg-[var(--surface-strong,#f4f5f8)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="다음"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 11l4-4-4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import * as React from "react"

// Moon Design System — DataTable
// Generic sortable table: define columns, pass rows, done.

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
    <tr className="border-b border-[rgba(0,0,0,0.05)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-3.5 rounded-md bg-gradient-to-r from-[#F0F0F2] via-[#E8E8EA] to-[#F0F0F2] bg-[length:200%_100%] animate-pulse"
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
}: {
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  empty?: string
  onRowClick?: (row: T) => void
  keyField?: keyof T
  skeletonRows?: number
}) {
  const alignClass = (align?: "left" | "right" | "center") =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[rgba(0,0,0,0.08)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  "px-4 py-3 text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.1em] whitespace-nowrap",
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
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-16 text-center text-sm text-[#C4C9CF]"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={String(row[keyField as string] ?? i)}
                onClick={() => onRowClick?.(row)}
                className={[
                  "border-b border-[rgba(0,0,0,0.05)] transition-colors duration-100",
                  onRowClick ? "cursor-pointer hover:bg-[#F8F8F9]" : "",
                ].filter(Boolean).join(" ")}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={["px-4 py-3.5 text-[#0F0F0F]", alignClass(col.align)].join(" ")}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

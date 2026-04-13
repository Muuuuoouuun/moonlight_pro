"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { DataTable, type Column } from "@com-moon/ui"
import { StatusBadge } from "@com-moon/ui"

// ─── Types ────────────────────────────────────────────────────────────────────
type ContentStatus = "draft" | "published" | "archived"
type ContentItem = {
  id: string
  title: string
  subtitle: string
  status: ContentStatus
  template_id: string
  created_at: string
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────
const FILTERS: { key: ContentStatus | "all"; label: string }[] = [
  { key: "all",       label: "전체" },
  { key: "draft",     label: "초안" },
  { key: "published", label: "발행됨" },
  { key: "archived",  label: "보관됨" },
]

function FilterBar({
  active,
  onChange,
  counts,
}: {
  active: ContentStatus | "all"
  onChange: (f: ContentStatus | "all") => void
  counts: Record<string, number>
}) {
  return (
    <div className="flex items-center gap-1">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-100",
            active === f.key
              ? "bg-[#0F0F0F] text-white font-medium shadow-sm"
              : "text-[#6B7280] hover:bg-[#F0F0F2] hover:text-[#0F0F0F]",
          ].join(" ")}
        >
          {f.label}
          <span
            className={[
              "text-[10px] tabular-nums",
              active === f.key ? "text-white/70" : "text-[#9BA8B5]",
            ].join(" ")}
          >
            {counts[f.key] ?? 0}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Columns ──────────────────────────────────────────────────────────────────
function buildColumns(onPublish: (id: string) => void): Column<ContentItem>[] {
  return [
    {
      key: "title",
      label: "제목",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-[#0F0F0F] truncate max-w-[240px]">{row.title}</p>
          {row.subtitle && (
            <p className="text-xs text-[#9BA8B5] truncate max-w-[240px] mt-0.5">{row.subtitle}</p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "상태",
      width: "w-24",
      render: (row) => <StatusBadge status={row.status} dot />,
    },
    {
      key: "template_id",
      label: "템플릿",
      width: "w-20",
      render: (row) => (
        <span className="text-xs text-[#9BA8B5] font-mono">{row.template_id || "v3"}</span>
      ),
    },
    {
      key: "created_at",
      label: "생성일",
      width: "w-28",
      align: "right",
      render: (row) => (
        <span className="text-xs text-[#9BA8B5] tabular-nums">
          {new Date(row.created_at).toLocaleDateString("ko-KR", {
            month: "2-digit",
            day: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      width: "w-20",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/dashboard/content/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="px-2.5 py-1 text-xs text-[#6B7280] hover:text-[#0F0F0F] hover:bg-[#F0F0F2] rounded-lg transition-colors duration-100"
          >
            편집
          </Link>
          {row.status === "draft" && (
            <button
              onClick={(e) => { e.stopPropagation(); onPublish(row.id) }}
              className="px-2.5 py-1 text-xs text-[#16A34A] hover:bg-[#F0FDF4] rounded-lg transition-colors duration-100"
            >
              발행
            </button>
          )}
        </div>
      ),
    },
  ]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useContentItems() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from("content_items")
      .select("id, title, subtitle, status, template_id, created_at")
      .order("created_at", { ascending: false })
    setItems((data as ContentItem[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function publish(id: string) {
    await supabase.from("content_items").update({ status: "published" }).eq("id", id)
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "published" } : item))
    )
  }

  return { items, loading, publish, reload: load }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ContentPage() {
  const { items, loading, publish } = useContentItems()
  const [filter, setFilter] = useState<ContentStatus | "all">("all")

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = f.key === "all"
      ? items.length
      : items.filter((i) => i.status === f.key).length
    return acc
  }, {})

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter)
  const columns = buildColumns(publish)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-10">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight">콘텐츠</h1>
          <p className="text-sm text-[#9BA8B5] mt-0.5">카드뉴스 · 콘텐츠 관리</p>
        </div>
        <Link
          href="/dashboard/content/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1A1A1A] active:scale-[0.97] transition-all duration-100 shadow-sm shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          새 콘텐츠
        </Link>
      </header>

      {/* Filter */}
      <div className="mb-5">
        <FilterBar active={filter} onChange={setFilter} counts={counts} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] overflow-hidden shadow-sm">
        <DataTable<ContentItem>
          columns={columns}
          rows={filtered}
          loading={loading}
          empty="콘텐츠가 없습니다. 새 콘텐츠를 만들어보세요."
          keyField="id"
        />
      </div>
    </div>
  )
}

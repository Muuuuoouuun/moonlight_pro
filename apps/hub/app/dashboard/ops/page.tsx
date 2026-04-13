"use client"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "../../../lib/supabase"
import { DataTable, type Column, StatusBadge, SlidePanel, toast } from "@com-moon/ui"

// ─── Types ────────────────────────────────────────────────────────────────────
type OpsStatus = "active" | "on_hold" | "closed"
type OpsCase = { id: string; title: string; description: string; status: OpsStatus; created_at: string }
type CaseDraft = { title: string; description: string }

const inputCls = "w-full px-3.5 py-2.5 text-sm border border-[rgba(0,0,0,0.09)] rounded-xl bg-[#FAFAFA] text-[#0F0F0F] placeholder:text-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#0F0F0F]/20 focus:border-[#0F0F0F] transition-all duration-150"

// ─── Add Case Form ────────────────────────────────────────────────────────────
function AddCaseForm({ onAdd }: { onAdd: (d: CaseDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<CaseDraft>({ title: "", description: "" })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return
    setSaving(true)
    await onAdd(draft)
    setDraft({ title: "", description: "" })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">
          제목 <span className="text-[#DC2626]">*</span>
        </label>
        <input
          className={inputCls}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="운영 건 이름"
          required
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">설명</label>
        <textarea
          className={inputCls + " min-h-[100px] resize-none"}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="배경, 목표, 담당자 등..."
        />
      </div>
      <button
        type="submit"
        disabled={saving || !draft.title.trim()}
        className="mt-2 w-full py-2.5 text-sm font-semibold text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1A1A1A] active:scale-[0.97] disabled:opacity-40 transition-all duration-100 shadow-sm"
      >
        {saving ? "등록 중..." : "운영 건 등록"}
      </button>
    </form>
  )
}

// ─── Status Toggle ────────────────────────────────────────────────────────────
const STATUS_CYCLE: OpsStatus[] = ["active", "on_hold", "closed"]

function StatusToggle({ id, status, onChange }: { id: string; status: OpsStatus; onChange: (id: string, s: OpsStatus) => void }) {
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length]
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(id, next) }}
      className="group"
    >
      <StatusBadge
        status={status}
        dot
        className="group-hover:opacity-80 transition-opacity duration-100 cursor-pointer"
      />
    </button>
  )
}

// ─── Columns ──────────────────────────────────────────────────────────────────
function buildColumns(onToggle: (id: string, s: OpsStatus) => void): Column<OpsCase>[] {
  return [
    {
      key: "title",
      label: "운영 건",
      render: (row) => (
        <div>
          <p className="font-medium text-[#0F0F0F]">{row.title}</p>
          {row.description && (
            <p className="text-xs text-[#9BA8B5] mt-0.5 truncate max-w-[280px]">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "상태",
      width: "w-24",
      render: (row) => <StatusToggle id={row.id} status={row.status} onChange={onToggle} />,
    },
    {
      key: "created_at",
      label: "등록일",
      width: "w-24",
      align: "right",
      render: (row) => (
        <span className="text-xs text-[#9BA8B5] tabular-nums">
          {new Date(row.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
        </span>
      ),
    },
  ]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useOpsCases() {
  const [cases, setCases] = useState<OpsCase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<OpsStatus | "all">("all")

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("operation_cases")
        .select("id, title, description, status, created_at")
        .order("created_at", { ascending: false })
      setCases((data as OpsCase[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const add = useCallback(async (draft: CaseDraft) => {
    const { data, error } = await supabase
      .from("operation_cases")
      .insert({ ...draft, status: "active", created_at: new Date().toISOString() })
      .select()
      .single()
    if (error) { toast.error("등록 실패"); return }
    if (data) {
      setCases((prev) => [data as OpsCase, ...prev])
      toast.success(`"${draft.title}" 등록됐습니다`)
    }
  }, [])

  const toggleStatus = useCallback(async (id: string, status: OpsStatus) => {
    const { error } = await supabase.from("operation_cases").update({ status }).eq("id", id)
    if (error) { toast.error("상태 변경 실패"); return }
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
  }, [])

  const filtered = filter === "all" ? cases : cases.filter((c) => c.status === filter)
  const activeCnt = cases.filter((c) => c.status === "active").length

  return { cases: filtered, allCases: cases, loading, filter, setFilter, add, toggleStatus, activeCnt }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OpsPage() {
  const { cases, allCases, loading, filter, setFilter, add, toggleStatus, activeCnt } = useOpsCases()
  const [panelOpen, setPanelOpen] = useState(false)
  const columns = buildColumns(toggleStatus)

  const onHoldCnt = allCases.filter((c) => c.status === "on_hold").length
  const closedCnt = allCases.filter((c) => c.status === "closed").length

  const filterBtns: { key: OpsStatus | "all"; label: string }[] = [
    { key: "all",     label: `전체 ${allCases.length}` },
    { key: "active",  label: `활성 ${activeCnt}` },
    { key: "on_hold", label: `보류 ${onHoldCnt}` },
    { key: "closed",  label: `종료 ${closedCnt}` },
  ]

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight">운영</h1>
          <p className="text-sm text-[#9BA8B5] mt-0.5">운영 건 관리 · 상태 트래킹</p>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1A1A1A] active:scale-[0.97] transition-all duration-100 shadow-sm shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          운영 건 등록
        </button>
      </header>

      {/* Filter */}
      <div className="flex items-center gap-1 mb-5">
        {filterBtns.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              "px-3 py-1.5 text-sm rounded-lg transition-all duration-100",
              filter === f.key ? "bg-[#0F0F0F] text-white font-medium shadow-sm" : "text-[#6B7280] hover:bg-[#F0F0F2] hover:text-[#0F0F0F]",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] overflow-hidden shadow-sm">
        <DataTable<OpsCase>
          columns={columns}
          rows={cases}
          loading={loading}
          empty="운영 건이 없습니다. 새 운영 건을 등록해보세요."
          keyField="id"
        />
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="운영 건 등록"
        description="진행할 운영 건의 정보를 입력하세요"
      >
        <AddCaseForm onAdd={async (d) => { await add(d); setPanelOpen(false) }} />
      </SlidePanel>
    </div>
  )
}

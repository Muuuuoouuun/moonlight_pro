"use client"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "../../../../lib/supabase"
import { DataTable, type Column, StatusBadge, SlidePanel, toast } from "@com-moon/ui"

// ─── Types ────────────────────────────────────────────────────────────────────
type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost"
type Lead = { id: string; name: string; email: string; source: string; status: LeadStatus; notes: string; created_at: string }
type LeadDraft = { name: string; email: string; source: string; notes: string }

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new",       label: "신규" },
  { value: "contacted", label: "접촉됨" },
  { value: "qualified", label: "적격" },
  { value: "won",       label: "성사" },
  { value: "lost",      label: "실패" },
]

const inputCls = "w-full px-3.5 py-2.5 text-sm border border-[rgba(0,0,0,0.09)] rounded-xl bg-[#FAFAFA] text-[#0F0F0F] placeholder:text-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#0F0F0F]/20 focus:border-[#0F0F0F] transition-all duration-150"

// ─── Add Lead Form ────────────────────────────────────────────────────────────
function AddLeadForm({ onAdd }: { onAdd: (draft: LeadDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<LeadDraft>({ name: "", email: "", source: "", notes: "" })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    setSaving(true)
    await onAdd(draft)
    setDraft({ name: "", email: "", source: "", notes: "" })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      {[
        { key: "name",   label: "이름",   placeholder: "홍길동",          required: true },
        { key: "email",  label: "이메일", placeholder: "hong@example.com", required: false },
        { key: "source", label: "출처",   placeholder: "인스타그램 · 소개 · 광고", required: false },
      ].map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">
            {f.label}{f.required && <span className="text-[#DC2626] ml-0.5">*</span>}
          </label>
          <input
            className={inputCls}
            value={(draft as Record<string,string>)[f.key]}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            required={f.required}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">메모</label>
        <textarea
          className={inputCls + " min-h-[80px] resize-none"}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="특이사항, 컨텍스트..."
        />
      </div>
      <button
        type="submit"
        disabled={saving || !draft.name.trim()}
        className="mt-2 w-full py-2.5 text-sm font-semibold text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1A1A1A] active:scale-[0.97] disabled:opacity-40 transition-all duration-100 shadow-sm"
      >
        {saving ? "추가 중..." : "리드 추가"}
      </button>
    </form>
  )
}

// ─── Status Select ────────────────────────────────────────────────────────────
function StatusSelect({ id, value, onChange }: { id: string; value: LeadStatus; onChange: (s: LeadStatus) => void }) {
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value as LeadStatus) }}
      className="text-[10px] font-semibold uppercase tracking-wide bg-transparent border-none outline-none cursor-pointer"
    >
      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ─── Columns ──────────────────────────────────────────────────────────────────
function buildColumns(onStatusChange: (id: string, s: LeadStatus) => void): Column<Lead>[] {
  return [
    {
      key: "name",
      label: "이름",
      render: (row) => (
        <div>
          <p className="font-medium text-[#0F0F0F]">{row.name}</p>
          {row.email && <p className="text-xs text-[#9BA8B5] mt-0.5">{row.email}</p>}
        </div>
      ),
    },
    {
      key: "source",
      label: "출처",
      render: (row) => <span className="text-sm text-[#6B7280]">{row.source || "—"}</span>,
    },
    {
      key: "status",
      label: "상태",
      width: "w-28",
      render: (row) => (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F8F8F9] border border-[rgba(0,0,0,0.07)]">
          <StatusSelect id={row.id} value={row.status} onChange={(s) => onStatusChange(row.id, s)} />
        </div>
      ),
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
function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("id, name, email, source, status, notes, created_at")
        .order("created_at", { ascending: false })
      setLeads((data as Lead[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const add = useCallback(async (draft: LeadDraft) => {
    const { data, error } = await supabase
      .from("leads")
      .insert({ ...draft, status: "new", created_at: new Date().toISOString() })
      .select()
      .single()
    if (error) { toast.error("리드 추가 실패"); return }
    if (data) {
      setLeads((prev) => [data as Lead, ...prev])
      toast.success(`${draft.name} 리드 추가됐습니다`)
    }
  }, [])

  const updateStatus = useCallback(async (id: string, status: LeadStatus) => {
    const { error } = await supabase.from("leads").update({ status }).eq("id", id)
    if (error) { toast.error("상태 변경 실패"); return }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
  }, [])

  return { leads, loading, add, updateStatus }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const { leads, loading, add, updateStatus } = useLeads()
  const [panelOpen, setPanelOpen] = useState(false)
  const columns = buildColumns(updateStatus)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight">리드</h1>
          <p className="text-sm text-[#9BA8B5] mt-0.5">
            {loading ? "—" : `${leads.length}명`}
          </p>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1A1A1A] active:scale-[0.97] transition-all duration-100 shadow-sm shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          리드 추가
        </button>
      </header>

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] overflow-hidden shadow-sm">
        <DataTable<Lead>
          columns={columns}
          rows={leads}
          loading={loading}
          empty="리드가 없습니다. 첫 번째 리드를 추가해보세요."
          keyField="id"
        />
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="리드 추가"
        description="새로운 잠재 고객 정보를 입력하세요"
      >
        <AddLeadForm onAdd={async (draft) => { await add(draft); setPanelOpen(false) }} />
      </SlidePanel>
    </div>
  )
}

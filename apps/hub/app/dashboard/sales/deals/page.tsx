"use client"

import { useState } from "react"
import { DataTable, type Column, StatusBadge, SlidePanel, toast } from "@com-moon/ui"

// ─── Types ────────────────────────────────────────────────────────────────────

type DealStage = "prospecting" | "proposal" | "negotiation" | "closed_won" | "closed_lost"

type Deal = {
  id: string
  company: string
  contact: string
  value: number
  stage: DealStage
  note: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<DealStage, { label: string; color: string }> = {
  prospecting:  { label: "발굴", color: "text-[#4B6EF5]" },
  proposal:     { label: "제안", color: "text-[#D97706]" },
  negotiation:  { label: "협상", color: "text-[#9BA8B5]" },
  closed_won:   { label: "성사", color: "text-[#16A34A]" },
  closed_lost:  { label: "실패", color: "text-[#DC2626]" },
}

const STAGE_VARIANT: Record<DealStage, string> = {
  prospecting:  "info",
  proposal:     "warning",
  negotiation:  "silver",
  closed_won:   "success",
  closed_lost:  "danger",
}

const PIPELINE_COLORS = [
  "bg-[#4B6EF5]",
  "bg-[#D97706]",
  "bg-[#9BA8B5]",
  "bg-[#16A34A]",
  "bg-[#DC2626]",
]

const STAGE_ORDER: DealStage[] = ["prospecting", "proposal", "negotiation", "closed_won", "closed_lost"]

const INITIAL_DEALS: Deal[] = [
  { id: "1", company: "루나 스튜디오",    contact: "김민준", value: 3200000, stage: "negotiation",  note: "계약서 검토 중",     created_at: "2026-04-10" },
  { id: "2", company: "블루웨이브 미디어", contact: "이서연", value: 1500000, stage: "proposal",     note: "제안서 발송 완료",   created_at: "2026-04-09" },
  { id: "3", company: "스타트허브",       contact: "박지호", value: 800000,  stage: "prospecting",  note: "첫 미팅 예정",       created_at: "2026-04-08" },
  { id: "4", company: "그린라이트",       contact: "최유나", value: 5500000, stage: "closed_won",   note: "계약 완료",          created_at: "2026-04-07" },
  { id: "5", company: "넥스트플로우",     contact: "정도현", value: 2100000, stage: "closed_lost",  note: "예산 부족으로 취소", created_at: "2026-04-06" },
  { id: "6", company: "퓨처코드",        contact: "한소희", value: 4000000, stage: "proposal",     note: "미팅 후 검토 중",    created_at: "2026-04-05" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(v: number) {
  return `₩${v.toLocaleString("ko-KR")}`
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4 select-none">
      {children}
    </p>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 bg-white rounded-xl border border-[rgba(0,0,0,0.07)] shadow-sm">
      <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.1em]">{label}</p>
      <p className="text-3xl font-bold text-[#0F0F0F] tabular-nums mt-2">{value}</p>
    </div>
  )
}

function PipelineBar({ deals }: { deals: Deal[] }) {
  const total = deals.length
  const counts = STAGE_ORDER.map((stage) => deals.filter((d) => d.stage === stage).length)

  return (
    <div>
      <div className="flex w-full h-2.5 rounded-full overflow-hidden gap-0.5">
        {STAGE_ORDER.map((stage, i) => {
          const pct = total > 0 ? (counts[i] / total) * 100 : 0
          return (
            <div
              key={stage}
              className={`${PIPELINE_COLORS[i]} rounded-full transition-all duration-300`}
              style={{ width: `${pct}%`, minWidth: pct > 0 ? "6px" : "0" }}
            />
          )
        })}
      </div>
      <div className="flex mt-3 gap-0">
        {STAGE_ORDER.map((stage, i) => (
          <div key={stage} className="flex-1 text-center">
            <p className={`text-base font-bold tabular-nums ${PIPELINE_COLORS[i].replace("bg-", "text-").replace("[#4B6EF5]", "[#4B6EF5]")}`}>
              {counts[i]}
            </p>
            <p className="text-[10px] text-[#9BA8B5] mt-0.5">{STAGE_CONFIG[stage].label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const INPUT_CLASS =
  "w-full px-3.5 py-2.5 text-sm border border-[rgba(0,0,0,0.09)] rounded-xl bg-[#FAFAFA] text-[#0F0F0F] placeholder:text-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#0F0F0F]/20 focus:border-[#0F0F0F] transition-all duration-150"

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useDeals() {
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS)
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm] = useState({
    company: "",
    contact: "",
    value: "",
    stage: "prospecting" as DealStage,
    note: "",
  })

  const kpiTotal = deals.length
  const kpiRevenue = deals.filter((d) => d.stage !== "closed_lost").reduce((s, d) => s + d.value, 0)
  const kpiRate =
    kpiTotal > 0 ? Math.round((deals.filter((d) => d.stage === "closed_won").length / kpiTotal) * 100) : 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company.trim()) return
    const next: Deal = {
      id: String(Date.now()),
      company: form.company.trim(),
      contact: form.contact.trim(),
      value: Number(form.value) || 0,
      stage: form.stage,
      note: form.note.trim(),
      created_at: new Date().toISOString().slice(0, 10),
    }
    setDeals((prev) => [next, ...prev])
    toast.success(`${next.company} 딜이 추가됐습니다`)
    setPanelOpen(false)
    setForm({ company: "", contact: "", value: "", stage: "prospecting", note: "" })
  }

  return { deals, panelOpen, setPanelOpen, form, setForm, kpiTotal, kpiRevenue, kpiRate, handleSubmit }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const { deals, panelOpen, setPanelOpen, form, setForm, kpiTotal, kpiRevenue, kpiRate, handleSubmit } = useDeals()

  const columns: Column<Deal>[] = [
    {
      key: "company",
      header: "회사",
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-[#0F0F0F]">{row.company}</p>
          <p className="text-xs text-[#9BA8B5] mt-0.5">{row.contact}</p>
        </div>
      ),
    },
    {
      key: "value",
      header: "예상 금액",
      render: (row) => (
        <p className="text-sm font-medium text-[#0F0F0F] text-right tabular-nums">
          {formatKRW(row.value)}
        </p>
      ),
    },
    {
      key: "stage",
      header: "단계",
      render: (row) => (
        <StatusBadge
          status={row.stage}
          label={STAGE_CONFIG[row.stage].label}
          variant={STAGE_VARIANT[row.stage] as any}
          dot
        />
      ),
    },
    {
      key: "note",
      header: "메모",
      render: (row) => (
        <p className="text-sm text-[#6B7280] truncate max-w-[200px]">{row.note}</p>
      ),
    },
    {
      key: "created_at",
      header: "등록일",
      render: (row) => (
        <p className="text-xs text-[#9BA8B5] text-right">{formatDate(row.created_at)}</p>
      ),
    },
  ]

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F0F0F]">딜</h1>
          <p className="text-sm text-[#9BA8B5] mt-1">파이프라인 · 계약 관리</p>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="px-4 py-2 bg-[#0F0F0F] text-white text-sm font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors duration-150 shadow-sm"
        >
          딜 추가
        </button>
      </div>

      {/* KPI Row */}
      <div className="mb-8">
        <SectionLabel>Overview</SectionLabel>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="총 딜 수" value={String(kpiTotal)} />
          <KpiCard label="예상 매출" value={formatKRW(kpiRevenue)} />
          <KpiCard label="성사율" value={`${kpiRate}%`} />
        </div>
      </div>

      {/* Pipeline Bar */}
      <div className="mb-8 p-5 bg-white rounded-xl border border-[rgba(0,0,0,0.07)] shadow-sm">
        <SectionLabel>Pipeline</SectionLabel>
        <PipelineBar deals={deals} />
      </div>

      {/* Table */}
      <div>
        <SectionLabel>All Deals</SectionLabel>
        <DataTable
          columns={columns}
          rows={deals}
          keyField="id"
          searchable
          searchPlaceholder="회사명 검색..."
          pageSize={5}
        />
      </div>

      {/* Add Deal Panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="딜 추가"
        description="새 딜 정보를 입력하세요"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div>
            <label className="block text-xs font-semibold text-[#9BA8B5] uppercase tracking-[0.08em] mb-1.5">
              회사명 <span className="text-[#DC2626]">*</span>
            </label>
            <input
              required
              type="text"
              placeholder="루나 스튜디오"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA8B5] uppercase tracking-[0.08em] mb-1.5">
              담당자
            </label>
            <input
              type="text"
              placeholder="김민준"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA8B5] uppercase tracking-[0.08em] mb-1.5">
              예상 금액
            </label>
            <input
              type="number"
              placeholder="3000000"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA8B5] uppercase tracking-[0.08em] mb-1.5">
              단계
            </label>
            <select
              value={form.stage}
              onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as DealStage }))}
              className={INPUT_CLASS}
            >
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA8B5] uppercase tracking-[0.08em] mb-1.5">
              메모
            </label>
            <textarea
              rows={3}
              placeholder="계약서 검토 중..."
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className={INPUT_CLASS + " resize-none"}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-[#6B7280] bg-[#F8F8F9] rounded-xl hover:bg-[#F0F0F1] transition-colors duration-150"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1a1a1a] transition-colors duration-150 shadow-sm"
            >
              추가
            </button>
          </div>
        </form>
      </SlidePanel>
    </div>
  )
}

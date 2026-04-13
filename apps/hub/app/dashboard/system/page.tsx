"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { DataTable, type Column } from "@com-moon/ui"
import { StatusBadge } from "@com-moon/ui"

// ─── Types ────────────────────────────────────────────────────────────────────
type ErrorLog = {
  id: string
  context: string
  trace: string
  payload: Record<string, unknown>
  timestamp: string
  severity?: "error" | "warn" | "info"
}

type SystemService = {
  label: string
  key: string
  active: boolean
  note?: string
}

// ─── System Services Config ───────────────────────────────────────────────────
const SERVICES: SystemService[] = [
  { label: "Supabase",       key: "supabase",   active: true,  note: "DB · Auth · Storage" },
  { label: "Telegram 웹훅",  key: "telegram",   active: true,  note: "apps/engine" },
  { label: "n8n 자동화",     key: "n8n",        active: false, note: "Phase 3" },
  { label: "콘텐츠 엔진",    key: "content",    active: false, note: "packages/content-manager" },
]

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {active && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-60" />
      )}
      <span className={["relative inline-flex rounded-full h-2 w-2", active ? "bg-[#16A34A]" : "bg-[#D1D5DB]"].join(" ")} />
    </span>
  )
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4 select-none">
      {children}
    </p>
  )
}

// ─── Error Log Columns ────────────────────────────────────────────────────────
const LOG_COLUMNS: Column<ErrorLog>[] = [
  {
    key: "severity",
    label: "수준",
    width: "w-16",
    render: (row) => (
      <StatusBadge
        status={row.severity ?? "error"}
        label={row.severity === "warn" ? "경고" : row.severity === "info" ? "정보" : "오류"}
        variant={row.severity === "warn" ? "warning" : row.severity === "info" ? "info" : "danger"}
      />
    ),
  },
  {
    key: "context",
    label: "컨텍스트",
    render: (row) => (
      <span className="text-sm font-mono text-[#0F0F0F]">{row.context}</span>
    ),
  },
  {
    key: "trace",
    label: "트레이스",
    render: (row) => (
      <span className="text-xs text-[#6B7280] font-mono truncate max-w-[280px] block">
        {row.trace}
      </span>
    ),
  },
  {
    key: "timestamp",
    label: "시각",
    width: "w-32",
    align: "right",
    render: (row) => (
      <span className="text-xs text-[#9BA8B5] tabular-nums">
        {new Date(row.timestamp).toLocaleString("ko-KR", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    ),
  },
]

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("error_logs")
        .select("id, context, trace, payload, timestamp, severity")
        .order("timestamp", { ascending: false })
        .limit(50)
      setLogs((data as ErrorLog[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function clear() {
    await supabase.from("error_logs").update({ archived: true }).eq("archived", false)
    setLogs([])
  }

  return { logs, loading, clear }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SystemPage() {
  const { logs, loading, clear } = useErrorLogs()
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-10">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight">시스템</h1>
        <p className="text-sm text-[#9BA8B5] mt-0.5">헬스 체크 · 에러 로그</p>
      </header>

      {/* Service Health */}
      <section className="mb-10">
        <SectionLabel>서비스 상태</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {SERVICES.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-4 px-4 py-3.5 bg-white rounded-xl border border-[rgba(0,0,0,0.07)] hover:border-[rgba(0,0,0,0.12)] transition-colors duration-150"
            >
              <StatusDot active={s.active} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F0F0F] leading-none">{s.label}</p>
                {s.note && <p className="text-[11px] text-[#C4C9CF] mt-0.5 truncate">{s.note}</p>}
              </div>
              <StatusBadge status={s.active ? "normal" : "idle"} />
            </div>
          ))}
        </div>
      </section>

      {/* Error Logs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>에러 로그</SectionLabel>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-[#9BA8B5] tabular-nums">{logs.length}건</span>
            {confirmClear ? (
              <>
                <button
                  onClick={() => { clear(); setConfirmClear(false) }}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-[#DC2626] rounded-lg hover:bg-[#B91C1C] transition-colors duration-100"
                >
                  확인
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-1 text-xs text-[#6B7280] hover:text-[#0F0F0F] transition-colors duration-100"
                >
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="px-2.5 py-1 text-xs text-[#9BA8B5] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-all duration-100"
              >
                로그 지우기
              </button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] overflow-hidden shadow-sm">
          <DataTable<ErrorLog>
            columns={LOG_COLUMNS}
            rows={logs}
            loading={loading}
            empty="에러 로그가 없습니다"
            keyField="id"
          />
        </div>
      </section>
    </div>
  )
}

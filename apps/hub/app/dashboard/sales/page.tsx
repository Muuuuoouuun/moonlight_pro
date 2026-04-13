"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { StatusBadge } from "@com-moon/ui"

// ─── Types ────────────────────────────────────────────────────────────────────
type PipelineStage = { key: string; label: string; count: number }
type LeadRow = { id: string; name: string; status: string; created_at: string }

const STAGES: Omit<PipelineStage, "count">[] = [
  { key: "new",       label: "신규" },
  { key: "contacted", label: "접촉됨" },
  { key: "qualified", label: "적격" },
  { key: "won",       label: "성사" },
  { key: "lost",      label: "실패" },
]

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({ w }: { w?: string }) {
  return <div className={["h-3.5 rounded bg-[#F0F0F2] animate-pulse", w ?? "w-12"].join(" ")} />
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SL({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4 select-none">{children}</p>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useSalesPipeline() {
  const [stages, setStages] = useState<PipelineStage[]>(STAGES.map((s) => ({ ...s, count: 0 })))
  const [recentLeads, setRecentLeads] = useState<LeadRow[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ count: total }, { data: leads }] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("id, name, status, created_at").order("created_at", { ascending: false }).limit(5),
      ])

      setTotalLeads(total ?? 0)
      setRecentLeads((leads as LeadRow[]) ?? [])

      // count per stage
      const stageCounts = await Promise.all(
        STAGES.map((s) =>
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", s.key)
        )
      )
      setStages(STAGES.map((s, i) => ({ ...s, count: stageCounts[i].count ?? 0 })))
      setLoading(false)
    }
    load()
  }, [])

  return { stages, recentLeads, totalLeads, loading }
}

// ─── Pipeline Bar ─────────────────────────────────────────────────────────────
function PipelineBar({ stages, loading }: { stages: PipelineStage[]; loading: boolean }) {
  const total = stages.reduce((s, st) => s + st.count, 0) || 1
  const colors = ["bg-[#0F0F0F]", "bg-[#4B5563]", "bg-[#9BA8B5]", "bg-[#16A34A]", "bg-[#DC2626]"]

  return (
    <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm overflow-hidden">
      {/* Bar */}
      <div className="flex h-2">
        {stages.map((s, i) => (
          <div
            key={s.key}
            className={["transition-all duration-500", colors[i]].join(" ")}
            style={{ width: `${(s.count / total) * 100}%` }}
          />
        ))}
      </div>
      {/* Stage cols */}
      <div className="grid grid-cols-5 divide-x divide-[rgba(0,0,0,0.06)]">
        {stages.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center gap-1 py-4 px-2">
            {loading ? <Sk w="w-6" /> : (
              <p className="text-xl font-bold text-[#0F0F0F] tabular-nums leading-none">{s.count}</p>
            )}
            <span className={["text-[10px] font-medium", colors[i].replace("bg-", "text-").replace("[#0F0F0F]", "[#0F0F0F]")].join(" ")}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const { stages, recentLeads, totalLeads, loading } = useSalesPipeline()

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 md:px-10 md:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight">세일즈</h1>
          <p className="text-sm text-[#9BA8B5] mt-0.5">파이프라인 · 리드 관리</p>
        </div>
        <Link
          href="/dashboard/sales/leads"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1A1A1A] active:scale-[0.97] transition-all duration-100 shadow-sm shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          리드 추가
        </Link>
      </header>

      {/* KPI Row */}
      <section className="mb-8">
        <SL>요약</SL>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "총 리드", value: totalLeads },
            { label: "진행 중", value: stages.filter(s => ["new","contacted","qualified"].includes(s.key)).reduce((a,s)=>a+s.count,0) },
            { label: "성사", value: stages.find(s=>s.key==="won")?.count ?? 0 },
          ].map((k) => (
            <div key={k.label} className="p-5 bg-white rounded-xl border border-[rgba(0,0,0,0.07)] shadow-sm">
              <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.1em]">{k.label}</p>
              <div className="mt-2">
                {loading ? <Sk w="w-10" /> : <p className="text-3xl font-bold text-[#0F0F0F] tabular-nums">{k.value}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section className="mb-8">
        <SL>파이프라인</SL>
        <PipelineBar stages={stages} loading={loading} />
      </section>

      {/* Recent Leads */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SL>최근 리드</SL>
          <Link href="/dashboard/sales/leads" className="text-xs text-[#9BA8B5] hover:text-[#0F0F0F] transition-colors duration-100 mb-4">
            전체 보기 →
          </Link>
        </div>
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm overflow-hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(0,0,0,0.05)]">
                <Sk w="w-28" />
                <Sk w="w-14" />
              </div>
            ))
          ) : recentLeads.length === 0 ? (
            <p className="px-5 py-10 text-sm text-center text-[#C4C9CF]">리드가 없습니다</p>
          ) : (
            recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(0,0,0,0.05)] last:border-0 hover:bg-[#F8F8F9] transition-colors duration-100">
                <span className="text-sm font-medium text-[#0F0F0F]">{lead.name}</span>
                <StatusBadge status={lead.status} dot />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

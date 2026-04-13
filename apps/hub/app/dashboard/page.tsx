"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────
type TrendDir = "up" | "down" | "neutral"
type Stats = {
  ops: number; leads: number; content: number
  trends: { ops: TrendDir; leads: TrendDir; content: TrendDir }
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function IcOps() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M9 5.5v7M5.5 9h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
}
function IcLeads() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2.5 16.5c0-3.866 2.91-6 6.5-6s6.5 2.134 6.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
}
function IcContent() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6 8h6M6 11h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
}
function IcArrow() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={["rounded-lg bg-[#F0F0F2] animate-pulse", className].filter(Boolean).join(" ")} />
}

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {active && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-60" />}
      <span className={["relative inline-flex rounded-full h-2 w-2", active ? "bg-[#16A34A]" : "bg-[#D1D5DB]"].join(" ")} />
    </span>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sublabel, loading, icon, trend = "neutral", href }: {
  label: string; value: string; sublabel: string; loading: boolean
  icon: React.ReactNode; trend?: TrendDir; href?: string
}) {
  const tc = {
    up:      { text: "text-[#16A34A]", bg: "bg-[#F0FDF4]", sym: "↑" },
    down:    { text: "text-[#DC2626]", bg: "bg-[#FEF2F2]", sym: "↓" },
    neutral: { text: "text-[#9BA8B5]", bg: "bg-[#F8F8F9]", sym: "–" },
  }[trend]

  const inner = (
    <div className="group relative p-6 bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm hover:shadow-md hover:-translate-y-[2px] transition-all duration-200 cursor-default h-full">
      <div className="absolute top-5 right-5 text-[#D1D5DB] group-hover:text-[#9BA8B5] transition-colors duration-200">{icon}</div>
      <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.1em]">{label}</p>
      <div className="mt-3 mb-3 h-12 flex items-center">
        {loading ? <Skeleton className="h-9 w-16" /> : (
          <p className="text-4xl font-bold text-[#0F0F0F] tabular-nums leading-none">{value}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={["inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md", tc.text, tc.bg].join(" ")}>{tc.sym}</span>
        <span className="text-xs text-[#9BA8B5]">{sublabel}</span>
        {href && <span className="ml-auto text-[#C4C9CF] group-hover:text-[#9BA8B5] transition-colors duration-150"><IcArrow /></span>}
      </div>
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

// ─── Quick Action ─────────────────────────────────────────────────────────────
function QuickAction({ label, href }: { label: string; href?: string }) {
  const cls = "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#0F0F0F] bg-white border border-[rgba(0,0,0,0.09)] rounded-xl hover:bg-[#F8F8F9] hover:border-[rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-100 shadow-sm select-none"
  return href ? <Link href={href} className={cls}>{label}</Link> : <button className={cls}>{label}</button>
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SL({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4 select-none">{children}</p>
}

// ─── Data Hook (with real trends) ─────────────────────────────────────────────
function useDashboard() {
  const [stats, setStats] = useState<Stats>({
    ops: 0, leads: 0, content: 0,
    trends: { ops: "neutral", leads: "neutral", content: "neutral" },
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const now = new Date()
      const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const weekStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
      const twoWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14).toISOString()

      const [
        { count: ops },
        { count: leads },
        { count: content },
        // trend: leads today vs yesterday
        { count: leadsToday },
        { count: leadsYest },
        // trend: content this week vs last week
        { count: contentThisWeek },
        { count: contentLastWeek },
      ] = await Promise.all([
        supabase.from("operation_cases").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("content_items").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
        supabase.from("leads").select("*", { count: "exact", head: true }).lt("created_at", todayStart),
        supabase.from("content_items").select("*", { count: "exact", head: true }).gte("created_at", weekStart),
        supabase.from("content_items").select("*", { count: "exact", head: true }).gte("created_at", twoWeekStart).lt("created_at", weekStart),
      ])

      const trend = (a: number | null, b: number | null): TrendDir => {
        const av = a ?? 0; const bv = b ?? 0
        return av > bv ? "up" : av < bv ? "down" : "neutral"
      }

      setStats({
        ops: ops ?? 0,
        leads: leads ?? 0,
        content: content ?? 0,
        trends: {
          ops: "neutral",
          leads: trend(leadsToday, leadsYest),
          content: trend(contentThisWeek, contentLastWeek),
        },
      })
      setLoading(false)
    }
    load()
  }, [])

  return { stats, loading }
}

function useGreeting() {
  const [g, setG] = useState({ greeting: "", date: "" })
  useEffect(() => {
    const h = new Date().getHours()
    setG({
      greeting: h < 12 ? "좋은 아침이에요" : h < 18 ? "좋은 오후에요" : "좋은 저녁이에요",
      date: new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" }),
    })
  }, [])
  return g
}

// ─── System Row ───────────────────────────────────────────────────────────────
function SystemRow({ label, active, note }: { label: string; active: boolean; note?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-[rgba(0,0,0,0.07)] hover:border-[rgba(0,0,0,0.12)] transition-colors duration-150">
      <StatusDot active={active} />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[#0F0F0F]">{label}</span>
        {note && <span className="text-[11px] text-[#C4C9CF] ml-2">{note}</span>}
      </div>
      <span className={["text-[11px] font-medium", active ? "text-[#16A34A]" : "text-[#C4C9CF]"].join(" ")}>
        {active ? "정상" : "준비중"}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { stats, loading } = useDashboard()
  const { greeting, date } = useGreeting()

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 md:px-10 md:py-12">
      {/* Header */}
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#9BA8B5] mb-1.5 tabular-nums">{date}</p>
          <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight">
            {greeting || <span className="invisible">로딩</span>}
          </h1>
        </div>
        <div className="shrink-0 flex items-center gap-2 mt-1">
          <StatusDot active />
          <span className="text-xs text-[#9BA8B5]">시스템 정상</span>
        </div>
      </header>

      {/* KPIs */}
      <section className="mb-10">
        <SL>현황</SL>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="운영 건" value={stats.ops.toString()} sublabel="전체" loading={loading} icon={<IcOps />} trend={stats.trends.ops} />
          <KpiCard label="신규 리드" value={stats.leads.toString()} sublabel={loading ? "—" : stats.trends.leads === "up" ? "어제보다 증가" : stats.trends.leads === "down" ? "어제보다 감소" : "어제와 동일"} loading={loading} icon={<IcLeads />} trend={stats.trends.leads} />
          <KpiCard label="카드뉴스" value={stats.content.toString()} sublabel={loading ? "—" : stats.trends.content === "up" ? "지난주보다 증가" : stats.trends.content === "down" ? "지난주보다 감소" : "지난주와 동일"} loading={loading} icon={<IcContent />} trend={stats.trends.content} href="/dashboard/content" />
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <SL>빠른 액션</SL>
        <div className="flex flex-wrap gap-2">
          <QuickAction label="카드뉴스 만들기" href="/dashboard/content/new" />
          <QuickAction label="리드 추가" href="/dashboard/sales/leads" />
          <QuickAction label="운영 건 등록" href="/dashboard/ops" />
        </div>
      </section>

      {/* System */}
      <section>
        <SL>시스템</SL>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <SystemRow label="Supabase" active note="DB · Auth" />
          <SystemRow label="Telegram 웹훅" active note="apps/engine" />
          <SystemRow label="n8n 자동화" active={false} note="Phase 3" />
          <SystemRow label="콘텐츠 엔진" active={false} note="Phase 2" />
        </div>
      </section>
    </div>
  )
}

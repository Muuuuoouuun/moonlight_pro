"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────
type DashboardStats = { ops: number; leads: number; content: number }
type TrendDir = "up" | "down" | "neutral"

// ─── Inline Icons ─────────────────────────────────────────────────────────────
function IcOps() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 5.5v7M5.5 9h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IcLeads() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 16.5c0-3.866 2.91-6 6.5-6s6.5 2.134 6.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IcContent() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 8h6M6 11h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IcArrowRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={["rounded-lg bg-gradient-to-r from-[#F0F0F2] via-[#E8E8EA] to-[#F0F0F2] bg-[length:200%_100%] animate-shimmer", className]
        .filter(Boolean)
        .join(" ")}
    />
  )
}

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {active && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-60" />
      )}
      <span
        className={["relative inline-flex rounded-full h-2 w-2", active ? "bg-[#16A34A]" : "bg-[#C4C9CF]"].join(" ")}
      />
    </span>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sublabel,
  loading,
  icon,
  trend = "neutral",
  href,
}: {
  label: string
  value: string
  sublabel: string
  loading: boolean
  icon: React.ReactNode
  trend?: TrendDir
  href?: string
}) {
  const trendConfig = {
    up: { dot: "bg-[#16A34A]", text: "text-[#16A34A]", bg: "bg-[#F0FDF4]", symbol: "↑" },
    down: { dot: "bg-[#DC2626]", text: "text-[#DC2626]", bg: "bg-[#FEF2F2]", symbol: "↓" },
    neutral: { dot: "bg-[#9BA8B5]", text: "text-[#9BA8B5]", bg: "bg-[#F8F8F9]", symbol: "–" },
  }
  const tc = trendConfig[trend]

  const inner = (
    <div className="group relative p-6 bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm hover:shadow-md hover:-translate-y-[2px] transition-all duration-200 cursor-default h-full">
      {/* Icon */}
      <div className="absolute top-5 right-5 text-[#D1D5DB] group-hover:text-[#9BA8B5] transition-colors duration-200">
        {icon}
      </div>

      {/* Label */}
      <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.1em]">{label}</p>

      {/* Value */}
      <div className="mt-3 mb-3 h-12 flex items-center">
        {loading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <p className="text-4xl font-bold text-[#0F0F0F] tabular-nums leading-none">{value}</p>
        )}
      </div>

      {/* Sublabel + Trend */}
      <div className="flex items-center gap-2">
        <span className={["inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md", tc.text, tc.bg].join(" ")}>
          {tc.symbol}
        </span>
        <span className="text-xs text-[#9BA8B5]">{sublabel}</span>
        {href && (
          <span className="ml-auto text-[#C4C9CF] group-hover:text-[#9BA8B5] transition-colors duration-150">
            <IcArrowRight />
          </span>
        )}
      </div>
    </div>
  )

  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  )
}

// ─── Quick Action ─────────────────────────────────────────────────────────────
function QuickAction({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const cls =
    "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#0F0F0F] bg-white border border-[rgba(0,0,0,0.09)] rounded-xl hover:bg-[#F8F8F9] hover:border-[rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-100 shadow-sm select-none"
  if (href) return <Link href={href} className={cls}>{label}</Link>
  return <button onClick={onClick} className={cls}>{label}</button>
}

// ─── Data Hook ────────────────────────────────────────────────────────────────
function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({ ops: 0, leads: 0, content: 0 })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    async function load() {
      const [{ count: ops }, { count: leads }, { count: content }] = await Promise.all([
        supabase.from("operation_cases").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("content_items").select("*", { count: "exact", head: true }),
      ])
      setStats({ ops: ops ?? 0, leads: leads ?? 0, content: content ?? 0 })
      setLoading(false)
    }
    load()
  }, [])
  return { stats, loading }
}

function useGreeting() {
  const [text, setText] = useState<{ greeting: string; date: string }>({ greeting: "", date: "" })
  useEffect(() => {
    const h = new Date().getHours()
    const greeting = h < 12 ? "좋은 아침이에요" : h < 18 ? "좋은 오후에요" : "좋은 저녁이에요"
    const date = new Date().toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long",
    })
    setText({ greeting, date })
  }, [])
  return text
}

// ─── System Status Row ────────────────────────────────────────────────────────
function SystemRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-[rgba(0,0,0,0.07)] hover:border-[rgba(0,0,0,0.12)] transition-colors duration-150">
      <span className="text-sm text-[#4B5563]">{label}</span>
      <div className="flex items-center gap-2">
        <StatusDot active={active} />
        <span className="text-[11px] text-[#9BA8B5] font-medium">
          {active ? "정상" : "준비중"}
        </span>
      </div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4 select-none">
      {children}
    </p>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { stats, loading } = useDashboardStats()
  const { greeting, date } = useGreeting()

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 md:px-10 md:py-12">
      {/* Header */}
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#9BA8B5] mb-1.5 tabular-nums">{date}</p>
          <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight leading-snug">
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
        <SectionLabel>현황</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="운영 건"
            value={stats.ops.toString()}
            sublabel="진행중"
            loading={loading}
            icon={<IcOps />}
            trend="neutral"
          />
          <KpiCard
            label="신규 리드"
            value={stats.leads.toString()}
            sublabel="오늘 기준"
            loading={loading}
            icon={<IcLeads />}
            trend="up"
          />
          <KpiCard
            label="카드뉴스"
            value={stats.content.toString()}
            sublabel="이번주 발행"
            loading={loading}
            icon={<IcContent />}
            trend="neutral"
            href="/dashboard/card-news"
          />
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <SectionLabel>빠른 액션</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <QuickAction label="카드뉴스 만들기" href="/dashboard/card-news" />
          <QuickAction label="리드 추가" />
          <QuickAction label="운영 건 등록" />
        </div>
      </section>

      {/* System */}
      <section>
        <SectionLabel>시스템</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <SystemRow label="Supabase 연결" active />
          <SystemRow label="n8n 자동화" active={false} />
          <SystemRow label="Telegram 웹훅" active />
          <SystemRow label="콘텐츠 엔진" active={false} />
        </div>
      </section>
    </div>
  )
}

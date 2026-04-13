"use client"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

// ─── Types ────────────────────────────────────────────────────────────────────
type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
  mobileHidden?: boolean
  dividerBefore?: boolean
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function IcGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
    </svg>
  )
}
function IcContent() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="1.5" width="12" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5.5h6M5 8h6M5 10.5h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IcSales() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 12L5.5 8l3 2.5L13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 4H13v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IcOps() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IcAutomation() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9 1.5L4 8.5h4L7 14.5l5-7H8L9 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IcSystem() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 13h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 10V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
function IcSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M11.7 3.4l-.9.9M3.4 11.7l-.9.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}
function IcBell() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5a5 5 0 0 1 5 5v3l1.5 2.5H1.5L3 9.5v-3A5 5 0 0 1 8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Nav Config ───────────────────────────────────────────────────────────────
const NAV: NavItem[] = [
  { href: "/dashboard",            label: "대시보드", icon: <IcGrid /> },
  { href: "/dashboard/content",    label: "콘텐츠",  icon: <IcContent /> },
  { href: "/dashboard/sales",      label: "세일즈",  icon: <IcSales />,      dividerBefore: true },
  { href: "/dashboard/ops",        label: "운영",    icon: <IcOps /> },
  { href: "/dashboard/automation", label: "자동화",  icon: <IcAutomation />, dividerBefore: true, mobileHidden: true },
  { href: "/dashboard/system",     label: "시스템",  icon: <IcSystem /> },
  { href: "/dashboard/settings",   label: "설정",    icon: <IcSettings />, mobileHidden: true },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href)
}

// ─── Notification types ───────────────────────────────────────────────────────
type NotifItem = { id: string; type: "lead" | "content" | "ops" | "automation"; title: string; desc: string; time: string; read: boolean }

const MOCK_NOTIFS: NotifItem[] = [
  { id:"1", type:"lead",       title:"신규 리드",        desc:"김민준 님이 추가됐습니다",              time:"2분 전",   read:false },
  { id:"2", type:"content",    title:"콘텐츠 발행",      desc:"'4월 트렌드' 카드뉴스가 발행됐습니다",   time:"1시간 전", read:false },
  { id:"3", type:"ops",        title:"운영 건 완료",     desc:"'서버 점검' 건이 closed 됐습니다",      time:"3시간 전", read:true  },
  { id:"4", type:"automation", title:"자동화 실행",      desc:"신규 리드 알림 워크플로가 실행됐습니다", time:"어제",     read:true  },
  { id:"5", type:"lead",       title:"리드 상태 변경",   desc:"이서연 님이 '적격'으로 변경됐습니다",   time:"어제",     read:true  },
]

const NOTIF_ICON_BG: Record<string, string> = {
  lead: "bg-[#F0F4FF]", content: "bg-[#F0FDF4]", ops: "bg-[#FFFBEB]", automation: "bg-[#F8F8F9]"
}
const NOTIF_ICON_TEXT: Record<string, string> = {
  lead: "text-[#4B6EF5]", content: "text-[#16A34A]", ops: "text-[#D97706]", automation: "text-[#9BA8B5]"
}
const NOTIF_EMOJI: Record<string, string> = {
  lead: "👤", content: "📄", ops: "📋", automation: "⚡"
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ onBellClick, unreadCount }: { onBellClick: () => void; unreadCount: number }) {
  const pathname = usePathname()
  return (
    <aside className="hidden md:flex w-[220px] h-screen flex-col bg-white border-r border-[rgba(0,0,0,0.07)] shrink-0 z-20">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-[rgba(0,0,0,0.06)] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#0F0F0F] flex items-center justify-center shrink-0">
          <span className="text-white text-[9px] font-bold tracking-tight select-none">CM</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0F0F0F] leading-none truncate">Com_Moon</p>
          <p className="text-[10px] text-[#9BA8B5] mt-0.5">Hub OS</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => (
          <div key={item.href}>
            {item.dividerBefore && (
              <div className="my-2 mx-3 h-px bg-[rgba(0,0,0,0.06)]" />
            )}
            {item.disabled ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#C4C9CF] cursor-not-allowed select-none">
                <span className="shrink-0">{item.icon}</span>
                <span className="text-sm flex-1 truncate">{item.label}</span>
                <span className="text-[9px] font-semibold text-[#C4C9CF] bg-[#F8F8F9] px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0">
                  Soon
                </span>
              </div>
            ) : (
              <Link
                href={item.href}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-100",
                  isActive(pathname, item.href)
                    ? "bg-[#0F0F0F] text-white shadow-sm"
                    : "text-[#4B5563] hover:bg-[#F8F8F9] hover:text-[#0F0F0F]",
                ].join(" ")}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="text-sm font-medium truncate">{item.label}</span>
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3.5 border-t border-[rgba(0,0,0,0.06)] shrink-0 flex items-center justify-between">
        <p className="text-[10px] text-[#C4C9CF] select-none">v0.1 · Moon OS</p>
        <button
          onClick={onBellClick}
          className="relative w-8 h-8 flex items-center justify-center rounded-xl text-[#9BA8B5] hover:bg-[#F8F8F9] hover:text-[#0F0F0F] transition-all duration-100"
          aria-label="알림"
        >
          <IcBell />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#DC2626] rounded-full" />
          )}
        </button>
      </div>
    </aside>
  )
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
function BottomNav() {
  const pathname = usePathname()
  const mobileItems = NAV.filter((n) => !n.mobileHidden)
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-sm border-t border-[rgba(0,0,0,0.08)] flex z-50 safe-area-pb"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {mobileItems.map((item) => {
        const active = !item.disabled && isActive(pathname, item.href)
        const content = (
          <>
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </>
        )
        if (item.disabled) {
          return (
            <div
              key={item.href}
              className="flex-1 flex flex-col items-center gap-1 pt-3 pb-2 text-[#D1D5DB] cursor-not-allowed select-none"
            >
              {content}
            </div>
          )
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex-1 flex flex-col items-center gap-1 pt-3 pb-2 transition-colors duration-100",
              active ? "text-[#0F0F0F]" : "text-[#9BA8B5] hover:text-[#6B7280]",
            ].join(" ")}
          >
            {content}
          </Link>
        )
      })}
    </nav>
  )
}

// ─── Notification Panel ───────────────────────────────────────────────────────
function NotificationPanel({ open, onClose, notifs, onMarkAllRead }: {
  open: boolean
  onClose: () => void
  notifs: NotifItem[]
  onMarkAllRead: () => void
}) {
  const unread = notifs.filter(n => !n.read).length
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}
      {/* Panel */}
      <div
        className={[
          "fixed top-0 right-0 h-full w-[340px] bg-white z-50 shadow-xl border-l border-[rgba(0,0,0,0.08)]",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.06)] shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[#0F0F0F]">알림</h2>
            {unread > 0 && <p className="text-xs text-[#9BA8B5] mt-0.5">{unread}개 읽지 않음</p>}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-xs text-[#9BA8B5] hover:text-[#0F0F0F] transition-colors px-2 py-1 rounded-lg hover:bg-[#F8F8F9]"
              >
                모두 읽음
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-[#9BA8B5] hover:bg-[#F8F8F9] hover:text-[#0F0F0F] transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifs.length === 0 ? (
            <p className="text-center text-sm text-[#C4C9CF] py-16">알림이 없습니다</p>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                className={[
                  "flex items-start gap-3 px-5 py-4 border-b border-[rgba(0,0,0,0.04)]",
                  !n.read ? "bg-[#FAFAFA]" : "",
                ].join(" ")}
              >
                <div className={["w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm", NOTIF_ICON_BG[n.type]].join(" ")}>
                  {NOTIF_EMOJI[n.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={["text-sm leading-snug", !n.read ? "font-medium text-[#0F0F0F]" : "text-[#4B5563]"].join(" ")}>
                    {n.title}
                  </p>
                  <p className="text-xs text-[#9BA8B5] mt-0.5 leading-snug">{n.desc}</p>
                  <p className="text-[10px] text-[#C4C9CF] mt-1 tabular-nums">{n.time}</p>
                </div>
                {!n.read && (
                  <span className="w-1.5 h-1.5 bg-[#0F0F0F] rounded-full shrink-0 mt-1.5" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState<NotifItem[]>(MOCK_NOTIFS)
  const unreadCount = notifs.filter(n => !n.read).length

  function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  return (
    <div className="flex h-screen bg-[#F8F8F9] overflow-hidden">
      <Sidebar onBellClick={() => setNotifOpen(true)} unreadCount={unreadCount} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0 scroll-smooth">
          {children}
        </main>
      </div>
      <BottomNav />
      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifs={notifs}
        onMarkAllRead={markAllRead}
      />
    </div>
  )
}

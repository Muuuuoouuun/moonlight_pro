"use client"
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

// ─── Nav Config ───────────────────────────────────────────────────────────────
const NAV: NavItem[] = [
  { href: "/dashboard",            label: "대시보드", icon: <IcGrid /> },
  { href: "/dashboard/content",    label: "콘텐츠",  icon: <IcContent /> },
  { href: "/dashboard/sales",      label: "세일즈",  icon: <IcSales />,      disabled: true, dividerBefore: true },
  { href: "/dashboard/ops",        label: "운영",    icon: <IcOps />,        disabled: true },
  { href: "/dashboard/automation", label: "자동화",  icon: <IcAutomation />, disabled: true, dividerBefore: true, mobileHidden: true },
  { href: "/dashboard/system",     label: "시스템",  icon: <IcSystem /> },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href)
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar() {
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
      <div className="px-5 py-3.5 border-t border-[rgba(0,0,0,0.06)] shrink-0">
        <p className="text-[10px] text-[#C4C9CF] select-none">v0.1 · Moon OS</p>
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

// ─── Shell ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#F8F8F9] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0 scroll-smooth">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

const SUB_NAV = [
  { href: "/dashboard/content",     label: "목록" },
  { href: "/dashboard/content/new", label: "새 콘텐츠" },
]

function SubNav() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-1 px-6 py-3 bg-white border-b border-[rgba(0,0,0,0.07)] shrink-0">
      {SUB_NAV.map((item) => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "px-3 py-1.5 text-sm rounded-lg transition-all duration-100",
              active
                ? "bg-[#0F0F0F] text-white font-medium shadow-sm"
                : "text-[#6B7280] hover:bg-[#F8F8F9] hover:text-[#0F0F0F]",
            ].join(" ")}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <SubNav />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

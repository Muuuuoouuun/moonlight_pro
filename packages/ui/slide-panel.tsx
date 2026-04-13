"use client"
import { useEffect, useRef } from "react"

// Moon Design System — SlidePanel
// Desktop: right-side panel (400px). Mobile: bottom sheet.

export interface SlidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  width?: string
}

export function SlidePanel({
  open,
  onClose,
  title,
  description,
  children,
  width = "w-full max-w-[420px]",
}: SlidePanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden="true"
      />

      {/* Panel — slides in from right on md+, up from bottom on mobile */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "fixed z-50 bg-white shadow-lg transition-transform duration-300 ease-in-out",
          // Mobile: full-width bottom sheet
          "bottom-0 inset-x-0 rounded-t-2xl max-h-[90dvh]",
          // Desktop: right panel
          "md:bottom-auto md:top-0 md:right-0 md:h-screen md:rounded-none md:rounded-l-2xl",
          width,
          open
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-y-0 md:translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[rgba(0,0,0,0.07)]">
          <div>
            <h2 className="text-base font-semibold text-[#0F0F0F] tracking-tight">{title}</h2>
            {description && <p className="text-sm text-[#9BA8B5] mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[#9BA8B5] hover:text-[#0F0F0F] hover:bg-[#F8F8F9] transition-colors duration-100"
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90dvh - 80px)" }}>
          {children}
        </div>
      </div>
    </>
  )
}

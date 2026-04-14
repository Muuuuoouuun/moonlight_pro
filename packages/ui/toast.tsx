import * as React from "react"

// Moon Design System — Toast
// Pub/sub singleton. No Provider needed.
// Usage: toast.success("저장됨") / toast.error("오류") / toast.info("알림")
// Render: <Toaster /> anywhere in layout

type ToastVariant = "success" | "error" | "info" | "warning"
type ToastItem = { id: string; message: string; variant: ToastVariant }
type Listener = (toasts: ToastItem[]) => void

// ─── Singleton state ──────────────────────────────────────────────────────────
let _toasts: ToastItem[] = []
const _listeners: Set<Listener> = new Set()
let _nextId = 0

function notify() {
  _listeners.forEach((fn) => fn([..._toasts]))
}

function add(message: string, variant: ToastVariant, duration = 3500) {
  const id = String(++_nextId)
  _toasts = [..._toasts, { id, message, variant }]
  notify()
  setTimeout(() => remove(id), duration)
}

function remove(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id)
  notify()
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const toast = {
  success: (msg: string, ms?: number) => add(msg, "success", ms),
  error:   (msg: string, ms?: number) => add(msg, "error",   ms),
  info:    (msg: string, ms?: number) => add(msg, "info",    ms),
  warning: (msg: string, ms?: number) => add(msg, "warning", ms),
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const VARIANT_CLS: Record<ToastVariant, string> = {
  success: "border-l-[3px] border-l-[#16A34A] bg-white text-[#0F0F0F]",
  error:   "border-l-[3px] border-l-[#DC2626] bg-white text-[#0F0F0F]",
  warning: "border-l-[3px] border-l-[#D97706] bg-white text-[#0F0F0F]",
  info:    "border-l-[3px] border-l-[#4B6EF5] bg-white text-[#0F0F0F]",
}

const ICON: Record<ToastVariant, string> = {
  success: "✓",
  error:   "✕",
  warning: "!",
  info:    "i",
}

const ICON_CLS: Record<ToastVariant, string> = {
  success: "text-[#16A34A]",
  error:   "text-[#DC2626]",
  warning: "text-[#D97706]",
  info:    "text-[#4B6EF5]",
}

// ─── Toast Item ───────────────────────────────────────────────────────────────
function ToastEl({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <div
      role="alert"
      className={[
        "flex items-start gap-3 px-4 py-3 rounded-xl shadow-md border border-[rgba(0,0,0,0.08)]",
        "min-w-[240px] max-w-[360px] pointer-events-auto select-none",
        "transition-all duration-300",
        VARIANT_CLS[item.variant],
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      ].join(" ")}
    >
      <span className={["text-xs font-bold mt-0.5 shrink-0", ICON_CLS[item.variant]].join(" ")}>
        {ICON[item.variant]}
      </span>
      <p className="text-sm flex-1 leading-snug">{item.message}</p>
      <button
        onClick={onDismiss}
        aria-label="닫기"
        className="shrink-0 text-[#9BA8B5] hover:text-[#0F0F0F] transition-colors duration-100 text-xs mt-0.5"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Toaster ─────────────────────────────────────────────────────────────────
export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  React.useEffect(() => {
    _listeners.add(setToasts)
    return () => { _listeners.delete(setToasts) }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none md:bottom-6 md:right-6"
    >
      {toasts.map((t) => (
        <ToastEl key={t.id} item={t} onDismiss={() => remove(t.id)} />
      ))}
    </div>
  )
}

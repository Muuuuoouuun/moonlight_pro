import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

// Moon Design System — StatusBadge
// Maps status strings to color-coded pill badges

const badgeVariants = cva(
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-[#F0F0F2] text-[#4B5563]",
        success: "bg-[#F0FDF4] text-[#16A34A]",
        warning: "bg-[#FFFBEB] text-[#D97706]",
        danger:  "bg-[#FEF2F2] text-[#DC2626]",
        info:    "bg-[#F0F4FF] text-[#4B6EF5]",
        muted:   "bg-[#F8F8F9] text-[#9BA8B5]",
        silver:  "bg-[#F4F6F8] text-[#9BA8B5] border border-[rgba(0,0,0,0.07)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

// Status → display mapping
const STATUS_MAP: Record<
  string,
  { label: string; variant: NonNullable<VariantProps<typeof badgeVariants>["variant"]> }
> = {
  // Content
  draft:     { label: "초안",   variant: "muted" },
  published: { label: "발행됨", variant: "success" },
  archived:  { label: "보관됨", variant: "default" },
  // Lead
  new:       { label: "신규",   variant: "info" },
  contacted: { label: "접촉됨", variant: "warning" },
  qualified: { label: "적격",   variant: "success" },
  // Deal / Ops
  active:    { label: "활성",   variant: "success" },
  closed:    { label: "종료",   variant: "muted" },
  won:       { label: "성사",   variant: "success" },
  lost:      { label: "실패",   variant: "danger" },
  // Automation
  success:   { label: "성공",   variant: "success" },
  failure:   { label: "오류",   variant: "danger" },
  running:   { label: "실행중", variant: "warning" },
  idle:      { label: "대기",   variant: "muted" },
  error:     { label: "오류",   variant: "danger" },
  // System
  normal:    { label: "정상",   variant: "success" },
  degraded:  { label: "저하",   variant: "warning" },
  down:      { label: "다운",   variant: "danger" },
}

export interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status?: string
  label?: string
  dot?: boolean
  className?: string
}

export function StatusBadge({ status, label, variant, dot = false, className }: StatusBadgeProps) {
  const mapped = status ? STATUS_MAP[status] : null
  const resolvedVariant = variant ?? mapped?.variant ?? "default"
  const resolvedLabel = label ?? mapped?.label ?? status ?? ""

  return (
    <span className={badgeVariants({ variant: resolvedVariant, className })}>
      {dot && (
        <span
          className={[
            "inline-block w-1.5 h-1.5 rounded-full shrink-0",
            resolvedVariant === "success" ? "bg-[#16A34A]" :
            resolvedVariant === "warning" ? "bg-[#D97706]" :
            resolvedVariant === "danger"  ? "bg-[#DC2626]" :
            resolvedVariant === "info"    ? "bg-[#4B6EF5]" :
            "bg-[#9BA8B5]",
          ].join(" ")}
        />
      )}
      {resolvedLabel}
    </span>
  )
}

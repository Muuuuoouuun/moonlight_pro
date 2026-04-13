"use client"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

// Moon Design System — Button v2
// Palette: Black #0F0F0F · Silver #9BA8B5 · Surface #F8F8F9 · White #FFFFFF

const base = [
  "inline-flex items-center justify-center gap-2",
  "font-medium rounded-xl",
  "font-[Pretendard,-apple-system,BlinkMacSystemFont,sans-serif]",
  "transition-all duration-150 ease-in-out",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0F0F0F]/50",
  "disabled:pointer-events-none disabled:opacity-40",
  "select-none whitespace-nowrap active:scale-[0.97]",
].join(" ")

const buttonVariants = cva(base, {
  variants: {
    variant: {
      primary:
        "bg-[#0F0F0F] text-white shadow-sm hover:bg-[#1A1A1A] active:bg-[#2D2D2D]",
      secondary:
        "bg-white text-[#0F0F0F] border border-[rgba(0,0,0,0.12)] shadow-sm hover:bg-[#F8F8F9] hover:border-[rgba(0,0,0,0.18)] active:bg-[#F0F0F2]",
      ghost:
        "bg-transparent text-[#4B5563] hover:bg-[#F8F8F9] hover:text-[#0F0F0F] active:bg-[#F0F0F2]",
      silver:
        "bg-[#9BA8B5] text-white shadow-sm hover:bg-[#8A97A4] active:bg-[#7A8793]",
      danger:
        "bg-[#DC2626] text-white shadow-sm hover:bg-[#B91C1C] active:bg-[#991B1B]",
    },
    size: {
      xs: "h-7 px-2.5 text-xs",
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base",
    },
    fullWidth: {
      true: "w-full",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      loading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0"
          aria-hidden="true"
        />
      ) : leftIcon ? (
        <span className="shrink-0 opacity-80">{leftIcon}</span>
      ) : null}
      {children}
      {!loading && rightIcon ? (
        <span className="shrink-0 opacity-60">{rightIcon}</span>
      ) : null}
    </button>
  )
)
Button.displayName = "Button"

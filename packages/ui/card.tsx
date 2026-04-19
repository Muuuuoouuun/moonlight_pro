import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const cardVariants = cva(
  [
    "rounded-2xl bg-[var(--surface,#fff)] text-[var(--text,#0c1018)]",
    "transition-all duration-200",
  ],
  {
    variants: {
      variant: {
        default:  "border border-[var(--line,rgba(12,16,24,0.08))] shadow-sm",
        elevated: "shadow-md hover:shadow-lg hover:-translate-y-0.5",
        bordered: "border-2 border-[var(--text,#0c1018)]",
        silver:   "border border-[var(--cm-metal-400,#a8b8d4)] bg-[var(--surface-strong,#f4f5f8)]",
        ghost:    "bg-transparent border-none shadow-none",
      },
      interactive: {
        true: "cursor-pointer hover:shadow-md hover:-translate-y-[2px]",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cardVariants({ variant, interactive, className })}
      {...props}
    />
  )
)
Card.displayName = "Card"

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={["flex flex-col gap-1 px-6 pt-6 pb-0", className].filter(Boolean).join(" ")}
      {...props}
    />
  )
)
CardHeader.displayName = "CardHeader"

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={[
        "text-base font-semibold leading-snug text-[var(--text,#0c1018)] tracking-tight",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
)
CardTitle.displayName = "CardTitle"

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={["text-sm text-[var(--muted,#4a5568)] leading-relaxed", className].filter(Boolean).join(" ")}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

export const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={["px-6 py-5", className].filter(Boolean).join(" ")}
      {...props}
    />
  )
)
CardBody.displayName = "CardBody"

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={[
        "flex items-center px-6 py-4 border-t border-[var(--line,rgba(12,16,24,0.08))]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
)
CardFooter.displayName = "CardFooter"

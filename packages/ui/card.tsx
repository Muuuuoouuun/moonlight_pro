import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

// Moon Design System — Card v2
// Palette: White #FFFFFF · Surface #F8F8F9 · Border rgba(0,0,0,0.07) · Silver #9BA8B5

const cardVariants = cva(
  [
    "rounded-2xl bg-white text-[#0F0F0F]",
    "transition-all duration-200",
  ],
  {
    variants: {
      variant: {
        default:  "border border-[rgba(0,0,0,0.07)] shadow-sm",
        elevated: "shadow-md hover:shadow-lg hover:-translate-y-0.5",
        bordered: "border-2 border-[#0F0F0F]",
        silver:   "border border-[#9BA8B5] bg-[#F8F8F9]",
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
        "text-base font-semibold leading-snug text-[#0F0F0F] tracking-tight",
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
    className={["text-sm text-[#6B7280] leading-relaxed", className].filter(Boolean).join(" ")}
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
        "flex items-center px-6 py-4 border-t border-[rgba(0,0,0,0.06)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
)
CardFooter.displayName = "CardFooter"

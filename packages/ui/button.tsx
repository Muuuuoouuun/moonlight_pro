import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSurface = "dark" | "light";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /**
   * Which surface this button is rendered on. Hub (dark) is the
   * default because that is where primary actions live most of the
   * time. Public pages should pass `surface="light"`.
   */
  surface?: ButtonSurface;
  children?: ReactNode;
}

/**
 * Primary = moonstone metal gradient with a rim-light top edge.
 * Secondary/ghost adapt to dark (hub) or light (web) surfaces.
 * All styling lives in `primitives.css` — keep this component thin.
 */
export function Button({
  variant = "primary",
  surface = "dark",
  children,
  type = "button",
  className,
  ...props
}: ButtonProps) {
  const classes = ["cm-btn", className].filter(Boolean).join(" ");
  return (
    <button
      type={type}
      data-variant={variant}
      data-surface={surface}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}

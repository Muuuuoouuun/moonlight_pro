import type { ReactNode } from "react";

export type ChipTone = "ok" | "warn" | "risk" | "info" | "accent" | "neutral";

export interface StatusChipProps {
  tone?: ChipTone;
  surface?: "dark" | "light";
  /** When true, hides the leading status dot. Useful for plain labels. */
  plain?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StatusChip({
  tone = "neutral",
  surface = "dark",
  plain = false,
  children,
  className,
}: StatusChipProps) {
  const classes = ["cm-chip", className].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      data-tone={tone === "neutral" ? undefined : tone}
      data-surface={surface}
      data-plain={plain ? "true" : undefined}
    >
      {children}
    </span>
  );
}

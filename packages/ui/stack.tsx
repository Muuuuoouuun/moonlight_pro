import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type SpaceToken = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function gapVar(gap: SpaceToken | undefined, fallback: SpaceToken) {
  return `var(--cm-space-${gap ?? fallback})`;
}

/* ───── Stack ─ vertical flow with token gap ────────────────────── */
export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: SpaceToken;
  children?: ReactNode;
}

export function Stack({ gap, className, style, children, ...props }: StackProps) {
  const classes = ["cm-stack", className].filter(Boolean).join(" ");
  const merged: CSSProperties = {
    ...(style ?? {}),
    ["--cm-stack-gap" as string]: gapVar(gap, 4),
  };
  return (
    <div className={classes} style={merged} {...props}>
      {children}
    </div>
  );
}

/* ───── Cluster ─ horizontal flow that wraps ────────────────────── */
export interface ClusterProps extends HTMLAttributes<HTMLDivElement> {
  gap?: SpaceToken;
  children?: ReactNode;
}

export function Cluster({ gap, className, style, children, ...props }: ClusterProps) {
  const classes = ["cm-cluster", className].filter(Boolean).join(" ");
  const merged: CSSProperties = {
    ...(style ?? {}),
    ["--cm-cluster-gap" as string]: gapVar(gap, 3),
  };
  return (
    <div className={classes} style={merged} {...props}>
      {children}
    </div>
  );
}

/* ───── Grid ─ token-gap columns with optional collapse ─────────── */
export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: number;
  gap?: SpaceToken;
  /** Responsive collapse breakpoint — `md` collapses to 2-col, then 1-col. */
  collapse?: "md" | "sm" | "none";
  children?: ReactNode;
}

export function Grid({
  cols = 1,
  gap,
  collapse = "md",
  className,
  style,
  children,
  ...props
}: GridProps) {
  const classes = ["cm-grid", className].filter(Boolean).join(" ");
  const merged: CSSProperties = {
    ...(style ?? {}),
    ["--cm-grid-cols" as string]: String(cols),
    ["--cm-grid-gap" as string]: gapVar(gap, 4),
  };
  return (
    <div
      className={classes}
      data-collapse={collapse === "none" ? undefined : collapse}
      style={merged}
      {...props}
    >
      {children}
    </div>
  );
}

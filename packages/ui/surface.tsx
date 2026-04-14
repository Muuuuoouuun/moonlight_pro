import type { HTMLAttributes, ReactNode } from "react";

type SurfaceTone = "card" | "panel" | "feature";
type SurfaceMode = "dark" | "light";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone;
  surface?: SurfaceMode;
  as?: "div" | "section" | "article" | "aside";
  children?: ReactNode;
}

/**
 * Surface is the single container primitive. Three tones cover
 * everything the product actually needs:
 *   - card:    standard container (default)
 *   - panel:   raised with shadow + rim-light top edge
 *   - feature: largest radius + panel shadow for hero moments
 *
 * Use `surface="light"` on the public site. The hub defaults to dark.
 */
export function Surface({
  tone = "card",
  surface = "dark",
  as: Tag = "div",
  className,
  children,
  ...props
}: SurfaceProps) {
  const classes = ["cm-surface", className].filter(Boolean).join(" ");
  return (
    <Tag
      data-tone={tone}
      data-surface={surface}
      className={classes}
      {...props}
    >
      {children}
    </Tag>
  );
}

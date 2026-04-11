import type { CSSProperties, HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  surface?: "dark" | "light";
}

/**
 * Skeleton — shimmer placeholder honoring prefers-reduced-motion.
 * Pass width/height in px or any CSS length.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius,
  surface = "dark",
  className,
  style,
  ...props
}: SkeletonProps) {
  const classes = ["cm-skeleton", className].filter(Boolean).join(" ");
  const merged: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    borderRadius:
      radius !== undefined
        ? typeof radius === "number"
          ? `${radius}px`
          : radius
        : undefined,
    ...(style ?? {}),
  };
  return (
    <div
      aria-hidden="true"
      className={classes}
      data-surface={surface}
      style={merged}
      {...props}
    />
  );
}

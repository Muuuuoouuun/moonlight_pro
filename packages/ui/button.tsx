import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { colors, gradients, motion, radius, shadows } from "./tokens";

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

const baseStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44, // --cm-touch-min
  padding: "0 20px",
  borderRadius: radius.pill,
  border: "1px solid transparent",
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "-0.005em",
  cursor: "pointer",
  transition: `transform ${motion.hover}ms ${motion.easeStandard}, box-shadow ${motion.hover}ms ${motion.easeStandard}, background ${motion.hover}ms ${motion.easeStandard}`,
  isolation: "isolate", // so the rim-light pseudo stays contained
  overflow: "hidden",
};

/**
 * Primary = champagne metal gradient with a rim-light overlay on the
 * top edge. The rim light is expressed as a linear-gradient layered on
 * top of the metal fill via `backgroundImage` stacking.
 */
const primaryStyle: CSSProperties = {
  color: colors.ink[900],
  backgroundImage: `${gradients.rim}, ${gradients.metal}`,
  backgroundBlendMode: "overlay, normal",
  borderColor: colors.metal[600],
  boxShadow: `${shadows.metalGlow}, inset 0 1px 0 rgba(255,255,255,0.35)`,
};

const secondaryDarkStyle: CSSProperties = {
  background: colors.ink[800],
  color: colors.text.platinum,
  borderColor: colors.line.darkStrong,
};

const secondaryLightStyle: CSSProperties = {
  background: colors.parchment.soft,
  color: colors.text.graphite,
  borderColor: colors.line.lightStrong,
};

const ghostDarkStyle: CSSProperties = {
  background: "transparent",
  color: colors.text.platinumSoft,
};

const ghostLightStyle: CSSProperties = {
  background: "transparent",
  color: colors.text.graphiteSoft,
};

function resolveVariantStyle(
  variant: ButtonVariant,
  surface: ButtonSurface,
): CSSProperties {
  if (variant === "primary") return primaryStyle;
  if (variant === "secondary") {
    return surface === "dark" ? secondaryDarkStyle : secondaryLightStyle;
  }
  return surface === "dark" ? ghostDarkStyle : ghostLightStyle;
}

export function Button({
  variant = "primary",
  surface = "dark",
  children,
  type = "button",
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      style={{
        ...baseStyle,
        ...resolveVariantStyle(variant, surface),
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Com_Moon Design Tokens — TypeScript mirror.
 *
 * Source of truth lives in `tokens.css` and DESIGN.md §5.
 * Shape: Smoked Command Deck — dark ink stack + warm parchment stack
 * bridged by a single champagne metal accent.
 *
 * If you change a value here, change it in `tokens.css` as well.
 */

export const colors = {
  ink: {
    900: "#0e1114",
    800: "#15191e",
    700: "#1d222a",
    600: "#2a313b",
  },
  parchment: {
    base: "#ede9e0",
    soft: "#f6f3ec",
    deep: "#e2ddd0",
  },
  metal: {
    300: "#e8dfcb",
    400: "#cdbf9e",
    500: "#a8986f",
    600: "#7d6f4a",
  },
  text: {
    platinum: "#e9ebee",
    platinumSoft: "#9ba3ad",
    graphite: "#171a1f",
    graphiteSoft: "#55606b",
  },
  line: {
    dark: "rgba(255, 255, 255, 0.08)",
    darkStrong: "rgba(255, 255, 255, 0.14)",
    light: "rgba(23, 26, 31, 0.10)",
    lightStrong: "rgba(23, 26, 31, 0.18)",
  },
  status: {
    ok: "#6fa28a",
    warn: "#c4a15a",
    risk: "#b5574a",
    info: "#6d8aa4",
  },
} as const;

export const gradients = {
  metal:
    "linear-gradient(135deg, #e8dfcb 0%, #cdbf9e 38%, #a8986f 70%, #7d6f4a 100%)",
  ink: "linear-gradient(180deg, #15191e 0%, #0e1114 100%)",
  rim: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 60%)",
} as const;

export const fonts = {
  serif:
    '"MaruBuri", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Times New Roman", Georgia, serif',
  sans:
    '"SUIT Variable", "Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Helvetica Neue", Arial, sans-serif',
  mono:
    '"IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
} as const;

export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  pill: 999,
} as const;

export const containers = {
  public: "min(1120px, calc(100vw - 32px))",
  hub: "min(1440px, calc(100vw - 24px))",
} as const;

export const shadows = {
  cardDark: "0 14px 28px rgba(0, 0, 0, 0.45)",
  panelDark: "0 24px 60px rgba(0, 0, 0, 0.55)",
  cardLight: "0 14px 28px rgba(23, 26, 31, 0.08)",
  panelLight: "0 24px 60px rgba(23, 26, 31, 0.12)",
  metalGlow: "0 0 24px rgba(205, 191, 158, 0.22)",
} as const;

export const motion = {
  page: 220,
  card: 160,
  dialog: 180,
  hover: 120,
  easeStandard: "cubic-bezier(0.2, 0.6, 0.2, 1)",
} as const;

export const tokens = {
  colors,
  gradients,
  fonts,
  space,
  radius,
  containers,
  shadows,
  motion,
} as const;

export type Tokens = typeof tokens;

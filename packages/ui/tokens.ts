/**
 * Com_Moon Design Tokens — TypeScript mirror of `tokens.css`.
 *
 * Source of truth lives in `tokens.css` and DESIGN.md §4–§5.
 * Shape: Moonstone Command Deck — void-black stack + frost silver stack
 * bridged by a single moonstone (cool blue-silver) accent.
 *
 * If you change a value here, change it in `tokens.css` as well.
 */

export const colors = {
  ink: {
    900: "#0c1018",
    800: "#131923",
    700: "#1b2332",
    600: "#26304a",
  },
  parchment: {
    base: "#f0f2f7",
    soft: "#f4f5f8",
    deep: "#e2e6ef",
  },
  metal: {
    300: "#d6dff0",
    400: "#a8b8d4",
    500: "#5274a8",
    600: "#365888",
  },
  text: {
    platinum: "#e8edf4",
    platinumSoft: "#7e8c9e",
    graphite: "#0c1018",
    graphiteSoft: "#4a5568",
  },
  line: {
    dark: "rgba(255, 255, 255, 0.07)",
    darkStrong: "rgba(255, 255, 255, 0.12)",
    light: "rgba(12, 16, 24, 0.08)",
    lightStrong: "rgba(12, 16, 24, 0.16)",
  },
  status: {
    ok: "#5a8f7a",
    warn: "#9e8040",
    risk: "#a04040",
    info: "#5070a0",
  },
} as const;

export const gradients = {
  metal:
    "linear-gradient(135deg, #d6dff0 0%, #a8b8d4 38%, #5274a8 70%, #365888 100%)",
  ink: "linear-gradient(180deg, #131923 0%, #0c1018 100%)",
  rim: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 55%)",
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
  cardDark: "0 14px 28px rgba(0, 0, 0, 0.50)",
  panelDark: "0 24px 60px rgba(0, 0, 0, 0.60)",
  cardLight: "0 14px 28px rgba(12, 16, 24, 0.07)",
  panelLight: "0 24px 60px rgba(12, 16, 24, 0.10)",
  metalGlow: "0 0 28px rgba(82, 116, 168, 0.22)",
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

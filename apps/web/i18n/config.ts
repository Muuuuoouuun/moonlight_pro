/**
 * Canonical locale configuration for the public web surface.
 *
 * This file is imported by both the next-intl request config and the
 * language switcher. Keep it free of server-only imports so it can
 * travel to the client bundle.
 */

export const locales = ["ko", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ko";

/** Cookie name used to persist the user's locale preference. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Type guard that narrows an unknown string to a supported locale. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

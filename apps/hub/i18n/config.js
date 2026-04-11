/**
 * Canonical locale configuration for the Com_Moon Hub (private OS).
 *
 * Mirrors apps/web/i18n/config.ts so both surfaces share the same
 * cookie contract (NEXT_LOCALE) and the same Korean-first default.
 *
 * Keep this file free of server-only imports so it can be consumed by
 * the client bundle (language switcher, client components).
 */

export const locales = ["ko", "en"];

export const defaultLocale = "ko";

/** Cookie name used to persist the user's locale preference. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Narrows an unknown value to a supported locale. */
export function isLocale(value) {
  return typeof value === "string" && locales.includes(value);
}

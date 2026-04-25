/**
 * Canonical locale configuration for the Com_Moon Hub (private OS).
 *
 * The Hub owns the active UI locale contract after the public web surface
 * was detached from this workspace.
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

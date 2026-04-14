import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

/**
 * next-intl request configuration.
 *
 * Cookie-based locale resolution with no URL prefix: we read
 * `NEXT_LOCALE` from the incoming request's cookies and fall back to
 * the default (`ko`) whenever the cookie is missing or invalid.
 *
 * Wired into Next via `createNextIntlPlugin("./i18n/request.ts")` in
 * `next.config.mjs`.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

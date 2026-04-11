"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { locales, LOCALE_COOKIE } from "@/i18n/config";

/**
 * Hub KO / EN switcher.
 *
 * Mirrors apps/web/components/language-switcher.tsx: writes the chosen
 * locale to the `NEXT_LOCALE` cookie (one year) and triggers
 * `router.refresh()` so the next request re-resolves messages through
 * the next-intl request config. No URL prefix, no full reload.
 *
 * Mounted in the dashboard shell topbar so operators can toggle
 * language from anywhere inside the hub.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("locale");
  const [isPending, startTransition] = useTransition();

  function switchTo(next) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      className="lang-switch"
      role="group"
      aria-label={t("ariaLabel")}
      data-pending={isPending ? "true" : undefined}
    >
      {locales.map((code, index) => (
        <span key={code} style={{ display: "inline-flex", alignItems: "center" }}>
          {index > 0 && <span className="lang-switch-sep">/</span>}
          <button
            type="button"
            className="lang-switch-btn"
            aria-pressed={locale === code}
            onClick={() => switchTo(code)}
          >
            {t(code)}
          </button>
        </span>
      ))}
    </div>
  );
}

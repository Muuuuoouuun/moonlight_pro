"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { locales, LOCALE_COOKIE } from "@/i18n/config";

const LOCALE_LABELS = {
  ko: "국문",
  en: "영문",
};

export function LanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale();
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
      aria-label="언어 전환"
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
            {LOCALE_LABELS[code] || code.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}

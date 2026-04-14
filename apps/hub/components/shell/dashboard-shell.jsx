"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, StatusChip } from "@com-moon/ui";
import {
  getActiveNavigationSection,
  getActiveNavigationView,
  matchesNavigationPath,
  navigationItems,
  shellActions,
} from "@/lib/dashboard-data";
import { LanguageSwitcher } from "./language-switcher";

const BUTTON_VARIANT = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
};

export function DashboardShell({ children }) {
  const pathname = usePathname();
  const tBrand = useTranslations("brand");
  const tShell = useTranslations("shell");
  const tNav = useTranslations("nav");
  const tAction = useTranslations("shellAction");

  const currentSection = getActiveNavigationSection(pathname);
  const currentView = getActiveNavigationView(pathname, currentSection);
  const sectionLabel = tNav(`${currentSection.i18nKey}.label`);
  const sectionDescription = tNav(`${currentSection.i18nKey}.description`);
  const viewLabel = tNav(`${currentView.i18nKey}.label`);
  const viewDescription = tNav(`${currentView.i18nKey}.description`);

  const coreLanes = navigationItems.filter((item) => (item.group || "core") === "core");
  const utilityLanes = navigationItems.filter((item) => item.group === "utility");
  const sectionViews = currentSection.children?.length ? currentSection.children : [];

  return (
    <div className="hub-shell">
      <aside className="hub-shell__nav" aria-label="Primary navigation">
        <Link className="hub-shell__brand" href="/dashboard" aria-label={`${tBrand("name")} home`}>
          <span className="hub-shell__brand-mark" aria-hidden="true">◐</span>
          <span className="hub-shell__brand-text">
            <strong>{tBrand("name")}</strong>
            <span>{tBrand("tagline")}</span>
          </span>
        </Link>

        <nav className="hub-shell__nav-group" aria-label={tShell("coreLanesKicker")}>
          <p className="hub-shell__nav-kicker">{tShell("coreLanesKicker")}</p>
          <ul className="hub-shell__nav-list">
            {coreLanes.map((item) => {
              const active = matchesNavigationPath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hub-shell__nav-link"
                    data-active={active ? "true" : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="hub-shell__nav-link-label">
                      {tNav(`${item.i18nKey}.label`)}
                    </span>
                    <span className="hub-shell__nav-link-desc">
                      {tNav(`${item.i18nKey}.description`)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {utilityLanes.length ? (
          <nav className="hub-shell__nav-group" aria-label={tShell("utilityTabsKicker")}>
            <p className="hub-shell__nav-kicker">{tShell("utilityTabsKicker")}</p>
            <ul className="hub-shell__nav-list">
              {utilityLanes.map((item) => {
                const active = matchesNavigationPath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="hub-shell__nav-link"
                      data-active={active ? "true" : undefined}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="hub-shell__nav-link-label">
                        {tNav(`${item.i18nKey}.label`)}
                      </span>
                      <span className="hub-shell__nav-link-desc">
                        {tNav(`${item.i18nKey}.description`)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        <div className="hub-shell__nav-foot">
          <StatusChip tone="accent">{tShell("protectedShellPill")}</StatusChip>
          <p>{sectionDescription}</p>
        </div>
      </aside>

      <div className="hub-shell__main">
        <header className="hub-shell__topbar">
          <div className="hub-shell__topbar-crumb">
            <p className="hub-shell__topbar-kicker">{tBrand("crumbEyebrow")}</p>
            <h1 className="hub-shell__topbar-title">
              {sectionLabel}
              {currentView.href !== currentSection.href ? (
                <span className="hub-shell__topbar-title-tail">
                  {tShell("sectionSeparator")}
                  {viewLabel}
                </span>
              ) : null}
            </h1>
            <p className="hub-shell__topbar-note">{viewDescription}</p>
          </div>
          <div className="hub-shell__topbar-actions">
            <LanguageSwitcher />
            {shellActions.map((action) => (
              <Link key={action.href} href={action.href} className="hub-shell__topbar-action-link">
                <Button
                  variant={BUTTON_VARIANT[action.tone] || "secondary"}
                  surface="dark"
                  tabIndex={-1}
                >
                  {tAction(action.i18nKey)}
                </Button>
              </Link>
            ))}
          </div>
        </header>

        {sectionViews.length > 1 ? (
          <nav
            className="hub-shell__subnav"
            aria-label={`${sectionLabel}${tShell("contextAriaSuffix")}`}
          >
            {sectionViews.map((view) => {
              const active = matchesNavigationPath(pathname, view.href);
              return (
                <Link
                  key={view.href}
                  href={view.href}
                  className="hub-shell__subnav-link"
                  data-active={active ? "true" : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  {tNav(`${view.i18nKey}.label`)}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <main className="hub-shell__content">{children}</main>
      </div>
    </div>
  );
}

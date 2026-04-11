"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getActiveNavigationSection,
  getActiveNavigationView,
  matchesNavigationPath,
  navigationItems,
  shellActions,
} from "@/lib/dashboard-data";

export function DashboardShell({ children }) {
  const pathname = usePathname();
  const currentSection = getActiveNavigationSection(pathname);
  const currentView = getActiveNavigationView(pathname, currentSection);
  const sectionViews = currentSection.children?.length ? currentSection.children : [currentSection];
  const sectionTitle =
    currentView.href !== currentSection.href ? `${currentSection.label} / ${currentView.label}` : currentSection.label;

  return (
    <div className="os-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Com_Moon OS home">
          <span className="brand-mark">M</span>
          <span className="brand-label">
            <strong>Com_Moon OS</strong>
            <span>Private hub shell</span>
          </span>
        </Link>

        <div className="nav-section">
          <p className="nav-kicker">Workspace</p>
          <div className="nav-list">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                data-active={matchesNavigationPath(pathname, item.href)}
                aria-current={matchesNavigationPath(pathname, item.href) ? "page" : undefined}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="sidebar-foot">
          <span className="status-pill">Protected shell</span>
          <p className="sidebar-note">{currentSection.description}</p>
          <div className="status-grid">
            <div className="status-item">
              <span>Section</span>
              <strong>{currentSection.label}</strong>
            </div>
            <div className="status-item">
              <span>Current view</span>
              <strong>{currentView.label}</strong>
            </div>
            <div className="status-item">
              <span>Focus</span>
              <strong>{currentView.description}</strong>
            </div>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-copy">
            <div className="crumb">
              <small>Com_Moon Hub</small>
              <strong>{sectionTitle}</strong>
            </div>
            <p className="topbar-note">
              {currentSection.description}. {currentView.description}
            </p>
          </div>
          <div className="topbar-actions">
            {shellActions.map((action) => (
              <Link
                key={action.href}
                className={`button button-${action.tone}`}
                data-active={matchesNavigationPath(pathname, action.href) ? "true" : "false"}
                href={action.href}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </header>

        {sectionViews.length > 1 ? (
          <section className="shell-context-bar" aria-label={`${currentSection.label} views`}>
            <div className="shell-context-head">
              <div>
                <p className="shell-context-kicker">{currentSection.label} Views</p>
                <strong>{currentView.label}</strong>
                <span>{currentView.description}</span>
              </div>
              <p className="shell-context-note">
                같은 섹션 안에서 무엇을 보고 있는지 잃지 않게, 현재 뷰와 다음 전환 후보를
                한 줄에서 바로 드러냅니다.
              </p>
            </div>
            <div className="shell-context-switcher">
              {sectionViews.map((view) => (
                <Link
                  key={view.href}
                  className="shell-context-link"
                  data-active={matchesNavigationPath(pathname, view.href) ? "true" : "false"}
                  aria-current={matchesNavigationPath(pathname, view.href) ? "page" : undefined}
                  href={view.href}
                >
                  <strong>{view.label}</strong>
                  <span>{view.description}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <main className="workspace">{children}</main>
      </div>
    </div>
  );
}

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
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="sidebar-foot">
          <span className="status-pill">Protected shell</span>
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
              <span>Mode</span>
              <strong>Private OS</strong>
            </div>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="crumb">
            <small>Com_Moon Hub</small>
            <strong>
              {currentSection.label}
              {currentView.href !== currentSection.href ? ` / ${currentView.label}` : ""}
            </strong>
          </div>
          <div className="topbar-actions">
            {shellActions.map((action) => (
              <Link
                key={action.href}
                className={`button button-${action.tone}`}
                href={action.href}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </header>

        <main className="workspace">{children}</main>
      </div>
    </div>
  );
}

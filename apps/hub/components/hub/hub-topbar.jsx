"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { IconButton, Button } from "./hub-primitives";
import { topNavigationForRoute } from "./hub-nav";

const LABELS = {
  'dashboard': 'Moonlight',
  'daily-brief': 'Daily Brief',
  'classin': '클래스인', 'brand': '브랜드', 'pipeline': '업무·파이프라인', 'segments': '세그먼트',
  'work': 'Work', 'calendar': 'Calendar', 'projects': 'Projects', 'decisions': 'Decisions', 'roadmap': 'Roadmap', 'rhythm': 'Rhythm',
  'content': 'Content', 'studio': 'Studio', 'queue': 'Queue', 'campaigns': 'Campaigns',
  'revenue': 'Revenue', 'overview': 'Overview', 'leads': 'Leads', 'deals': 'Deals', 'cases': 'Cases', 'accounts': 'Accounts', 'followups': 'Follow-ups',
  'automations': 'Automations', 'flows': 'Flows', 'email': 'Email', 'webhooks': 'Webhooks', 'runs': 'Runs',
  'agents': 'Agents', 'chat': 'Chat', 'council': 'Council', 'orders': 'Orders',
  'evolution': 'Evolution', 'settings': 'Settings',
  'operations': 'Operations', 'pms': 'PMS', 'playbooks': 'Playbooks', 'command-center': 'Command Center',
  'card-news': 'Card News', 'logs': 'Logs', 'routine': 'Routine',
  'management': 'Manage', 'plan': 'Plan', 'releases': 'Releases', 'assets': 'Assets', 'publish': 'Publish',
  'integrations': 'Integrations', 'activity': 'Activity', 'issues': 'Issues',
};

export function TopBar({ path, view, scope, onNavigate, theme, onTheme, onSidebarOpen, onNew, navOpen, menuButtonRef }) {
  const segments = path.split('/').filter(Boolean);
  const navigation = topNavigationForRoute(path, scope, view);
  const pageLabel = navigation.activeTab?.label
    || navigation.anchor?.label
    || LABELS[segments[segments.length - 1]]
    || segments[segments.length - 1];
  const sectionLabel = navigation.activeTab ? navigation.anchor?.label : 'Moonlight';
  const now = new Date();
  const weekday = ['일','월','화','수','목','금','토'][now.getDay()];
  const m = now.getMonth() + 1, d = now.getDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  return (
    <header className="hub-topbar" style={{
      flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line-soft)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div className="hub-topbar__main">
        <IconButton
          className="hub-mobile-only hub-mobile-nav-opener"
          ref={menuButtonRef}
          aria-expanded={navOpen}
          aria-controls="hub-mobile-navigation"
          icon="menu"
          tooltip="내비게이션 열기"
          onClick={onSidebarOpen}
        />

        <div className="hub-topbar__crumbs" style={{ minWidth: 0 }}>
          <span className="hub-topbar__section">{sectionLabel}</span>
          <strong className="hub-topbar__title">{pageLabel}</strong>
        </div>

        <div style={{ flex: 1 }} />

        <div className="hub-topbar__meta" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
          background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
          borderRadius: 999, fontSize: 11.5, color: 'var(--fg-muted)',
        }}>
          <Iconed name="clock" size={12} style={{ color: 'var(--moon-300)' }} />
          <span className="mono" style={{ color: 'var(--fg)' }}>{weekday} · {m}/{d} · {hh}:{mm}</span>
        </div>

        {/* 보류 스코프(Agents) 상시 버튼 제거 — 코어 루프(고객 연락)가 그 자리를 갖는다. */}
        <IconButton className="hub-topbar__secondary" icon="signal" tooltip="고객 연락 열기" onClick={() => onNavigate('dashboard/revenue/followups')} />
        <button onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          style={{
            width: 28, height: 28, borderRadius: 'var(--r-sm)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-muted)',
            border: '1px solid var(--line-soft)', background: 'var(--surface-2)',
          }}>
          <Iconed name={theme === 'dark' ? 'moon' : 'sun'} size={13} />
        </button>
        <IconButton className="hub-topbar__secondary" icon="bell" tooltip="Open Daily Brief" onClick={() => onNavigate('dashboard/daily-brief')} />
        <Button className="hub-topbar__primary-action" variant="primary" size="sm" icon="plus" onClick={onNew}>New</Button>
      </div>

      {navigation.tabs.length > 0 && (
        <nav className="hub-topbar__tabs" aria-label={`${navigation.anchor.label} 하위 메뉴`}>
          {navigation.tabs.map((tab) => {
            const selected = navigation.activeTab?.key === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onNavigate(tab.path)}
              >
                {tab.label}
                {/* 보류 스코프 마커(README §4) — 코어와 같은 완성 표면처럼 읽히지 않게. */}
                {tab.deferred && (
                  <span style={{ marginLeft: 5, fontSize: 10.5, color: 'var(--fg-faint)', letterSpacing: 0 }}>
                    준비 중
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}

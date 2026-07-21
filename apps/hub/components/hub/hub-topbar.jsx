"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { IconButton, Button } from "./hub-primitives";

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

export function TopBar({ path, onNavigate, theme, onTheme, onSidebarOpen, onNew, navOpen, menuButtonRef }) {
  const segments = path.split('/').filter(Boolean);
  const now = new Date();
  const weekday = ['일','월','화','수','목','금','토'][now.getDay()];
  const m = now.getMonth() + 1, d = now.getDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  return (
    <header className="hub-topbar" style={{
      height: 48, flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line-soft)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
      gap: 14,
    }}>
      <IconButton
        className="hub-mobile-only hub-mobile-nav-opener"
        ref={menuButtonRef}
        aria-expanded={navOpen}
        aria-controls="hub-mobile-navigation"
        icon="menu"
        tooltip="내비게이션 열기"
        onClick={onSidebarOpen}
      />

      <div className="hub-topbar__crumbs" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {segments.map((s, i) => {
          const isLast = i === segments.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <Iconed name="chevronR" size={11} style={{ color: 'var(--fg-faint)' }} />}
              <button onClick={() => {
                if (!isLast) onNavigate(segments.slice(0, i + 1).join('/'));
              }} style={{
                fontSize: 12.5, fontWeight: isLast ? 500 : 400,
                color: isLast ? 'var(--fg)' : 'var(--fg-dim)',
                padding: '3px 6px', borderRadius: 4,
                cursor: isLast ? 'default' : 'pointer',
              }}>
                {LABELS[s] || s}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div className="hub-topbar__meta" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
        background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
        borderRadius: 999, fontSize: 11.5, color: 'var(--fg-muted)',
      }}>
        <Iconed name="clock" size={12} style={{ color: 'var(--moon-300)' }} />
        <span className="mono" style={{ color: 'var(--fg)' }}>{weekday} · {m}/{d} · {hh}:{mm}</span>
      </div>

      <IconButton className="hub-topbar__secondary" icon="sparkle" tooltip="Ask Agents" onClick={() => onNavigate('dashboard/agents/chat')} />
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
    </header>
  );
}

"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { IconButton, Button } from "./hub-primitives";

const LABELS = {
  'dashboard': 'Moonlight',
  'daily-brief': 'Daily Brief',
  'work': 'Work', 'calendar': 'Calendar', 'projects': 'Projects', 'decisions': 'Decisions', 'roadmap': 'Roadmap', 'rhythm': 'Rhythm',
  'content': 'Content', 'studio': 'Studio', 'queue': 'Queue', 'campaigns': 'Campaigns',
  'revenue': 'Revenue', 'overview': 'Overview', 'leads': 'Leads', 'deals': 'Deals', 'cases': 'Cases', 'accounts': 'Accounts',
  'automations': 'Automations', 'flows': 'Flows', 'email': 'Email', 'webhooks': 'Webhooks', 'runs': 'Runs',
  'agents': 'Agents', 'chat': 'Chat', 'council': 'Council', 'orders': 'Orders', 'office': 'VR Office',
  'evolution': 'Evolution', 'settings': 'Settings',
  'operations': 'Operations', 'pms': 'PMS', 'playbooks': 'Playbooks', 'command-center': 'Command Center',
  'card-news': 'Card News', 'logs': 'Logs', 'routine': 'Routine',
  'management': 'Manage', 'plan': 'Plan', 'releases': 'Releases', 'assets': 'Assets', 'publish': 'Publish',
  'integrations': 'Integrations', 'activity': 'Activity', 'issues': 'Issues',
};

export function TopBar({ path, onNavigate, density, onDensity, theme, onTheme, onTweaksToggle, onSidebarOpen }) {
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
      <IconButton className="hub-mobile-only" icon="menu" tooltip="Open navigation" onClick={onSidebarOpen} />

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

      <div className="hub-topbar__density" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
        {['compact','default','relaxed'].map(d => (
          <button key={d} onClick={() => onDensity(d)} style={{
            padding: '4px 9px', fontSize: 11, fontWeight: 500, borderRadius: 4,
            color: density === d ? 'var(--fg)' : 'var(--fg-faint)',
            background: density === d ? 'var(--surface-3)' : 'transparent',
            textTransform: 'capitalize',
          }}>{d}</button>
        ))}
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
      <IconButton icon="settings" tooltip="Tweaks" onClick={onTweaksToggle} />
      <IconButton className="hub-topbar__secondary" icon="bell" tooltip="Notifications" />
      <Button className="hub-topbar__primary-action" variant="primary" size="sm" icon="plus">New</Button>
    </header>
  );
}

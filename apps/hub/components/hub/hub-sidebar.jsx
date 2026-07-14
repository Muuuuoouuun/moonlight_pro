"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { IconButton, Avatar, Kbd, SegmentedControl } from "./hub-primitives";
import {
  SIDEBAR_PRIMARY,
  SIDEBAR_SCOPES,
  SIDEBAR_UTILITIES,
  DEFAULT_SCOPE,
  deriveSidebarScope,
  isSidebarAnchorActive,
  normalizeScope,
  ownerAnchorKey,
  resolveSidebarPath,
} from "./hub-nav";

const SCOPE_STORAGE_KEY = 'mlp.scope';

// Scope lives in localStorage only — no server preference, no fetch (Phase A).
// If storage is unavailable we simply keep it in React state for the session.
function useScope(active) {
  const [scope, setScope] = React.useState(DEFAULT_SCOPE);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(SCOPE_STORAGE_KEY);
      if (stored) setScope(normalizeScope(stored));
    } catch { /* storage blocked — session-only scope */ }
  }, []);

  // Landing on a scoped route directly (bookmark, ⌘K, deep link) moves the
  // control to match what's on screen. Global routes leave it alone.
  React.useEffect(() => {
    const derived = deriveSidebarScope(active);
    if (derived) setScope((s) => (s === derived ? s : derived));
  }, [active]);

  const persist = React.useCallback((next) => {
    const value = normalizeScope(next);
    setScope(value);
    try { localStorage.setItem(SCOPE_STORAGE_KEY, value); } catch { /* ignore */ }
    return value;
  }, []);

  return [scope, persist];
}

// Best-effort count badges — fetched once on mount, never polled. Keyed by
// anchor key. Only data already served today; scope selection adds no request.
function useAnchorCounts() {
  const [counts, setCounts] = React.useState({});

  React.useEffect(() => {
    let active = true;

    fetch('/api/hub/followups', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        const items = Array.isArray(d?.items) ? d.items : [];
        // followups-ledger.js summary shape: { overdue, dueToday, total, shown }.
        const due = Number.isFinite(d?.summary?.dueToday) ? d.summary.dueToday : items.length;
        setCounts(c => ({ ...c, followups: due }));
      })
      .catch(() => {});

    return () => { active = false; };
  }, []);

  return counts;
}

function CountBadge({ n }) {
  if (!n) return null;
  return (
    <span className="mono" style={{
      fontSize: 10.5, lineHeight: 1, flexShrink: 0,
      color: 'var(--moon-300)',
      padding: '2px 5px', borderRadius: 999,
      border: '1px solid var(--line-soft)',
    }}>
      {n}
    </span>
  );
}

export function Sidebar({ active, view, onNavigate, collapsed, onToggleCollapse, openPalette, className }) {
  const counts = useAnchorCounts();
  const [scope, setScope] = useScope(active);

  const go = React.useCallback((anchorKey) => {
    const path = resolveSidebarPath(anchorKey, scope);
    if (path) onNavigate(path);
  }, [onNavigate, scope]);

  // Switching scope while standing on a scope-aware anchor re-enters the same
  // anchor in the new scope. On a global anchor (오늘 · AI · 설정) it only arms
  // the next scope-aware navigation.
  const changeScope = React.useCallback((next) => {
    const value = setScope(next);
    const owner = ownerAnchorKey(active);
    const anchor = [...SIDEBAR_PRIMARY, ...SIDEBAR_UTILITIES].find(a => a.key === owner);
    if (!anchor?.scopeAware) return;
    const target = resolveSidebarPath(owner, value);
    if (target) onNavigate(target);
  }, [active, onNavigate, setScope]);

  const anchorProps = (a) => ({
    type: 'button',
    onClick: () => go(a.key),
    'aria-current': isSidebarAnchorActive(a.key, active, view) ? 'page' : undefined,
  });

  if (collapsed) {
    return (
      <aside
        className={`${className || ''} hub-sidebar-root--collapsed`}
        aria-label="주요 메뉴"
        style={{
          width: 56, flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--line-soft)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '14px 0', gap: 4,
        }}
      >
        <button onClick={onToggleCollapse} title="Expand" aria-label="사이드바 펼치기" style={{
          width: 36, height: 36, borderRadius: 'var(--r-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--moon-200)', marginBottom: 8,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 999,
            background: 'radial-gradient(circle at 35% 30%, var(--moon-100), var(--moon-400) 60%, var(--moon-700))',
            boxShadow: '0 0 12px oklch(0.78 0.008 250 / 0.3)',
          }} />
        </button>
        {SIDEBAR_PRIMARY.map(a => {
          const act = isSidebarAnchorActive(a.key, active, view);
          return (
            <button key={a.key} {...anchorProps(a)} title={a.label} aria-label={a.label} style={{
              width: 36, height: 36, borderRadius: 'var(--r-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: act ? 'var(--fg)' : 'var(--fg-faint)',
              background: act ? 'var(--surface-3)' : 'transparent',
            }}>
              <Iconed name={a.icon} size={16} />
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {SIDEBAR_UTILITIES.map(a => {
          const act = isSidebarAnchorActive(a.key, active, view);
          return (
            <button key={a.key} {...anchorProps(a)} title={a.label} aria-label={a.label} style={{
              width: 36, height: 36, borderRadius: 'var(--r-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: act ? 'var(--fg)' : 'var(--fg-faint)',
              background: act ? 'var(--surface-3)' : 'transparent',
            }}>
              <Iconed name={a.icon} size={16} />
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className={className} aria-label="주요 메뉴" style={{
      width: 232, flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '1px solid var(--line-soft)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 999,
            background: 'radial-gradient(circle at 35% 30%, var(--moon-100), var(--moon-400) 60%, var(--moon-700))',
            boxShadow: '0 0 12px oklch(0.78 0.008 250 / 0.3), inset 0 -1px 2px oklch(0 0 0 / 0.5)',
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Moonlight</div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)', letterSpacing: '0.05em', marginTop: -1 }}>HUB · PRO</div>
          </div>
        </div>
        <IconButton icon="chevronL" onClick={onToggleCollapse} size={24} iconSize={13} tooltip="Collapse" />
      </div>

      <div style={{ padding: '4px 12px 8px' }}>
        <button onClick={openPalette} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          height: 30, padding: '0 10px',
          background: 'var(--surface-2)',
          border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-sm)',
          color: 'var(--fg-faint)', fontSize: 12,
        }}>
          <Iconed name="search" size={13} />
          <span style={{ flex: 1, textAlign: 'left' }}>Search · jump to</span>
          <Kbd>⌘</Kbd><Kbd>K</Kbd>
        </button>
      </div>

      {/* Scope replaces the old workspace trees: 소속은 여기서 한 번만 고른다. */}
      <div style={{ padding: '0 12px 10px' }}>
        <SegmentedControl
          label="작업 범위"
          fill
          options={SIDEBAR_SCOPES}
          value={scope}
          onChange={changeScope}
          style={{ width: '100%' }}
        />
      </div>

      <nav className="scroll-y" style={{ flex: 1, padding: '2px 8px 10px' }}>
        {SIDEBAR_PRIMARY.map(a => (
          <button key={a.key} {...anchorProps(a)} className="hub-nav-item">
            <Iconed name={a.icon} size={15} />
            <span style={{ flex: 1 }}>{a.label}</span>
            <CountBadge n={counts[a.key]} />
          </button>
        ))}
      </nav>

      <div style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)' }}>
        {SIDEBAR_UTILITIES.map(a => (
          <button key={a.key} {...anchorProps(a)} className="hub-nav-item hub-nav-item--sm">
            <Iconed name={a.icon} size={14} />
            <span style={{ flex: 1 }}>{a.label}</span>
          </button>
        ))}
      </div>

      <div style={{
        padding: '10px 12px', borderTop: '1px solid var(--line-soft)',
        display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <Avatar name="Hyeon Park" size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Hyeon Park</div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>Founder · Pro</div>
        </div>
        <IconButton icon="bell" size={24} iconSize={13} tooltip="Open Daily Brief" onClick={() => onNavigate('dashboard/daily-brief')} />
      </div>
    </aside>
  );
}

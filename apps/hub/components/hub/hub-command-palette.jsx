"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { Kbd } from "./hub-primitives";
import { NAV_TREE, LEGACY_TREE } from "./hub-data";

export function CommandPalette({ open, onClose, onNavigate }) {
  const [q, setQ] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);

  const items = React.useMemo(() => {
    const flat = [];
    for (const n of NAV_TREE) {
      if (n.path) flat.push({ kind: 'Navigate', label: n.label, path: n.path, icon: n.icon, keywords: n.keywords });
      if (n.children) for (const c of n.children) flat.push({ kind: 'Navigate', label: `${n.label} › ${c.label}`, path: c.path, icon: c.icon, keywords: c.keywords });
    }
    for (const c of LEGACY_TREE) flat.push({ kind: 'Archive', label: `기타 › ${c.label}`, path: c.path, icon: c.icon, keywords: c.keywords });
    flat.push({ kind: 'Action', label: 'New Decision 기록', path: 'dashboard/work/decisions?new=decision', icon: 'decisions' });
    flat.push({ kind: 'Action', label: 'New Project', path: 'dashboard/work/projects?new=project', icon: 'projects' });
    flat.push({ kind: 'Action', label: 'New Content draft', path: 'dashboard/content/studio?new=draft', icon: 'studio' });
    flat.push({ kind: 'Action', label: 'Start 15m focus timer', path: 'dashboard/work/calendar?focus=15', icon: 'clock' });
    flat.push({ kind: 'Action', label: 'Ask Council — next week plan', path: 'dashboard/agents/chat?prompt=next-week-plan', icon: 'council' });
    return flat;
  }, []);

  const filtered = React.useMemo(() => {
    if (!q) return items;
    const lc = q.toLowerCase();
    return items.filter(i => (i.label + ' ' + (i.keywords || []).join(' ')).toLowerCase().includes(lc));
  }, [q, items]);

  React.useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    setQ('');
    setIdx(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(focusTimer);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);
  React.useEffect(() => { setIdx(0); }, [q]);

  React.useEffect(() => {
    if (!open) return;
    dialogRef.current
      ?.querySelector(`[data-command-index="${idx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [idx, open, filtered.length]);

  if (!open) return null;

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => filtered.length ? Math.min(filtered.length - 1, i + 1) : 0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter') {
      const it = filtered[idx];
      if (it?.path) { onNavigate(it.path); onClose(); }
      else onClose();
    }
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 'var(--z-palette)',
      background: 'oklch(0 0 0 / 0.6)',
      backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', paddingTop: '12vh',
      animation: 'hubFadeIn var(--dur-overlay) ease-out',
    }}>
      {/* 오버레이는 페이드만, 패널이 §9 다이얼로그 윈도(160–200ms)로 상승 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="빠른 이동 및 실행"
        onKeyDown={handleDialogKeyDown}
        onClick={e => e.stopPropagation()}
        style={{
          width: 580, maxWidth: '90vw', maxHeight: '70vh',
          background: 'var(--elevated)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-pop)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'mlFadeUp var(--dur-panel) var(--ease-hub)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <Iconed name="search" size={15} style={{ color: 'var(--fg-faint)' }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
            aria-label="페이지와 작업 검색"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="hub-command-results"
            aria-expanded="true"
            aria-activedescendant={filtered[idx] ? `hub-command-option-${idx}` : undefined}
            placeholder="Search pages, actions…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 14 }} />
          <Kbd>esc</Kbd>
        </div>
        <div id="hub-command-results" role="listbox" className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>No results</div>
          )}
          {filtered.map((it, i) => (
            <button
              id={`hub-command-option-${i}`}
              data-command-index={i}
              role="option"
              aria-selected={idx === i}
              tabIndex={-1}
              key={i}
              onClick={() => { if (it.path) onNavigate(it.path); onClose(); }}
              onMouseEnter={() => setIdx(i)}
              style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 'var(--r-sm)',
              background: idx === i ? 'var(--surface-3)' : 'transparent',
              textAlign: 'left',
            }}>
              <Iconed name={it.icon} size={14} style={{ color: idx === i ? 'var(--fg)' : 'var(--fg-muted)' }} />
              <span style={{ flex: 1, fontSize: 13, color: idx === i ? 'var(--fg)' : 'var(--fg-muted)' }}>{it.label}</span>
              <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{it.kind}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--fg-faint)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>↑↓</Kbd> navigate</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>↵</Kbd> open</span>
          <div style={{ flex: 1 }} />
          <span>Moonlight Hub</span>
        </div>
      </div>
    </div>
  );
}

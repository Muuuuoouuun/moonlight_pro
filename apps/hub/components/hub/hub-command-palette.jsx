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
  const titleId = React.useId();
  const listId = React.useId();

  const items = React.useMemo(() => {
    const flat = [];
    for (const n of NAV_TREE) {
      if (n.path) flat.push({ kind: 'Navigate', label: n.label, path: n.path, icon: n.icon, keywords: n.keywords || [] });
      if (n.children) for (const c of n.children) flat.push({ kind: 'Navigate', label: `${n.label} › ${c.label}`, path: c.path, icon: c.icon, keywords: c.keywords || [] });
    }
    for (const c of LEGACY_TREE) flat.push({ kind: 'Archive', label: `기타 › ${c.label}`, path: c.path, icon: c.icon, keywords: c.keywords || [] });
    flat.push({ kind: 'Action', label: 'New Decision 기록', path: 'dashboard/work/decisions?new=decision', icon: 'decisions' });
    flat.push({ kind: 'Action', label: 'New Project', path: 'dashboard/work/projects?new=project', icon: 'projects' });
    flat.push({ kind: 'Action', label: 'New Deal', path: 'dashboard/classin/pipeline?new=deal', icon: 'deals', keywords: ['딜', 'deal', 'pipeline', 'kanban', 'crm'] });
    flat.push({ kind: 'Action', label: 'New Account', path: 'dashboard/classin/accounts?new=account', icon: 'accounts', keywords: ['고객', '계정', 'customer', 'account', 'crm'] });
    flat.push({ kind: 'Action', label: 'New Content draft', path: 'dashboard/content/studio?new=draft', icon: 'studio' });
    flat.push({ kind: 'Action', label: '고객 상태·기록 확인', path: 'dashboard/classin/accounts', icon: 'accounts', keywords: ['고객', '상태', '기록', '노트', 'memo', 'history', 'crm'] });
    flat.push({ kind: 'Action', label: 'Start 15m focus timer', path: 'dashboard/work/calendar?focus=15', icon: 'clock' });
    flat.push({ kind: 'Action', label: 'Ask Council — next week plan', path: 'dashboard/agents/chat?prompt=next-week-plan', icon: 'council' });
    flat.push({ kind: 'Action', label: 'Guru에게 물어보기', path: 'dashboard/agents/chat?agent=guru', icon: 'council', keywords: ['guru', '멘토', '코칭'] });
    flat.push({ kind: 'Action', label: '리드 인박스 열기', path: 'dashboard/classin/intake', icon: 'inbox', keywords: ['intake', 'inbox', '명함', '인박스'] });
    return flat;
  }, []);

  const filtered = React.useMemo(() => {
    if (!q) return items;
    const lc = q.toLowerCase();
    return items.filter(i =>
      i.label.toLowerCase().includes(lc) ||
      (i.keywords || []).some(k => k.toLowerCase().includes(lc))
    );
  }, [q, items]);

  const closePalette = React.useCallback(() => {
    onClose?.();
    setTimeout(() => previousFocusRef.current?.focus?.(), 0);
  }, [onClose]);

  React.useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);
  React.useEffect(() => { setIdx(0); }, [q]);

  if (!open) return null;

  const handleKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
    if (e.key === 'Tab') {
      const focusable = Array.from(dialogRef.current?.querySelectorAll([
        'a[href]',
        'button:not([disabled]):not([tabindex="-1"])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',')) || [])
        .filter(el => el instanceof HTMLElement && !el.hidden && el.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) { e.preventDefault(); inputRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (!filtered.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && e.target === inputRef.current) {
      const it = filtered[idx];
      if (it?.path) { onNavigate(it.path); closePalette(); }
      else closePalette();
    }
  };

  return (
    <div onClick={closePalette} onKeyDown={handleKey} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'oklch(0 0 0 / 0.6)',
      backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', paddingTop: '12vh',
      animation: 'mlFadeUp .15s ease-out',
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        style={{
        width: 580, maxWidth: '90vw', maxHeight: '70vh',
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <h2 id={titleId} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Command palette</h2>
          <Iconed name="search" size={15} style={{ color: 'var(--fg-faint)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search pages, actions…"
            role="combobox"
            aria-label="Search pages and actions"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={filtered[idx] ? `${listId}-${idx}` : undefined}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 14 }} />
          <Kbd>esc</Kbd>
        </div>
        <div id={listId} role="listbox" className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {filtered.length === 0 && (
            <div role="status" aria-live="polite" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>No results</div>
          )}
          {filtered.map((it, i) => (
            <button
              id={`${listId}-${i}`}
              key={i}
              role="option"
              aria-selected={idx === i}
              tabIndex={-1}
              onClick={() => { if (it.path) onNavigate(it.path); closePalette(); }}
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

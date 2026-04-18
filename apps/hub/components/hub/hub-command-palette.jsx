"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { Kbd } from "./hub-primitives";
import { NAV_TREE, LEGACY_TREE } from "./hub-data";

export function CommandPalette({ open, onClose, onNavigate }) {
  const [q, setQ] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef(null);

  const items = React.useMemo(() => {
    const flat = [];
    for (const n of NAV_TREE) {
      if (n.path) flat.push({ kind: 'Navigate', label: n.label, path: n.path, icon: n.icon });
      if (n.children) for (const c of n.children) flat.push({ kind: 'Navigate', label: `${n.label} › ${c.label}`, path: c.path, icon: c.icon });
    }
    for (const c of LEGACY_TREE) flat.push({ kind: 'Archive', label: `기타 › ${c.label}`, path: c.path, icon: c.icon });
    flat.push({ kind: 'Action', label: 'New Decision 기록', icon: 'decisions' });
    flat.push({ kind: 'Action', label: 'New Project', icon: 'projects' });
    flat.push({ kind: 'Action', label: 'New Content draft', icon: 'studio' });
    flat.push({ kind: 'Action', label: 'Start 15m focus timer', icon: 'clock' });
    flat.push({ kind: 'Action', label: 'Ask Council — next week plan', icon: 'council' });
    return flat;
  }, []);

  const filtered = React.useMemo(() => {
    if (!q) return items;
    const lc = q.toLowerCase();
    return items.filter(i => i.label.toLowerCase().includes(lc));
  }, [q, items]);

  React.useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);
  React.useEffect(() => { setIdx(0); }, [q]);

  if (!open) return null;

  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter') {
      const it = filtered[idx];
      if (it && (it.kind === 'Navigate' || it.kind === 'Archive')) { onNavigate(it.path); onClose(); }
      else onClose();
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'oklch(0 0 0 / 0.6)',
      backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', paddingTop: '12vh',
      animation: 'mlFadeUp .15s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 580, maxWidth: '90vw', maxHeight: '70vh',
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <Iconed name="search" size={15} style={{ color: 'var(--fg-faint)' }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
            placeholder="Search pages, actions…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 14 }} />
          <Kbd>esc</Kbd>
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>No results</div>
          )}
          {filtered.map((it, i) => (
            <button key={i} onClick={() => { if (it.kind === 'Navigate' || it.kind === 'Archive') onNavigate(it.path); onClose(); }} onMouseEnter={() => setIdx(i)} style={{
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

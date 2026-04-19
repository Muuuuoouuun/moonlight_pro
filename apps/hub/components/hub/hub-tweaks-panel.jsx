"use client";

import { IconButton } from "./hub-primitives";

export function TweaksPanel({ open, onClose, density, onDensity }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 90,
      width: 260,
      background: 'var(--surface-2)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-pop)',
      overflow: 'hidden',
      animation: 'mlFadeUp .18s ease-out',
    }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', flex: 1 }}>Tweaks</div>
        <IconButton icon="x" size={22} iconSize={12} onClick={onClose} />
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-faint)', marginBottom: 8 }}>Density</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {['compact','default','relaxed'].map(d => (
            <button key={d} onClick={() => onDensity(d)} style={{
              padding: '8px 0', fontSize: 11.5, fontWeight: 500,
              color: density === d ? 'var(--fg)' : 'var(--fg-muted)',
              background: density === d ? 'var(--surface-3)' : 'var(--surface)',
              border: `1px solid ${density === d ? 'var(--moon-600)' : 'var(--line-soft)'}`,
              borderRadius: 'var(--r-sm)', textTransform: 'capitalize',
            }}>{d}</button>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-faint)', lineHeight: 1.5 }}>
          Row height, padding, and gap change globally.
        </div>
      </div>
    </div>
  );
}

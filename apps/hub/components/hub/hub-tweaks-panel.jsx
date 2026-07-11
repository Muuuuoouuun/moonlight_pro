"use client";

import React from "react";
import { IconButton } from "./hub-primitives";

export function TweaksPanel({ open, onClose, density, onDensity }) {
  const panelRef = React.useRef(null);

  // ESC closes the panel.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Click outside closes the panel. Arm on the next frame so the same click that
  // opened the panel (mousedown on the topbar gear, fired before mount) can't leak
  // into this handler and immediately close it.
  React.useEffect(() => {
    if (!open) return;
    let armed = false;
    const raf = requestAnimationFrame(() => { armed = true; });
    const onDown = (e) => {
      if (!armed) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={panelRef} style={{
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

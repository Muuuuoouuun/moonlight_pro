"use client";

import React from "react";
import { Iconed } from "./hub-icons";

export function Badge({ children, tone = 'neutral', variant = 'soft', size = 'sm', numeric = false, style }) {
  const tones = {
    neutral: { fg: 'var(--moon-200)', bg: 'oklch(0.30 0.008 250 / 0.5)', bd: 'var(--line)' },
    moon:    { fg: 'var(--moon-100)', bg: 'oklch(0.40 0.008 250 / 0.25)', bd: 'var(--moon-600)' },
    success: { fg: 'var(--success)', bg: 'var(--success-bg)', bd: 'oklch(0.5 0.08 155 / 0.4)' },
    warning: { fg: 'var(--warning)', bg: 'var(--warning-bg)', bd: 'oklch(0.5 0.09 85 / 0.4)' },
    danger:  { fg: 'var(--danger)', bg: 'var(--danger-bg)', bd: 'oklch(0.5 0.1 25 / 0.4)' },
    info:    { fg: 'var(--info)', bg: 'var(--info-bg)', bd: 'oklch(0.5 0.06 230 / 0.4)' },
    personal:{ fg: 'var(--personal)', bg: 'var(--personal-bg)', bd: 'oklch(0.5 0.04 200 / 0.45)' },
    company: { fg: 'var(--company)', bg: 'var(--company-bg)', bd: 'oklch(0.5 0.04 290 / 0.45)' },
  };
  const t = tones[tone] || tones.neutral;
  const pad = size === 'xs' ? '2px 6px' : size === 'sm' ? '3px 8px' : '5px 10px';
  const fs = size === 'xs' ? 10 : 11;
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: pad, fontSize: fs, fontWeight: 500, letterSpacing: '0.02em',
    borderRadius: 999, lineHeight: 1, whiteSpace: 'nowrap',
    ...(numeric && { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }),
  };
  if (variant === 'outline') {
    return <span style={{ ...base, color: t.fg, border: `1px solid ${t.bd}`, background: 'transparent', ...style }}>{children}</span>;
  }
  return <span style={{ ...base, color: t.fg, background: t.bg, border: `1px solid ${t.bd}`, ...style }}>{children}</span>;
}

export function Dot({ tone = 'neutral', size = 6, style }) {
  const map = {
    neutral: 'var(--moon-500)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
    moon: 'var(--moon-300)',
    personal: 'var(--personal)',
    company: 'var(--company)',
  };
  return <span style={{ width: size, height: size, borderRadius: 999, background: map[tone], display: 'inline-block', ...style }} />;
}

export function Kbd({ children, style }) {
  return (
    <kbd className="mono" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 5px',
      fontSize: 10.5, fontWeight: 500,
      color: 'var(--moon-300)',
      background: 'oklch(0.28 0.008 250 / 0.6)',
      border: '1px solid var(--line)',
      borderRadius: 4,
      boxShadow: '0 1px 0 0 oklch(0 0 0 / 0.3)',
      ...style,
    }}>{children}</kbd>
  );
}

export function Card({ children, style, pad = true, interactive = false, className, ...props }) {
  return (
    <div {...props} className={className} style={{
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-card)',
      padding: pad ? 'var(--card-pad)' : 0,
      transition: 'border-color .15s ease, transform .15s ease',
      ...(interactive && { cursor: 'pointer' }),
      ...style,
    }}>{children}</div>
  );
}

export function SectionTitle({ children, right, style, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'var(--gap)', ...style }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-dim)', fontWeight: 500 }}>{children}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, description, action, style }) {
  return (
    <div data-empty="true" style={{
      minHeight: 180,
      padding: '32px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      textAlign: 'center',
      color: 'var(--fg-muted)',
      ...style,
    }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 'var(--r-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-2)',
        border: '1px solid var(--line-soft)',
        color: 'var(--fg-faint)',
      }}>
        <Iconed name={icon} size={16} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--fg-faint)', maxWidth: 360 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

export function Button({ children, variant = 'ghost', size = 'sm', icon, iconRight, style, onClick, active, type = 'button', className, disabled = false, ...props }) {
  const sizes = {
    xs: { h: 24, px: 8, fs: 12, gap: 5 },
    sm: { h: 30, px: 11, fs: 12.5, gap: 6 },
    md: { h: 34, px: 14, fs: 13, gap: 7 },
  };
  const s = sizes[size];
  const variants = {
    primary: {
      color: 'var(--bg)',
      background: 'var(--moon-200)',
      border: '1px solid var(--moon-100)',
      boxShadow: '0 1px 0 0 oklch(1 0 0 / 0.2) inset, 0 2px 8px -2px oklch(0 0 0 / 0.3)',
    },
    secondary: {
      color: 'var(--fg)',
      background: 'var(--surface-3)',
      border: '1px solid var(--line)',
    },
    ghost: {
      color: 'var(--fg-muted)',
      background: active ? 'var(--surface-2)' : 'transparent',
      border: `1px solid ${active ? 'var(--line)' : 'transparent'}`,
    },
    outline: {
      color: 'var(--fg)',
      background: 'transparent',
      border: '1px solid var(--line)',
    },
    danger: {
      color: 'var(--danger)',
      background: 'var(--danger-bg)',
      border: '1px solid oklch(0.5 0.1 25 / 0.4)',
    },
  };
  const v = variants[variant];
  return (
    <button {...props} type={type} className={className} onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs, fontWeight: 500,
      borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap', transition: 'all .12s ease',
      ...v, ...style,
      ...(disabled && { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' }),
    }}>
      {icon && <Iconed name={icon} size={14} />}
      {children}
      {iconRight && <Iconed name={iconRight} size={14} />}
    </button>
  );
}

export function IconButton({ icon, onClick, size = 28, iconSize = 14, tone, tooltip, style, className, disabled = false }) {
  return (
    <button className={className} onClick={onClick} disabled={disabled} title={tooltip} aria-label={tooltip} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size,
      color: tone === 'danger' ? 'var(--danger)' : 'var(--fg-muted)',
      background: 'transparent',
      border: '1px solid transparent',
      borderRadius: 'var(--r-sm)',
      transition: 'all .12s ease',
      ...style,
      ...(disabled && { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' }),
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.borderColor = 'var(--line-soft)'; e.currentTarget.style.color = 'var(--fg)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = tone === 'danger' ? 'var(--danger)' : 'var(--fg-muted)'; }}
    >
      <Iconed name={icon} size={iconSize} />
    </button>
  );
}

export function Avatar({ name, size = 24, tone = 'moon' }) {
  const initials = (name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const toneMap = {
    moon:   { bg: 'oklch(0.35 0.008 250)', fg: 'var(--moon-100)' },
    personal: { bg: 'var(--personal-bg)', fg: 'var(--personal)' },
    company:  { bg: 'var(--company-bg)', fg: 'var(--company)' },
    amber:  { bg: 'oklch(0.32 0.06 85 / 0.4)', fg: 'var(--warning)' },
    green:  { bg: 'oklch(0.32 0.05 155 / 0.4)', fg: 'var(--success)' },
    info:   { bg: 'var(--info-bg)', fg: 'var(--info)' },
    neutral:{ bg: 'var(--surface-3)', fg: 'var(--fg-muted)' },
  };
  const t = toneMap[tone] || toneMap.moon;
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: t.bg, color: t.fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 600, letterSpacing: '0.02em',
      border: '1px solid var(--line-soft)',
      flexShrink: 0,
    }}>{initials}</div>
  );
}

export function Progress({ value = 0, tone = 'moon', height = 4 }) {
  const map = { moon: 'var(--moon-300)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };
  return (
    <div style={{ height, background: 'oklch(0.28 0.008 250 / 0.6)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: map[tone], borderRadius: 999, transition: 'width .3s ease' }} />
    </div>
  );
}

export function Sparkline({ values, width = 60, height = 18, tone = 'moon' }) {
  if (!values || !values.length) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(' ');
  const colors = { moon: 'var(--moon-300)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={colors[tone]} strokeWidth="1.2" />
    </svg>
  );
}

export function Divider({ style }) {
  return <div style={{ height: 1, background: 'var(--line-soft)', ...style }} />;
}

export function Tabs({ tabs, active, onChange, style, ariaLabel, className }) {
  return (
    <div className={className} role="tablist" aria-label={ariaLabel} style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line-soft)', ...style }}>
      {tabs.map(t => {
        const isActive = t.key === active;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={isActive} onClick={() => onChange?.(t.key)} style={{
            padding: '8px 12px', fontSize: 12.5, fontWeight: 500,
            color: isActive ? 'var(--fg)' : 'var(--fg-dim)',
            borderBottom: `1px solid ${isActive ? 'var(--moon-200)' : 'transparent'}`,
            marginBottom: -1,
            transition: 'color .12s ease',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count != null && (
              <span className="mono" style={{
                fontSize: 10.5, color: 'var(--fg-faint)',
                padding: '1px 5px', borderRadius: 4,
                background: 'oklch(0.28 0.008 250 / 0.5)',
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// `label` names the checkbox for screen readers (the visual label usually sits in a
// sibling cell, so SRs would otherwise announce an unnamed 14px button). Always pass it
// on new call sites — e.g. the row's title.
export function Checkbox({ checked, onChange, size = 14, label }) {
  return (
    <button
      role="checkbox"
      aria-checked={Boolean(checked)}
      aria-label={label || '선택'}
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked); }} style={{
      width: size, height: size, borderRadius: 4,
      border: `1px solid ${checked ? 'var(--moon-300)' : 'var(--line-strong)'}`,
      background: checked ? 'var(--moon-300)' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all .12s ease', flexShrink: 0,
    }}>
      {checked && <Iconed name="check" size={size - 4} style={{ color: 'var(--bg)', strokeWidth: 3 }} />}
    </button>
  );
}

export const Input = React.forwardRef(function Input({ placeholder, icon, value, onChange, style, size = 'sm', className }, ref) {
  const sizes = { sm: { h: 30, fs: 12.5 }, md: { h: 34, fs: 13 } };
  const s = sizes[size];
  return (
    <div className={`hub-field${className ? ` ${className}` : ''}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      height: s.h, padding: '0 10px',
      background: 'var(--surface-2)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-sm)',
      transition: 'border-color .15s ease',
      ...style,
    }}>
      {icon && <Iconed name={icon} size={13} style={{ color: 'var(--fg-faint)' }} />}
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0,
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--fg)', fontSize: s.fs,
        }}
      />
    </div>
  );
});

export function Placeholder({ label = 'image', w, h, style }) {
  return (
    <div style={{
      position: 'relative',
      width: w, height: h,
      background: 'repeating-linear-gradient(135deg, oklch(0.22 0.006 250), oklch(0.22 0.006 250) 4px, oklch(0.25 0.007 250) 4px, oklch(0.25 0.007 250) 8px)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-sm)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}

// Canonical live/preview status indicator for page headers. `state` accepts:
// 'live' (success), 'syncing' | 'loading' (info), 'preview' (neutral),
// and 'error' (danger). mono label, xs
// outline Badge, marginLeft 8.
export function SyncBadge({ state, style }) {
  const map = {
    live:    { tone: 'success', label: 'live' },
    syncing: { tone: 'info',    label: 'syncing' },
    loading: { tone: 'info',    label: 'syncing' },
    preview: { tone: 'neutral', label: 'preview' },
    error:   { tone: 'danger',  label: 'error' },
  };
  const m = map[state] || map.preview;
  // NOTE: this branch's Badge forwards `style` but not `className`, so the full `.mono`
  // treatment (font + 'ss02' feature + tightened tracking) is applied inline.
  return (
    <Badge
      tone={m.tone}
      size="xs"
      variant="outline"
      style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontFeatureSettings: "'ss02'", letterSpacing: 0, ...style }}
    >
      {m.label}
    </Badge>
  );
}

// Canonical pill-group toolbar (type / status / view filters). `options`: [{ key, label,
// dot?: tone string, count?: number }]. Call sites keep any bespoke onChange side effects
// by handling that logic inside their onChange.
// `label` names the group for screen readers; `fill` spreads the segments across the
// available width (segments stay side-by-side on mobile — never stacked).
export function SegmentedControl({ options, value, onChange, className, style, label, fill }) {
  return (
    <div
      className={className}
      role="group"
      aria-label={label}
      style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2, ...style }}
    >
      {options.map(o => {
        const isActive = o.key === value;
        return (
          <button key={o.key} type="button" onClick={() => onChange?.(o.key)} aria-pressed={isActive} style={{
            padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
            color: isActive ? 'var(--fg)' : 'var(--fg-faint)',
            background: isActive ? 'var(--surface-3)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: fill ? 'center' : undefined, gap: 5,
            flex: fill ? '1 1 0' : undefined, minWidth: fill ? 0 : undefined,
          }}>
            {o.dot && <Dot tone={o.dot} />}
            {o.label}
            {o.count != null && <span className="mono" style={{ fontSize: 10 }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

const DRAWER_INPUT_STYLE = {
  height: 32,
  padding: '0 10px',
  fontSize: 13,
  background: 'var(--surface-2)',
  color: 'var(--fg)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-sm)',
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
};

// Elements the drawer's focus manager treats as tab stops.
const DRAWER_FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

// Shared right-side drawer shell: overlay + aside + header (title/subtitle/close) +
// scrollable body + optional footer bar. Owns ESC-to-close, focus-in-on-mount +
// focus-restore-on-unmount, and a light Tab focus trap — not field rendering or
// save/delete semantics. EditDrawer and the Guru diagnosis drawer compose on top.
export function Drawer({ title, subtitle, onClose, footer, footerStyle, width = 'min(380px, 92vw)', borderLeft = 'var(--line)', children }) {
  const asideRef = React.useRef(null);
  const bodyRef = React.useRef(null);

  // ESC anywhere closes the drawer.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus the first field on mount; restore focus to the opener on unmount.
  React.useEffect(() => {
    const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;
    const raf = requestAnimationFrame(() => {
      const scope = bodyRef.current || asideRef.current;
      const first = scope?.querySelector(DRAWER_FOCUSABLE);
      if (first && typeof first.focus === 'function') first.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, []);

  // Light focus trap: keep Tab inside the drawer, wrapping first↔last.
  const handleKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const root = asideRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll(DRAWER_FOCUSABLE)).filter(el => !el.disabled && el.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      <div className="hub-drawer-overlay" aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.4)', zIndex: 60 }} />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onKeyDown={handleKeyDown}
        className="hub-drawer"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width, zIndex: 61,
          background: 'var(--surface)', borderLeft: `1px solid ${borderLeft}`,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 32px -12px oklch(0 0 0 / 0.5)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <IconButton icon="x" size={24} iconSize={13} tooltip="닫기" onClick={onClose} />
        </div>
        <div ref={bodyRef} className="scroll-y" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: 12, borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10, ...footerStyle }}>
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}

// Shared field-driven edit drawer. Revenue behavior is canonical for save feedback,
// ESC close, and optimistic delete confirmation. Composes on top of Drawer for the shell.
// Cmd/Ctrl+Enter mirrors the footer 완료 (save) button.
export function EditDrawer({ title, subtitle, record, fields, onChange, onClose, onSave, onDelete, width = 'min(380px, 92vw)', children }) {
  const [saveState, setSaveState] = React.useState('idle'); // idle | saving | preview | error
  React.useEffect(() => { setSaveState('idle'); }, [record?.id]);

  const handleDone = async () => {
    if (!onSave) { onClose(); return; }
    setSaveState('saving');
    const r = await onSave();
    if (r?.ok) { setSaveState('idle'); onClose(); }
    else { setSaveState(r?.status === 'preview' ? 'preview' : 'error'); }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (typeof window !== 'undefined' && !window.confirm('이 항목을 삭제할까요? 되돌릴 수 없습니다.')) return;
    setSaveState('saving');
    await onDelete();
    onClose();
  };

  // Cmd/Ctrl+Enter saves. A ref keeps the window listener pointed at the latest
  // handler without re-binding every render.
  const handleDoneRef = React.useRef(handleDone);
  handleDoneRef.current = handleDone;
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleDoneRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!record) return null;
  return (
    <Drawer
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width={width}
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saveState === 'saving'} style={{ color: 'var(--danger)' }}>삭제</Button>
          )}
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.4 }}>
            {saveState === 'preview' && (
              <span style={{ color: 'var(--fg-muted)' }}>저장 위치(Supabase)가 설정되지 않아 로컬에만 반영됩니다.</span>
            )}
            {saveState === 'error' && (
              <span style={{ color: 'var(--danger)' }}>저장에 실패했습니다. 다시 시도하세요.</span>
            )}
          </div>
          {(saveState === 'preview' || saveState === 'error') && (
            <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
          )}
          <Button variant="primary" size="sm" onClick={handleDone} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? '저장 중…' : '완료'}
          </Button>
        </>
      }
    >
      {fields.map(f => (
        <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>{f.label}</span>
          {f.type === 'select' ? (
            <select value={record[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)} style={DRAWER_INPUT_STYLE}>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type={f.inputType || 'text'}
              value={record[f.key] ?? ''}
              placeholder={f.placeholder || ''}
              onChange={e => onChange(f.key, f.inputType === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)}
              style={DRAWER_INPUT_STYLE}
            />
          )}
        </label>
      ))}
      {children}
    </Drawer>
  );
}

// Horizontal-scroll wrapper for multi-column kanban strips (Deals, task board, 내 작업).
// Renders an edge fade + chevron on whichever side still has hidden columns, so a 6-stage
// pipeline doesn't read as "only 4 stages" when the rest is off-screen with no visual cue.
// Recomputes on scroll and on resize (column count can change with the workspace filter).
export function ScrollShadowX({ children, className, style }) {
  const ref = React.useRef(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  React.useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, ...style }}>
      <div ref={ref} className={`hub-scroll-x${className ? ` ${className}` : ''}`} onScroll={measure} style={{ display: 'flex', gap: 'var(--gap)', overflowX: 'auto', height: '100%', paddingBottom: 4 }}>
        {children}
      </div>
      {edges.left && (
        <div className="hub-scroll-edge hub-scroll-edge--left" aria-hidden="true">
          <Iconed name="chevronL" size={12} />
        </div>
      )}
      {edges.right && (
        <div className="hub-scroll-edge hub-scroll-edge--right" aria-hidden="true">
          <Iconed name="chevronR" size={12} />
        </div>
      )}
    </div>
  );
}

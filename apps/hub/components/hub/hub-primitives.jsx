"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { isTopEscLayer, popEscLayer, pushEscLayer } from "./esc-layers";
import './hub-compact-drawer.css';
import './hub-edit-drawer.css';
export { useToast, ToastProvider } from './hub-toast';

export function Badge({ children, tone = 'neutral', variant = 'soft', size = 'sm', numeric = false, style }) {
  const tones = {
    neutral: { fg: 'var(--moon-200)', bg: 'var(--surface-3)', bd: 'var(--line)' },
    moon:    { fg: 'var(--moon-100)', bg: 'var(--moon-bg)', bd: 'var(--moon-600)' },
    success: { fg: 'var(--success)', bg: 'var(--success-bg)', bd: 'var(--success-line)' },
    warning: { fg: 'var(--warning)', bg: 'var(--warning-bg)', bd: 'var(--warning-line)' },
    danger:  { fg: 'var(--danger)', bg: 'var(--danger-bg)', bd: 'var(--danger-line)' },
    info:    { fg: 'var(--info)', bg: 'var(--info-bg)', bd: 'var(--info-line)' },
    personal:{ fg: 'var(--personal)', bg: 'var(--personal-bg)', bd: 'var(--personal-line)' },
    company: { fg: 'var(--company)', bg: 'var(--company-bg)', bd: 'var(--company-line)' },
  };
  const t = tones[tone] || tones.neutral;
  const pad = size === 'xs' ? '2px 6px' : size === 'sm' ? '3px 8px' : '5px 10px';
  // 상태 플래그는 보조 메타 — DESIGN.md 크기 플로어(≥10.5px)에 맞춘다.
  const fs = size === 'xs' ? 10.5 : 11;
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
      background: 'var(--surface-2)',
      border: '1px solid var(--line)',
      borderRadius: 4,
      boxShadow: '0 1px 0 0 oklch(0 0 0 / 0.3)',
      ...style,
    }}>{children}</kbd>
  );
}

export function Card({ children, style, pad = true, interactive = false, className, ...props }) {
  // interactive면 .hub-card-link가 border+hover(색·-1px rise)를 소유 — 인라인 border를
  // 넣으면 CSS hover가 지므로 클래스 쪽에 맡긴다.
  const cls = [interactive ? 'hub-card-link' : '', className || ''].filter(Boolean).join(' ') || undefined;
  return (
    <div {...props} className={cls} style={{
      background: 'var(--surface)',
      ...(interactive ? {} : { border: '1px solid var(--line-soft)' }),
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-card)',
      padding: pad ? 'var(--card-pad)' : 0,
      ...(interactive && { cursor: 'pointer' }),
      ...style,
    }}>{children}</div>
  );
}

export function SectionTitle({ children, right, style, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'var(--gap)', ...style }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-dim)', fontWeight: 500 }}>{children}</h3>
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

// Button hover is CSS-owned (DESIGN.md §8.1 "Hover" — no JS onMouseEnter/Leave, no
// per-page re-implementation). That forces the resting variant chrome into the
// stylesheet as well: an inline `background` / `border` / `color` outranks every class
// rule, so `.hub-btn--primary:hover { … }` could never win while the resting value sat
// on the element — which is exactly why the transition declared here since 2026-07
// never fired. Same lesson `Card` already records above for `.hub-card-link`.
// `.hub-btn` + `.hub-btn--<variant>` (hub-tokens.css) own colour, border, radius and
// motion; only size/layout, the caller's own `style`, and the disabled state stay inline.
export const Button = React.forwardRef(function Button({ children, variant = 'ghost', size = 'sm', icon, iconRight, style, onClick, active, type = 'button', className, disabled = false, ...props }, ref) {
  const sizes = {
    xs: { h: 24, px: 8, fs: 12, gap: 5 },
    sm: { h: 30, px: 11, fs: 12.5, gap: 6 },
    md: { h: 34, px: 14, fs: 13, gap: 7 },
  };
  const s = sizes[size];
  // 호출처 className은 합성한다 — 덮어쓰면 .hub-row·.hub-topbar__primary-action 같은
  // 레이아웃 클래스가 조용히 사라진다.
  const cls = ['hub-btn', `hub-btn--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button {...props} ref={ref} type={type} className={cls} data-active={active ? 'true' : undefined} onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs, fontWeight: 500,
      whiteSpace: 'nowrap',
      // radius는 인라인으로 남긴다 — hover 전이 대상이 아니라 CSS 소유일 이유가 없고,
      // IconButton과 같은 방식이다. (한때 `.hub-app :focus-visible`이 border-radius를 덮어
      // CSS 소유 radius가 포커스 순간 2px로 튀었다 — 그 전역 덮어쓰기는 2026-09-16에 제거됐고
      // focus-ring.test.mjs가 재발을 막는다.)
      borderRadius: 'var(--r-sm)',
      ...style,
      ...(disabled && { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' }),
    }}>
      {icon && <Iconed name={icon} size={14} />}
      {children}
      {iconRight && <Iconed name={iconRight} size={14} />}
    </button>
  );
});

export const IconButton = React.forwardRef(function IconButton({ icon, onClick, size = 28, iconSize = 14, tone, tooltip, style, className, disabled = false, ...props }, ref) {
  const toneCls = tone === 'danger' ? ' hub-iconbtn--danger' : '';
  return (
    <button {...props} ref={ref} type="button" className={`hub-iconbtn${toneCls}${className ? ` ${className}` : ''}`} onClick={onClick} disabled={disabled} title={tooltip} aria-label={props['aria-label'] || tooltip} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size,
      borderRadius: 'var(--r-sm)',
      ...style,
      ...(disabled && { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' }),
    }}>
      <Iconed name={icon} size={iconSize} />
    </button>
  );
});

export function Avatar({ name, size = 24, tone = 'moon' }) {
  const initials = (name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const toneMap = {
    moon:   { bg: 'var(--moon-bg)', fg: 'var(--moon-100)' },
    personal: { bg: 'var(--personal-bg)', fg: 'var(--personal)' },
    company:  { bg: 'var(--company-bg)', fg: 'var(--company)' },
    amber:  { bg: 'var(--warning-bg)', fg: 'var(--warning)' },
    green:  { bg: 'var(--success-bg)', fg: 'var(--success)' },
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

export function Progress({ value = 0, tone = 'moon', height = 4, className = '', style, title }) {
  const map = { moon: 'var(--moon-300)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };
  const numValue = Number.isFinite(value) ? value : 0;
  const isCompleted = numValue >= 100;
  const isOverachieved = numValue > 100;
  const widthPercent = Math.min(100, Math.max(0, numValue));
  const completedCls = isCompleted ? ' hub-progress--completed' : '';
  const overachievedCls = isOverachieved ? ' hub-progress--overachieved' : '';

  const defaultTitle = isOverachieved
    ? `${numValue}% (+${Math.round(numValue - 100)}% 초과 달성 ✦)`
    : isCompleted
    ? `${numValue}% (목표 100% 달성 ✦)`
    : `${numValue}%`;
  const computedTitle = title !== undefined ? title : defaultTitle;

  return (
    <div
      role="progressbar"
      aria-valuenow={numValue}
      aria-valuemin={0}
      aria-valuemax={100}
      title={computedTitle}
      className={`hub-progress-track${completedCls}${overachievedCls}${className ? ` ${className}` : ''}`}
      style={{ height, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden', ...style }}
    >
      <div
        className="hub-progress-bar"
        style={{
          width: `${widthPercent}%`,
          height: '100%',
          background: map[tone] || map.moon,
          borderRadius: 999,
          transition: 'width var(--dur-enter) var(--ease-hub)',
        }}
      />
    </div>
  );
}

export function ProgressRing({
  value = 0,
  size = 36,
  strokeWidth = 3,
  tone = 'moon',
  showLabel = false,
  labelFormat,
  className = '',
  style,
  title,
}) {
  const map = {
    moon: 'var(--moon-300)',
    accent: 'var(--accent)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
  };
  const numValue = Number.isFinite(value) ? value : 0;
  const clamped = Math.min(100, Math.max(0, numValue));
  const isCompleted = clamped >= 100;
  const isOverachieved = numValue > 100;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor = isCompleted
    ? 'var(--moon-200)'
    : (map[tone] || map.moon);

  const defaultTitle = isOverachieved
    ? `${numValue}% (+${Math.round(numValue - 100)}% 초과 달성 ✦)`
    : isCompleted
    ? `${clamped}% (목표 100% 달성 ✦)`
    : `${clamped}%`;
  const computedTitle = title !== undefined ? title : defaultTitle;
  const formattedLabel = labelFormat ? labelFormat(clamped) : `${clamped}%`;

  const completedCls = isCompleted ? ' hub-progress-ring--completed' : '';
  const overachievedCls = isOverachieved ? ' hub-progress-ring--overachieved' : '';

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={isOverachieved ? `${numValue}% 달성, 목표보다 ${Math.round(numValue - 100)}% 초과` : undefined}
      title={computedTitle}
      className={`hub-progress-ring${completedCls}${overachievedCls}${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={strokeWidth}
        />
        <circle
          className="hub-progress-ring__circle"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset var(--dur-enter) var(--ease-hub), stroke var(--dur-enter) var(--ease-hub)',
          }}
        />
      </svg>
      {showLabel && (
        <span
          className="hub-progress-ring__label mono"
          style={{
            position: 'absolute',
            fontSize: Math.max(12, Math.round(size * 0.28)),
            color: isCompleted ? 'var(--moon-100)' : 'var(--fg-muted)',
            fontWeight: 600,
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {isCompleted ? '✦' : formattedLabel}
        </span>
      )}
    </div>
  );
}

// `min`/`max`로 고정 척도를 줄 수 있다(예: 에너지 1~5 — 값 범위로 늘리면 3→4가 바닥→천장처럼 보인다).
// `label`이 있으면 스크린리더에 추이를 말하고, 없으면 장식으로 숨긴다.
export function Sparkline({ values, width = 60, height = 18, tone = 'moon', min: fixedMin, max: fixedMax, label }) {
  if (!values || !values.length) return null;
  const max = Number.isFinite(fixedMax) ? fixedMax : Math.max(...values);
  const min = Number.isFinite(fixedMin) ? fixedMin : Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(' ');
  const colors = { moon: 'var(--moon-300)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };
  return (
    <svg width={width} height={height} style={{ display: 'block' }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
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
                background: 'var(--surface-3)',
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
export function Checkbox({ checked, onChange, size = 14, label, disabled = false, className = '', style }) {
  const isChecked = Boolean(checked);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-label={label || '선택'}
      aria-busy={disabled ? 'true' : undefined}
      disabled={disabled}
      className={`hub-checkbox${isChecked ? ' hub-checkbox--checked' : ''}${className ? ` ${className}` : ''}`}
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked, e); }}
      // 전이(transition)는 인라인이 아니라 `.hub-app .hub-checkbox`(hub-tokens.css)가 소유한다 —
      // 인라인 값은 클래스 규칙을 이긴다(§15 2026-09-15와 같은 이유).
      style={{
        position: 'relative',
        width: size, height: size, borderRadius: 4,
        border: `1px solid ${isChecked ? 'var(--moon-300)' : 'var(--line-strong)'}`,
        background: isChecked ? 'var(--moon-300)' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {isChecked && (
        <span className="hub-checkbox__icon" aria-hidden="true">
          <Iconed name="check" size={size - 4} style={{ color: 'var(--bg)', strokeWidth: 3 }} />
        </span>
      )}
    </button>
  );
}

export const Input = React.forwardRef(function Input({ placeholder, icon, value, onChange, style, size = 'sm', className,
  // 통과 속성: 로그인(비밀번호)·폼 접근성에 필요하다. 기존 호출처는 전부 기본값을 쓰므로 동작이 바뀌지 않는다.
  type = 'text', id, name, disabled, autoComplete, inputMode, maxLength, readOnly, required, ariaLabel,
  clearable = false, onClear, kbd, prefix, suffix, showCount = false, onKeyDown, ...props }, ref) {
  const sizes = {
    xs: { h: 24, fs: 11.5, px: 7, gap: 5 },
    sm: { h: 30, fs: 12.5, px: 10, gap: 8 },
    md: { h: 36, fs: 13.5, px: 12, gap: 8 },
    lg: { h: 42, fs: 14.5, px: 14, gap: 10 },
  };
  const s = sizes[size] || sizes.sm;
  const hasValue = value != null && String(value).length > 0;
  const currentLength = hasValue ? String(value).length : 0;

  // 호출처 onKeyDown을 먼저 부르고, 그쪽이 preventDefault하지 않았을 때만 ESC 지우기를 수행한다.
  // (예전에는 {...props}가 이 핸들러 뒤에 펼쳐져, onKeyDown을 넘기는 순간 ESC 지우기가 조용히 꺼졌다.)
  const handleKeyDown = (e) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && (clearable || onClear) && hasValue) {
      e.preventDefault();
      e.stopPropagation();
      onChange?.('');
      onClear?.();
    }
  };

  return (
    <div
      className={`hub-field hub-field--${size}${className ? ` ${className}` : ''}`}
      data-disabled={disabled ? 'true' : undefined}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        gap: s.gap,
        ...style,
      }}
    >
      {prefix}
      {icon && <Iconed name={icon} size={size === 'xs' ? 11 : 13} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} />}
      <input
        ref={ref}
        type={type}
        id={id}
        name={name}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        readOnly={readOnly}
        required={required}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0,
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--fg)', fontSize: s.fs,
        }}
        {...props}
      />
      {showCount && maxLength != null && (
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            flexShrink: 0,
            color: currentLength >= maxLength ? 'var(--danger)' : currentLength >= maxLength * 0.9 ? 'var(--warning)' : 'var(--fg-faint)',
          }}
        >
          {currentLength}/{maxLength}
        </span>
      )}
      {(clearable || onClear) && hasValue && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="입력 지우기"
          onClick={(e) => {
            e.stopPropagation();
            onChange?.('');
            onClear?.();
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: size === 'xs' ? 14 : 16, height: size === 'xs' ? 14 : 16, borderRadius: 999,
            background: 'var(--surface-3)', color: 'var(--fg-dim)',
            border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Iconed name="x" size={size === 'xs' ? 8 : 9} />
        </button>
      )}
      {kbd && !hasValue && (
        // 글자 크기는 Kbd 기본값(10.5px, §8.1 보조 메타 플로어)을 그대로 쓴다 — 14px 줄 상자가 1px 보더 안에 들어가도록 높이 16.
        <Kbd style={{ minWidth: 16, height: 16, padding: '0 3px', lineHeight: '14px', flexShrink: 0 }}>{kbd}</Kbd>
      )}
      {suffix}
    </div>
  );
});

// ── Labeled form fields ──────────────────────────────────────────────────────
// Capture surfaces (contact outcome, follow-up log, quick log) each hand-rolled the
// same input: a <div> pretending to be a label, inline chrome, and `outline: none`
// — which beat the stylesheet and removed the :focus-visible ring (§11). These own
// the label/control/message triple so a page declares meaning, not pixels:
//   · the label is a real <label htmlFor>, so tapping the words focuses the field
//   · `required` renders a visible `필수` and sets aria-required
//   · `error` sets aria-invalid and is announced; `hint` is wired via aria-describedby
//   · chrome comes from `.hub-input` in hub-tokens.css — never from a call site
function FieldShell({ id, label, required, hint, error, showCount, currentLength, maxLength, children, style, className }) {
  const message = error || hint;
  const hasCount = showCount && maxLength != null;
  return (
    <div className={className} style={{ minWidth: 0, ...style }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
          <label className="hub-label" htmlFor={id}>
            {label}
            {required && <span className="hub-label__req"> · 필수</span>}
          </label>
          {hasCount && (
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: currentLength >= maxLength ? 'var(--danger)' : currentLength >= maxLength * 0.9 ? 'var(--warning)' : 'var(--fg-faint)',
              }}
            >
              {currentLength} / {maxLength}
            </span>
          )}
        </div>
      )}
      {children}
      {message && (
        <p
          id={`${id}-msg`}
          role={error ? 'alert' : undefined}
          className={`hub-field-msg${error ? ' hub-field-msg--error' : ''}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function useFieldA11y({ id, required, hint, error }) {
  const auto = React.useId();
  const fid = id || auto;
  return {
    fid,
    aria: {
      id: fid,
      'aria-required': required ? true : undefined,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': (hint || error) ? `${fid}-msg` : undefined,
    },
  };
}

export const TextField = React.forwardRef(function TextField(
  { id, label, required, hint, error, style, fieldStyle, fieldClassName, className, showCount = false, value, defaultValue, onChange, ...input }, ref,
) {
  const { fid, aria } = useFieldA11y({ id, required, hint, error });
  const currentLen = typeof value === 'string' ? value.length : (typeof defaultValue === 'string' ? defaultValue.length : 0);
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} error={error} showCount={showCount} currentLength={currentLen} maxLength={input.maxLength} style={fieldStyle} className={fieldClassName}>
      <input ref={ref} value={value} defaultValue={defaultValue} onChange={onChange} {...aria} {...input} className={`hub-input${className ? ` ${className}` : ''}`} style={style} />
    </FieldShell>
  );
});

export const TextAreaField = React.forwardRef(function TextAreaField(
  { id, label, required, hint, error, style, fieldStyle, fieldClassName, className, rows = 3, autoResize = false, spacious = false, showCount = false, onCmdEnter, value, defaultValue, onChange, ...input }, ref,
) {
  const { fid, aria } = useFieldA11y({ id, required, hint, error });
  const innerRef = React.useRef(null);
  const resolvedRef = ref || innerRef;

  const adjustHeight = React.useCallback(() => {
    if (!autoResize) return;
    const el = resolvedRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, (rows || 3) * 24)}px`;
  }, [autoResize, rows, resolvedRef]);

  React.useEffect(() => {
    if (autoResize) adjustHeight();
  }, [autoResize, value, adjustHeight]);

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onCmdEnter) {
      e.preventDefault();
      onCmdEnter(e);
    }
    input.onKeyDown?.(e);
  };

  const currentLen = typeof value === 'string' ? value.length : (typeof defaultValue === 'string' ? defaultValue.length : 0);
  const spaciousCls = spacious ? ' hub-input--spacious' : '';

  return (
    <FieldShell
      id={fid}
      label={label}
      required={required}
      hint={hint}
      error={error}
      showCount={showCount}
      currentLength={currentLen}
      maxLength={input.maxLength}
      style={fieldStyle}
      className={fieldClassName}
    >
      <textarea
        ref={resolvedRef}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          onChange?.(e);
          if (autoResize) adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        {...aria}
        {...input}
        className={`hub-input${spaciousCls}${className ? ` ${className}` : ''}`}
        style={style}
      />
    </FieldShell>
  );
});

// `options`: [{ value, label }]. The caret is a drawn icon, not the OS widget — a raw
// native select was the one control on the deck still rendering platform chrome.
export const SelectField = React.forwardRef(function SelectField(
  { id, label, required, hint, error, options = [], style, fieldStyle, fieldClassName, className, ...select }, ref,
) {
  const { fid, aria } = useFieldA11y({ id, required, hint, error });
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} error={error} style={fieldStyle} className={fieldClassName}>
      <span className="hub-select">
        <select ref={ref} {...aria} {...select} className={`hub-input${className ? ` ${className}` : ''}`} style={style}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Iconed name="chevronD" size={13} aria-hidden="true" />
      </span>
    </FieldShell>
  );
});

// Checkbox + its words as ONE control. `<Checkbox label="x" />` beside a plain
// <span>x</span> shipped a dead text target and a doubled accessible name; this is the
// canonical form whenever the box has visible text next to it.
export function CheckboxRow({ checked, onChange, text, disabled = false, size = 17, style, className = '' }) {
  const isChecked = Boolean(checked);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-label={text}
      disabled={disabled}
      className={`hub-checkbox-row${isChecked ? ' hub-checkbox-row--checked' : ''}${className ? ` ${className}` : ''}`}
      // Checkbox와 같은 계약 — 클릭 이벤트를 넘겨 호출처가 좌표 기반 연출(스파클)을 띄울 수 있게 한다.
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked, e); }}
      style={style}
    >
      <span
        aria-hidden="true"
        className={`hub-checkbox${isChecked ? ' hub-checkbox--checked' : ''}`}
        // 전이(transition)는 `.hub-app .hub-checkbox`(hub-tokens.css)가 소유한다 — 인라인은 클래스 규칙을 이긴다.
        style={{
          width: size, height: size, borderRadius: 4,
          border: `1px solid ${isChecked ? 'var(--moon-300)' : 'var(--line-strong)'}`,
          background: isChecked ? 'var(--moon-300)' : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {isChecked && (
          <span className="hub-checkbox__icon hub-checkbox-row__icon" aria-hidden="true">
            <Iconed name="check" size={size - 4} style={{ color: 'var(--bg)', strokeWidth: 3 }} />
          </span>
        )}
      </span>
      {text}
    </button>
  );
}

export function Placeholder({ label = 'image', w, h, style }) {
  return (
    <div style={{
      position: 'relative',
      width: w, height: h,
      background: 'repeating-linear-gradient(135deg, var(--surface-2), var(--surface-2) 4px, var(--surface-3) 4px, var(--surface-3) 8px)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-sm)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}

// 로딩 스켈레톤 — §11 "loading states are part of the design". "불러오는 중…" 한 줄은 레이아웃을
// 예고하지 못해 첫 페인트가 비어 보였다(2026-09-04 아젠다 B2: 스켈레톤 0개). 펄스는 §9의
// 라이브 인디케이터 단일 duration(mlMoonPulse 1.4s)을 hub-tokens.css에서 그대로 쓴다.
// preview/error에는 쓰지 않는다 — 스켈레톤은 "곧 채워진다"는 약속이라 §5.3 source truth를 속인다.
// `width`는 문자열 하나(전 줄 공통) 또는 줄별 배열. 기본은 마지막 줄만 짧게.
export function Skeleton({ lines = 3, height = 12, width, gap = 8, style, label = '불러오는 중' }) {
  const widths = Array.isArray(width)
    ? width
    : Array.from({ length: lines }, (_, i) => width || (lines > 1 && i === lines - 1 ? '62%' : '100%'));
  return (
    <div role="status" aria-busy="true" aria-label={label} className="hub-skeleton" style={{ display: 'grid', gap, ...style }}>
      {widths.map((w, i) => <span key={i} className="hub-skeleton__line" style={{ height, width: w }} />)}
    </div>
  );
}

const CERTAINTY_STATES = {
  confirmed:   { label: '확정', borderStyle: 'solid',  marker: 'filled' },
  recommended: { label: '권장', borderStyle: 'dashed', marker: 'diamond' },
  unknown:     { label: '미정', borderStyle: 'dotted', marker: 'unknown' },
};

function CertaintyMarker({ marker }) {
  if (marker === 'unknown') {
    return <span aria-hidden="true" style={{ width: 8, textAlign: 'center', fontSize: 10.5, fontWeight: 700, lineHeight: 1 }}>?</span>;
  }
  return <span aria-hidden="true" style={{
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: marker === 'filled' ? 999 : 1,
    border: marker === 'filled' ? 'none' : '1px solid currentColor',
    background: marker === 'filled' ? 'currentColor' : 'transparent',
    transform: marker === 'diamond' ? 'rotate(45deg)' : undefined,
  }} />;
}

export function CertaintyBadge({ state = 'unknown', label, style }) {
  const config = CERTAINTY_STATES[state] || CERTAINTY_STATES.unknown;
  const visibleLabel = label || config.label;
  return (
    <span
      data-certainty={state}
      aria-label={`확정도: ${visibleLabel}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 6px', borderRadius: 999,
        color: state === 'unknown' ? 'var(--fg-dim)' : 'var(--fg-muted)',
        background: 'transparent',
        borderWidth: 1, borderColor: 'var(--line-strong)', borderStyle: config.borderStyle,
        fontSize: 10.5, fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <CertaintyMarker marker={config.marker} />
      {visibleLabel}
    </span>
  );
}

const LIFECYCLE_STATES = {
  queued:    { label: '수집', icon: 'inbox' },
  active:    { label: '진행 중', icon: 'play' },
  waiting:   { label: '대기', icon: 'pause' },
  blocked:   { label: '막힘', icon: 'x', danger: true },
  done:      { label: '완료', icon: 'check' },
  cancelled: { label: '취소', icon: 'x' },
};

export function LifecycleBadge({ state = 'queued', label, reason, style }) {
  const config = LIFECYCLE_STATES[state] || LIFECYCLE_STATES.queued;
  const visibleLabel = label || config.label;
  const fullLabel = reason ? `${visibleLabel} · ${reason}` : visibleLabel;
  return (
    <span
      data-lifecycle={state}
      aria-label={`진행 상태: ${fullLabel}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 6px', borderRadius: 999,
        color: config.danger ? 'var(--danger)' : 'var(--fg-muted)',
        background: config.danger ? 'var(--danger-bg)' : 'transparent',
        border: `1px solid ${config.danger ? 'var(--danger-line)' : 'var(--line)'}`,
        fontSize: 10.5, fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Iconed name={config.icon} size={10} aria-hidden="true" />
      {fullLabel}
    </span>
  );
}

// 라벨은 운영자가 읽고 바로 행동할 수 있는 한국어다. `live`/`preview`/`error` 개발 토큰은
// 1인 운영자에게 "이 화면을 믿어도 되는지 / 지금 뭘 해야 하는지"를 말해주지 않았다
// (DESIGN §5.3 source truth · §10 운영자 어휘 — 2026-08-07 사용성 재감사 C).
// 폰트는 sans — 상태 라벨은 §6의 mono 대상(ID·타임스탬프·키바인딩·계기 수치)이 아니고,
// 한글은 어차피 SUIT로 폴백해 mono 지정이 혼합 렌더만 만들었다.
const TRUTH_STATES = {
  live:    { tone: 'neutral', label: '실시간',             icon: 'signal' },
  partial: { tone: 'neutral', label: '일부 데이터',        icon: 'signal', borderStyle: 'dashed' },
  syncing: { tone: 'neutral', label: '동기화 중',          icon: 'runs' },
  loading: { tone: 'neutral', label: '불러오는 중',        icon: 'runs' },
  preview: { tone: 'neutral', label: 'Preview · 연결 필요', icon: 'link', borderStyle: 'dashed' },
  error:   { tone: 'danger',  label: '읽기 실패',          icon: 'x' },
};

// `reason`은 §5.3이 partial/error에 요구하는 "누락 소스·평문 원인"을 배지 안에 싣는 슬롯이다.
// 재시도 버튼은 여기 넣지 않는다 — 모바일에서 `.hub-app button`이 44px 플로어를 받아
// (hub-tokens.css) 배지 줄을 깨뜨린다. 재시도는 배지 옆 형제 Button이 소유한다.
export function TruthBadge({ state = 'error', label, reason, style }) {
  const config = TRUTH_STATES[state] || TRUTH_STATES.error;
  const visibleLabel = label || config.label;
  const fullLabel = reason ? `${visibleLabel} · ${reason}` : visibleLabel;
  const danger = config.tone === 'danger';
  return (
    <span
      data-truth={state}
      aria-label={`데이터 상태: ${fullLabel}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 6px', borderRadius: 999,
        color: danger ? 'var(--danger)' : 'var(--fg-muted)',
        background: danger ? 'var(--danger-bg)' : 'transparent',
        borderWidth: 1,
        borderColor: danger ? 'var(--danger-line)' : 'var(--line)',
        borderStyle: config.borderStyle || 'solid',
        fontSize: 10.5, fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Iconed name={config.icon} size={9} aria-hidden="true" />
      {fullLabel}
    </span>
  );
}

// 다음 행동 날짜의 빠른 프리셋 — 연락 기록(§7 확정 최소 기록)의 date picker 수동 조작이
// 최고 빈도 액션의 반복 마찰이었다(27차 편의성 실측). 값은 로컬(KST 운영) 날짜 문자열로
// date input과 동일 형식. followups·customers 컨택 시트가 공유한다(§8.1 primitives-first).
export function DateQuickPresets({ onPick, disabled, style }) {
  const presets = [
    { label: '내일', days: 1 },
    { label: '3일 뒤', days: 3 },
    { label: '다음 주', days: 7 },
  ];
  const pick = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    onPick(`${y}-${m}-${day}`);
  };
  return (
    <span style={{ display: 'inline-flex', gap: 4, ...style }}>
      {presets.map((p) => (
        <Button key={p.days} type="button" variant="ghost" size="xs" disabled={disabled} onClick={() => pick(p.days)}>
          {p.label}
        </Button>
      ))}
    </span>
  );
}

const ATTENTION_LABELS = {
  urgent: '긴급',
  critical: '즉시 확인',
};

export function AttentionRail({ level = 'none', label, children, style }) {
  const active = level === 'urgent' || level === 'critical';
  const visibleLabel = active ? (label || ATTENTION_LABELS[level]) : null;
  return (
    <div
      data-attention={level}
      aria-label={active ? `주의 수준: ${visibleLabel}` : undefined}
      role={level === 'critical' ? 'alert' : undefined}
      style={{
        minWidth: 0,
        paddingLeft: active ? 10 : 0,
        boxShadow: active ? 'inset 1px 0 0 var(--danger)' : undefined,
        ...style,
      }}
    >
      {active && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6,
          color: 'var(--danger)', fontSize: 10.5, fontWeight: 600, lineHeight: 1,
        }}>
          <Iconed name={level === 'critical' ? 'x' : 'clock'} size={10} aria-hidden="true" />
          {visibleLabel}
        </span>
      )}
      {children}
    </div>
  );
}

// Compatibility wrapper for existing page headers. New code should use TruthBadge.
export function SyncBadge({ state, reason, style }) {
  return <TruthBadge state={state} reason={reason} style={{ marginLeft: 8, ...style }} />;
}

// Canonical pill-group toolbar (type / status / view filters). `options`: [{ key, label,
// dot?: tone string, count?: number }]. Call sites keep any bespoke onChange side effects
// by handling that logic inside their onChange.
// `label` names the group for screen readers; `fill` spreads the segments across the
// available width (segments stay side-by-side on mobile — never stacked). `size="md"` is
// the lower-density scale for drafting surfaces (§4) — capture forms, not scan tables.
const SEGMENT_SCALE = {
  sm: { pad: '4px 10px', fs: 11.5, gap: 5, radius: 4 },
  md: { pad: '9px 13px', fs: 12.5, gap: 6, radius: 5 },
};

// 다중 선택 칩 토글 — Leads 과목 필터 줄과 EditDrawer chips 필드가 공유한다(§8.1 primitives-first).
// 단일 선택 뷰 전환은 SegmentedControl, on/off 다중 선택은 이것. aria-pressed로 상태 전달.
// 선택 표시는 §5.2대로 조용한 서피스 승격(surface-3 + line-strong) — 액센트/색상 분류 금지.
export function ChipToggle({ label, selected, onChange, style }) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(selected)}
      onClick={() => onChange?.(!selected)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${selected ? 'var(--line-strong)' : 'var(--line)'}`,
        background: selected ? 'var(--surface-3)' : 'transparent',
        color: selected ? 'var(--fg)' : 'var(--fg-muted)',
        fontSize: 12, fontWeight: 500, lineHeight: 1.2, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function SegmentedControl({ options, value, onChange, className, style, label, fill, size = 'sm', invalid = false }) {
  const scale = SEGMENT_SCALE[size] || SEGMENT_SCALE.sm;
  // 색·배경·보더는 hub-tokens.css의 .hub-seg / .hub-seg__btn이 소유한다 — 인라인이면 어떤
  // :hover/전이도 붙지 않는다(§15 2026-09-15 Button과 같은 cascade). 크기 스케일만 인라인.
  // `invalid`도 같은 이유로 DOM 속성으로만 노출한다: 호출처가 인라인 border를 얹으면 숏핸드가
  // 나머지 롱핸드를 지워 보더가 currentColor로 떨어졌다(customers.jsx가 쓰던 우회).
  return (
    <div
      className={['hub-seg', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
      data-invalid={invalid ? '' : undefined}
      style={{ display: 'flex', gap: 2, borderRadius: 'var(--r-sm)', padding: 2, ...style }}
    >
      {options.map(o => {
        const isActive = o.key === value;
        return (
          <button key={o.key} type="button" className="hub-seg__btn" onClick={() => onChange?.(o.key)} aria-pressed={isActive} style={{
            padding: scale.pad, fontSize: scale.fs, borderRadius: scale.radius, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', justifyContent: fill ? 'center' : undefined, gap: scale.gap,
            flex: fill ? '1 1 0' : undefined, minWidth: fill ? 0 : undefined,
          }}>
            {o.dot && <Dot tone={o.dot} />}
            {o.label}
            {o.count != null && <span className="mono" style={{ fontSize: 10.5 }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Elements the drawer's focus manager treats as tab stops.
const DRAWER_FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

// Shared drawer shell (side by default, optional compact capture): overlay + aside + header +
// scrollable body + optional footer bar. Owns ESC-to-close, focus-in-on-mount +
// focus-restore-on-unmount, and a light Tab focus trap — not field rendering or
// save/delete semantics. EditDrawer and the Guru diagnosis drawer compose on top.
export function Drawer({ title, subtitle, onClose, footer, footerStyle, initialFocusRef, width = 'min(380px, 92vw)', borderLeft = 'var(--line)', presentation = 'side', exiting = false, children }) {
  const asideRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const compact = presentation === 'compact';

  // ESC는 이 드로어가 최상위 레이어일 때만 닫는다 — 드로어 위에 ⌘K 팔레트가 열려 있으면
  // 팔레트가 먼저 닫혀야 한다(esc-layers.js). onClose는 ref로 읽어 부모 리렌더가 레이어
  // 순서를 흔들지 않게 한다(마운트당 1회 등록).
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    const layer = pushEscLayer();
    const onKey = (e) => { if (e.key === 'Escape' && isTopEscLayer(layer)) onCloseRef.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); popEscLayer(layer); };
  }, []);

  // Focus the first field on mount; restore focus to the opener on unmount.
  React.useEffect(() => {
    const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;
    const raf = requestAnimationFrame(() => {
      const scope = bodyRef.current || asideRef.current;
      const preferred = initialFocusRef?.current;
      const first = preferred && scope?.contains(preferred)
        ? preferred
        : scope?.querySelector(DRAWER_FOCUSABLE);
      if (first && typeof first.focus === 'function') first.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [initialFocusRef]);

  // Light focus trap: keep Tab inside the drawer, wrapping first↔last.
  const handleKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const root = asideRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll(DRAWER_FOCUSABLE)).filter(el =>
      !el.matches(':disabled') && !el.closest('[inert]') && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden');
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    // A loading/disabled form may retain programmatic focus with only Close tabbable.
    if (nodes.length === 1) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      <div className="hub-drawer-overlay" data-presentation={presentation} data-exiting={exiting} aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-drawer-overlay)' }} />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onKeyDown={handleKeyDown}
        className="hub-drawer"
        data-presentation={presentation}
        data-exiting={exiting}
        style={{
          position: 'fixed', zIndex: 'var(--z-drawer)', background: 'var(--surface)', color: 'var(--fg)',
          display: 'flex', flexDirection: 'column',
          ...(compact ? { '--hub-compact-width': width } : {
            top: 0, right: 0, bottom: 0, width, borderLeft: `1px solid ${borderLeft}`,
            boxShadow: '-8px 0 32px -12px oklch(0 0 0 / 0.5)',
          }),
        }}
      >
        <div className="hub-drawer__header" style={{ padding: compact ? undefined : '14px 16px', borderBottom: compact ? undefined : '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <IconButton icon="x" size={44} iconSize={13} tooltip="닫기" onClick={onClose} style={{ margin: -10 }} />
        </div>
        <div ref={bodyRef} className="hub-drawer__body scroll-y" style={{ flex: 1, padding: compact ? undefined : 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
        </div>
        {footer && (
          <div className="hub-drawer__footer" style={{ padding: compact ? undefined : 12, borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10, ...footerStyle }}>
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}

// Groups consecutive fields sharing a `row` key into one flex row (compact, side-by-side
// inputs for related fields — 단계+금액, 타입+지역, etc.) instead of every field getting its
// own full-width block regardless of how little content it holds. Fields without `row` (the
// default — every existing EditDrawer call site) render exactly as before, one per row.
function groupFieldRows(fields) {
  const rows = [];
  fields.forEach((f) => {
    const last = rows[rows.length - 1];
    if (f.row && last && last.row === f.row) last.fields.push(f);
    else rows.push({ row: f.row || null, fields: [f] });
  });
  return rows;
}

const FIELD_PANEL_KEY = '__fields__';

// Shared field-driven edit drawer. Revenue behavior is canonical for save feedback,
// ESC close, and optimistic delete confirmation. Composes on top of Drawer for the shell.
// Cmd/Ctrl+Enter mirrors the explicit save button. The initial signature is kept for the
// lifetime of one opened record so ESC, the overlay, and the close button cannot silently
// discard a changed draft.
//
// `panels`는 필드 편집 옆에 붙는 상세 탭이다 — [{ key, label, count, content }]. 넘기지
// 않으면 기존 call site와 픽셀 단위로 같은 단일 폼이 그려진다(계약 변경 없음). 탭이 있을
// 때만 열림 포커스를 첫 필드로 고정한다: 그러지 않으면 Drawer의 "본문 첫 focusable"
// 규칙이 탭 버튼을 집어 이름 입력이 포커스를 잃는다.
export function EditDrawer({ title, subtitle, record, fields, onChange, onClose, onSave, onDelete, presentation = 'side', width = 'min(380px, 92vw)', saveLabel = '변경사항 저장', onContinue, panels, infoLabel = '정보', children }) {
  const [saveState, setSaveState] = React.useState('idle'); // idle | saving | preview | conflict | error
  const [saveFeedback, setSaveFeedback] = React.useState('');
  // 파괴 확인은 브라우저 confirm()이 아니라 푸터 인라인 2단계다 — OS 다이얼로그는 디자인
  // 시스템·ESC 레이어 밖이고(§8.1), 모바일에서 뷰포트를 가리며, 문구·버튼 위계를 못 가진다
  // (백로그 M: window.confirm 스타일드 플로). null | 'discard' | 'delete'.
  const [confirming, setConfirming] = React.useState(null);
  const [panelKey, setPanelKey] = React.useState(FIELD_PANEL_KEY);
  const [optionalOpen, setOptionalOpen] = React.useState(false);
  const confirmCancelRef = React.useRef(null);
  const firstFieldRef = React.useRef(null);
  const savingRef = React.useRef(false);
  const initialRecordSignatureRef = React.useRef(null);
  const recordIdentity = record?.id ?? record?.clientId ?? (record ? '__anonymous__' : null);
  React.useEffect(() => {
    savingRef.current = false;
    setSaveState('idle');
    setSaveFeedback('');
    setConfirming(null);
    setOptionalOpen(fields.some(field => field.optional && Boolean(record?.[field.key])));
    setPanelKey(FIELD_PANEL_KEY); // 레코드가 바뀌면 항상 편집 탭에서 시작
    initialRecordSignatureRef.current = record ? JSON.stringify(record) : null;
    const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [recordIdentity]);

  // 확인 스트립이 뜨면 포커스를 취소 버튼으로 — ESC·Enter가 파괴 쪽에 얹히지 않게.
  React.useEffect(() => {
    if (confirming) confirmCancelRef.current?.focus();
  }, [confirming]);

  const dirty = Boolean(record
    && initialRecordSignatureRef.current
    && JSON.stringify(record) !== initialRecordSignatureRef.current);
  const requestClose = React.useCallback(() => {
    if (savingRef.current) return;
    // ESC/오버레이는 확인 스트립부터 해제한다(취소 시멘틱) — 닫힘·버림은 명시 버튼만.
    if (confirming) { setConfirming(null); return; }
    if (dirty) { setConfirming('discard'); return; }
    onClose?.();
  }, [confirming, dirty, onClose]);

  const handleDone = async (continueCreating = false) => {
    if (savingRef.current || confirming) return;
    if (!onSave) { onClose(); return; }
    savingRef.current = true;
    setSaveState('saving');
    setSaveFeedback('');
    try {
      const r = await onSave();
      if (continueCreating && onContinue && r?.ok && !['saved', 'duplicate'].includes(r.status)) {
        setSaveState(r.status === 'preview' ? 'preview' : 'error');
        return;
      }
      if (r?.ok) {
        setSaveState('idle');
        if (continueCreating && onContinue && ['saved', 'duplicate'].includes(r.status)) onContinue();
        else onClose();
      }
      else if (r?.status === 'preview') setSaveState('preview');
      else if (r?.status === 'conflict') {
        setSaveFeedback(r?.message || '다른 변경이 먼저 저장되었습니다. 입력을 유지했으니 기록을 확인한 뒤 다시 시도하세요.');
        setSaveState('conflict');
      }
      else { setSaveFeedback(r?.message || ''); setSaveState('error'); }
    } catch {
      setSaveFeedback('저장하지 못했습니다. 입력은 유지했으니 다시 시도하세요.');
      setSaveState('error');
    } finally {
      savingRef.current = false;
    }
  };

  // 1차 클릭은 확인 스트립만 연다 — 실제 삭제는 performDelete(확인 버튼)가 수행.
  const handleDelete = () => {
    if (!onDelete || savingRef.current) return;
    setConfirming('delete');
  };

  const performDelete = async () => {
    if (!onDelete || savingRef.current) return;
    setConfirming(null);
    savingRef.current = true;
    setSaveState('saving');
    try {
      // 삭제 결과 봉투를 소비한다 — 실패(502/failed)를 버리고 닫으면 행이 낙관 제거된 채
      // "삭제됨"으로 믿게 되고 다음 로드에 부활한다(4차 재감사 M — 유일하게 남은 무언 경로).
      const result = await onDelete();
      if (result && result.ok === false && result.status !== 'local') {
        // preview 삭제도 실패다 — 영속 대기열이 없어 로컬 제거는 다음 로드에 부활한다.
        // 호출자가 행을 복원하고, 여기서 원인을 명명한다(7차 안정성 — my-work 계약으로 통일).
        setSaveState('error');
        setSaveFeedback(result.status === 'preview'
          ? 'Supabase 미설정 — 삭제가 저장되지 않습니다. 항목은 그대로 있습니다.'
          : `삭제 실패 (${result.status || 'error'}) — 항목은 그대로 있습니다. 다시 시도하세요.`);
        return; // 드로어를 열어 두고 원인 표시
      }
      onClose();
    } catch {
      setSaveState('error');
      setSaveFeedback('삭제 실패 — 네트워크를 확인하고 다시 시도하세요.');
    } finally {
      savingRef.current = false;
    }
  };

  // Cmd/Ctrl+Enter saves. A ref keeps the window listener pointed at the latest
  // handler without re-binding every render.
  const handleDoneRef = React.useRef(handleDone);
  handleDoneRef.current = handleDone;
  React.useEffect(() => {
    if (!record) return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); handleDoneRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record?.id]);

  if (!record) return null;

  const hasPanels = Array.isArray(panels) && panels.length > 0;
  const renderFieldRows = (list, primary = true) => groupFieldRows(list).map((group, i) => (
        <div key={group.row || `solo-${i}`} className={group.fields.length > 1 ? "hub-edit-field-row" : undefined} style={group.fields.length > 1 ? { display: 'flex', gap: 10 } : undefined}>
          {group.fields.map((f, j) => {
            // 탭 모드에서만 쓰이는 열림 포커스 앵커 — 탭이 없으면 Drawer 기본 규칙 그대로다.
            const focusRef = primary && hasPanels && i === 0 && j === 0 ? firstFieldRef : undefined;
            const isSpaciousTextarea = f.type === 'textarea' && (f.spacious || (f.rows && f.rows >= 4) || ['notes', 'description', 'memo', 'content', 'body'].includes(f.key));
            const currentLen = typeof record[f.key] === 'string' ? record[f.key].length : 0;
            return (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5, ...(group.fields.length > 1 ? { flex: 1, minWidth: 0 } : null) }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{f.label}{f.labelBadge || null}</span>
                {f.maxLength ? (
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', letterSpacing: '0.02em', textTransform: 'none' }} aria-hidden="true">
                    {currentLen} / {f.maxLength}
                  </span>
                ) : null}
              </span>
              {f.type === 'select' ? (
                <span className="hub-select">
                  <select
                    ref={focusRef}
                    disabled={saveState === 'saving'}
                    value={record[f.key] ?? ''}
                    onChange={e => onChange(f.key, e.target.value)}
                    className="hub-drawer-input"
                  >
                    {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <Iconed name="chevronD" size={13} aria-hidden="true" />
                </span>
              ) : f.type === 'chips' ? (
                <div role="group" aria-label={f.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 0' }}>
                  {f.options.map(o => {
                    const current = Array.isArray(record[f.key]) ? record[f.key] : [];
                    const selected = current.includes(o.value);
                    return (
                      <ChipToggle
                        key={o.value}
                        label={o.label}
                        selected={selected}
                        onChange={() => onChange(f.key, selected ? current.filter(v => v !== o.value) : [...current, o.value])}
                      />
                    );
                  })}
                </div>
              ) : f.type === 'textarea' ? (
                <textarea
                  ref={focusRef}
                  // hub-drawer-input: 드로어 공용 휴지·hover·focus chrome만 / hub-edit-textarea(+--spacious):
                  // 크기·여백·행간·글자 크기의 단독 소유자(hub-edit-drawer.css, DESIGN.md §15 2026-09-21).
                  className={`hub-drawer-input hub-edit-textarea${isSpaciousTextarea ? ' hub-edit-textarea--spacious' : ''}`}
                  disabled={saveState === 'saving'}
                  value={record[f.key] ?? ''}
                  placeholder={f.placeholder || ''}
                  rows={f.rows || 5}
                  maxLength={f.maxLength}
                  onChange={e => {
                    onChange(f.key, e.target.value);
                    if (f.autoResize) {
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }
                  }}
                  style={{ minHeight: f.rows ? undefined : 112, ...(f.rows && !f.autoResize ? { height: 'auto' } : null) }}
                />
              ) : (
                <input
                  ref={focusRef}
                  disabled={saveState === 'saving'}
                  type={f.inputType || 'text'}
                  // <input type="date"> requires an exact YYYY-MM-DD value — a full ISO
                  // timestamp ("2026-07-20T00:00:00+00:00", what every dueAt/closeAt read
                  // path returns) fails the native format check and the browser silently
                  // renders it blank instead of erroring, so this slice is load-bearing.
                  value={f.inputType === 'date' ? String(record[f.key] ?? '').slice(0, 10) : (record[f.key] ?? '')}
                  placeholder={f.placeholder || ''}
                  maxLength={f.maxLength}
                  onChange={e => onChange(f.key, f.inputType === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)}
                  className="hub-drawer-input"
                />
              )}
            </label>
            );
          })}
        </div>
      ));
  const optionalFields = fields.filter(field => field.optional);
  const fieldsPanel = (
    <>
      {renderFieldRows(fields.filter(field => !field.optional))}
      {optionalFields.length > 0 && <details className="hub-edit-optional" key={recordIdentity} open={optionalOpen} onToggle={event => setOptionalOpen(event.currentTarget.open)}>
        <summary>설명·다음 행동 <span>선택</span></summary>
        <div>{renderFieldRows(optionalFields, false)}</div>
      </details>}
      {children}
    </>
  );

  return (
    <Drawer
      title={title}
      subtitle={subtitle}
      onClose={requestClose}
      width={width}
      presentation={presentation}
      initialFocusRef={hasPanels ? firstFieldRef : undefined}
      footer={
        confirming ? (
          <>
            <span role="alert" style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.4, color: confirming === 'delete' ? 'var(--danger)' : 'var(--fg-muted)' }}>
              {confirming === 'delete'
                ? '이 항목을 삭제할까요? 되돌릴 수 없습니다.'
                : '저장하지 않은 변경이 있습니다 — 버리고 닫을까요?'}
            </span>
            <Button ref={confirmCancelRef} variant="ghost" size="sm" onClick={() => setConfirming(null)}>
              {confirming === 'delete' ? '취소' : '계속 편집'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirming === 'delete' ? performDelete : () => { setConfirming(null); onClose?.(); }}
            >
              {confirming === 'delete' ? '삭제' : '버리고 닫기'}
            </Button>
          </>
        ) : (
        <>
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saveState === 'saving'} style={{ color: 'var(--danger)' }}>삭제</Button>
          )}
          <div aria-live="polite" style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.4 }}>
            {saveState === 'preview' && (
              <span style={{ color: 'var(--fg-muted)' }}>저장 위치(Supabase)가 설정되지 않아 로컬에만 반영됩니다.</span>
            )}
            {saveState === 'conflict' && (
              <span style={{ color: 'var(--danger)' }}>{saveFeedback || '다른 변경이 먼저 저장되었습니다. 입력을 유지했으니 기록을 확인한 뒤 다시 시도하세요.'}</span>
            )}
            {saveState === 'error' && (
              <span style={{ color: 'var(--danger)' }}>{saveFeedback || '저장에 실패했습니다. 다시 시도하세요.'}</span>
            )}
          </div>
          {(saveState === 'preview' || saveState === 'conflict' || saveState === 'error') && (
            <Button variant="ghost" size="sm" onClick={requestClose}>닫기</Button>
          )}
          {onContinue && <Button variant="outline" size="sm" onClick={() => handleDone(true)} disabled={saveState === 'saving'}>저장 후 계속</Button>}
          <Button variant="primary" size="sm" onClick={() => handleDone()} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? '저장 중…' : saveLabel}
          </Button>
        </>
        )
      }
    >
      {!hasPanels ? fieldsPanel : (
        <>
          <Tabs
            ariaLabel="상세 보기"
            tabs={[{ key: FIELD_PANEL_KEY, label: infoLabel }, ...panels.map(p => ({ key: p.key, label: p.label, count: p.count }))]}
            active={panelKey}
            onChange={setPanelKey}
            style={presentation === 'compact' ? { margin: 0, padding: 0 } : { margin: '-16px -16px 0', padding: '0 16px' }}
          />
          {/* 비활성 탭은 언마운트하지 않고 감춘다 — 기록 탭이 열리기 전에도 기록을 읽어
              탭 배지에 건수가 뜨고, 탭을 오가도 작성 중인 초안·스크롤이 살아 있다.
              display:none 요소는 Drawer의 Tab 트랩(offsetParent 필터)에서도 빠진다. */}
          <div role="tabpanel" aria-label={infoLabel} style={{ display: panelKey === FIELD_PANEL_KEY ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>
            {fieldsPanel}
          </div>
          {panels.map(p => (
            <div key={p.key} role="tabpanel" aria-label={p.label} style={{ display: panelKey === p.key ? 'flex' : 'none', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              {p.content}
            </div>
          ))}
        </>
      )}
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

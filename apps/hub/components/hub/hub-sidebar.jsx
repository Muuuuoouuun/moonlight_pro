"use client";

import React from "react";
import { goalHref } from '@/lib/goal-client';
import { InquiryBell } from './inquiry-notifications';
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
  pathnameOf,
  resolveSidebarPath,
  sidebarChildren,
  setElementInert,
  getMobileNavigationTabTarget,
} from "./hub-nav";

const SCOPE_STORAGE_KEY = 'mlp.scope';
const MOBILE_NAV_FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Scope lives in localStorage only — no server preference, no fetch (Phase A).
// If storage is unavailable we simply keep it in React state for the session.
function useScope(active, routeScope) {
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
    const derived = routeScope || deriveSidebarScope(active);
    if (derived) setScope((s) => (s === derived ? s : derived));
  }, [active, routeScope]);

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
      .then(r => {
        if (!r.ok) throw new Error(`followups ${r.status}`); // 실패 시 뱃지 생략(0으로 위장 금지)
        return r.json();
      })
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

export const Sidebar = React.forwardRef(function Sidebar({ active, view, search = '', routeScope, onScopeChange, onNavigate, collapsed, onToggleCollapse, openPalette, className, mobileHidden = false, mobileOpen = false, onMobileClose, mobileCloseButtonRef, inquiryNotifications }, ref) {
  const counts = useAnchorCounts();
  const sidebarRef = React.useRef(null);
  const scopeFocusPending = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!collapsed && scopeFocusPending.current) {
      scopeFocusPending.current = false;
      sidebarRef.current?.querySelector('.hub-sidebar-scope [aria-pressed="true"]')?.focus();
    }
  }, [collapsed]);
  const setSidebarRef = React.useCallback((node) => {
    sidebarRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  const [scope, setScope] = useScope(active, routeScope);
  const sidebarA11yProps = {
    id: 'hub-mobile-navigation',
    'aria-hidden': mobileHidden ? true : undefined,
    role: mobileOpen ? 'dialog' : undefined,
    'aria-modal': mobileOpen ? 'true' : undefined,
  };

  React.useLayoutEffect(() => {
    setElementInert(sidebarRef.current, mobileHidden);
  }, [collapsed, mobileHidden]);

  React.useEffect(() => {
    onScopeChange?.(scope);
  }, [onScopeChange, scope]);

  const handleMobileKeyDown = (event) => {
    if (!mobileOpen || event.key !== 'Tab') return;
    const focusables = Array.from(event.currentTarget.querySelectorAll(MOBILE_NAV_FOCUSABLE))
      .filter((element) => element.offsetParent !== null && element.getAttribute('aria-hidden') !== 'true');
    const target = getMobileNavigationTabTarget({
      focusables,
      activeElement: document.activeElement,
      shiftKey: event.shiftKey,
    });
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

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
    // 지금 서 있는 자식 탭이 새 스코프에도 같은 pathname으로 존재하면 그 자식으로
    // 재진입한다 — 스코프 불변 표면(컨텐츠 로그 등)은 제자리, 스코프 소비 자식은
    // 쿼리만 갱신된다. 앵커 루트로 강퇴하지 않는다 (2609 감사 #10).
    const currentPathname = pathnameOf(active);
    const sibling = sidebarChildren(owner, value)
      .find(c => pathnameOf(c.path) === currentPathname && (owner !== 'overview' || (new URLSearchParams(c.path.split('?')[1] || '').get('view') === 'goals') === (view === 'goals')));
    const target = owner === 'overview' && view === 'goals'
      ? goalHref(null, value, { check: new URLSearchParams(search).get('check') === '1' }).slice(1)
      : sibling ? sibling.path : resolveSidebarPath(owner, value);
    if (target) onNavigate(target);
  }, [active, view, search, onNavigate, setScope]);

  // Sidebar stays one level deep. Contextual destinations are rendered as
  // horizontal top tabs by TopBar, so the operator never has to expand a tree.
  // 2026-09-19 Futura 패스는 *외형만* 바꿨다 — 아이콘·색점을 빼고 현재 항목을
  // pill로 띄웠을 뿐, 깊이와 이동 동작은 그대로다(운영자: "기능은 유지").
  // 접힌 56px 레일(2026-09-22)에서만 라벨 대신 아이콘이 이름을 맡는다. 한 종류의
  // 버튼이 두 상태를 모두 그리므로 접기 토글 뒤에도 같은 DOM·포커스가 유지된다.
  const renderAnchor = (a, small) => {
    const count = counts[a.key];
    // 펼친 행 — 라벨과 건수 뱃지만(Futura 텍스트 전용, §15 2026-09-19).
    let content = (
      <>
        <span className="hub-sidebar-label" style={{ flex: 1 }}>{a.label}</span>
        <CountBadge n={count} />
      </>
    );
    let railLabel;
    if (collapsed) {
      // 레일 — 이름·건수는 tooltip과 접근 가능한 이름으로, "건수 있음"은 점 하나로 알린다.
      railLabel = `${a.label}${count ? ` · ${count}건` : ''}`;
      content = (
        <>
          <Iconed name={a.icon} size={18} />
          {count > 0 && <span className="hub-sidebar-count-dot" aria-hidden="true" />}
        </>
      );
    }
    return (
      <button
        key={a.key}
        type="button"
        className={`hub-nav-item${small ? ' hub-nav-item--sm' : ''}${collapsed ? ' hub-nav-item--icon' : ''}`}
        title={railLabel}
        aria-label={railLabel}
        aria-current={isSidebarAnchorActive(a.key, active, view) ? 'page' : undefined}
        onClick={() => go(a.key)}
      >
        {content}
      </button>
    );
  };

  return (
    <aside {...sidebarA11yProps} ref={setSidebarRef} onKeyDown={handleMobileKeyDown} className={`hub-sidebar-futura${className ? ` ${className}` : ''}${collapsed ? ' hub-sidebar-root--collapsed' : ''}`} data-collapsed={collapsed} aria-label="주요 메뉴" style={{
      // 면 색은 .hub-sidebar-futura(hub-futura.css)가 소유한다 — 인라인 background는 그 규칙을 이긴다.
      width: collapsed ? 56 : 232, flexShrink: 0,
      borderRight: '1px solid var(--line-soft)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div className="hub-sidebar-header" style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="hub-sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 'var(--r-sm)',
            background: 'var(--fg)', color: 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, letterSpacing: '-0.02em',
          }} aria-hidden="true">M</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Moonlight</div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', letterSpacing: '0.05em', marginTop: -1 }}>HUB · PRO</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconButton
            className="hub-mobile-nav-close"
            ref={mobileCloseButtonRef}
            icon="x"
            tooltip="내비게이션 닫기"
            onClick={onMobileClose}
          />
          <IconButton className="hub-desktop-sidebar-collapse" icon={collapsed ? "panelExpand" : "panelCollapse"} onClick={onToggleCollapse} size={32} iconSize={18} tooltip={collapsed ? "사이드바 펼치기" : "사이드바 최소화"} aria-expanded={!collapsed} />
        </div>
      </div>

      <div className="hub-sidebar-search" style={{ padding: '4px 12px 8px' }}>
        <button onClick={openPalette} className="fx-shell-card" title="검색 · ⌘K" aria-label="검색 · ⌘K" style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          height: 34, padding: '0 12px',
          border: 0,
          color: 'var(--fg-faint)', fontSize: 12,
        }}>
          <Iconed name="search" size={13} />
          <span className="hub-sidebar-label" style={{ flex: 1, textAlign: 'left' }}>검색 · 바로 이동</span>
          <span className="hub-sidebar-label" style={{ display: 'flex', gap: 4 }}><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>
      </div>

      {/* Scope replaces the old workspace trees: 소속은 여기서 한 번만 고른다. */}
      <div className="hub-sidebar-scope" style={{ padding: '0 12px 10px' }}>
        {collapsed ? <IconButton
          icon={scope === 'classin' ? 'building' : scope === 'personal' ? 'user' : 'globe'}
          size={36} iconSize={18}
          tooltip={`작업 범위: ${SIDEBAR_SCOPES.find(s => s.key === scope)?.label} · 변경`}
          onClick={() => { scopeFocusPending.current = true; onToggleCollapse(); }}
        /> : <SegmentedControl
          label="작업 범위"
          fill
          options={SIDEBAR_SCOPES}
          value={scope}
          onChange={changeScope}
          style={{ width: '100%' }}
        />}
      </div>

      <nav className="scroll-y hub-sidebar-nav" aria-label="업무 메뉴" style={{ flex: 1, minHeight: 0, padding: '2px 8px 10px' }}>
        {SIDEBAR_PRIMARY.map(a => renderAnchor(a, false))}
      </nav>

      <div className="hub-sidebar-utilities" style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)' }}>
        {SIDEBAR_UTILITIES.map(a => renderAnchor(a, true))}
      </div>

      <div className="hub-sidebar-footer fx-shell-card" style={{
        margin: '8px 12px 12px', padding: '9px 11px',
        display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <span className="hub-sidebar-label"><Avatar name="문준혁" size={26} /></span>
        <div className="hub-sidebar-label" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>문준혁</div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>Founder · Pro</div>
        </div>
        <InquiryBell className="hub-sidebar-inquiry" size={collapsed ? 36 : 24} state={inquiryNotifications} onNavigate={onNavigate} />
      </div>
    </aside>
  );
});

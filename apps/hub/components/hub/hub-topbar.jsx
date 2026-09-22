"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { IconButton, Button } from "./hub-primitives";
import { pageOwnsTabs, topNavigationForRoute } from "./hub-nav";
import { InquiryBell } from './inquiry-notifications';

const LABELS = {
  'dashboard': 'Moonlight',
  'daily-brief': 'Daily Brief',
  'classin': '클래스인', 'brand': '브랜드', 'pipeline': '업무·파이프라인', 'segments': '세그먼트',
  'work': 'Work', 'calendar': 'Calendar', 'projects': 'Projects', 'decisions': 'Decisions', 'roadmap': 'Roadmap', 'rhythm': 'Rhythm',
  'content': 'Content', 'studio': 'Studio', 'queue': 'Queue', 'campaigns': 'Campaigns',
  'revenue': 'Revenue', 'overview': 'Overview', 'leads': 'Leads', 'deals': 'Deals', 'cases': 'Cases', 'accounts': 'Accounts', 'followups': 'Follow-ups',
  'automations': 'Automations', 'flows': 'Flows', 'email': 'Email', 'webhooks': 'Webhooks', 'runs': 'Runs',
  'agents': 'Agents', 'chat': 'Chat', 'council': 'Council', 'orders': 'Orders',
  'evolution': 'Evolution', 'settings': 'Settings',
  'operations': 'Operations', 'pms': 'PMS', 'playbooks': 'Playbooks', 'command-center': 'Command Center',
  'card-news': 'Card News', 'logs': 'Logs', 'routine': 'Routine',
  'management': 'Manage', 'plan': 'Plan', 'releases': 'Releases', 'assets': 'Assets', 'publish': 'Publish',
  'integrations': 'Integrations', 'activity': 'Activity', 'issues': 'Issues',
};

export function TopBar({ path, view, scope, onNavigate, theme, themePreference, onTheme, onSidebarOpen, onNew, onQuickCapture, navOpen, menuButtonRef, inquiryNotifications, onAdvisorOpen }) {
  const [deferredMenuOpen, setDeferredMenuOpen] = React.useState(false);
  const deferredMenuRef = React.useRef(null);
  const segments = path.split('/').filter(Boolean);
  const navigation = topNavigationForRoute(path, scope, view);
  const pageLabel = navigation.activeTab?.label
    || navigation.anchor?.label
    || LABELS[segments[segments.length - 1]]
    || segments[segments.length - 1];
  const sectionLabel = navigation.activeTab ? navigation.anchor?.label : 'Moonlight';
  const now = new Date();
  const weekday = ['일','월','화','수','목','금','토'][now.getDay()];
  const m = now.getMonth() + 1, d = now.getDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  React.useEffect(() => {
    if (!deferredMenuOpen) return;
    function onDocClick(e) {
      if (deferredMenuRef.current && !deferredMenuRef.current.contains(e.target)) {
        setDeferredMenuOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setDeferredMenuOpen(false);
    }
    document.addEventListener('pointerdown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [deferredMenuOpen]);

  // AI·자동화 등 보류 탭이 많은 앵커는 활성 코어 탭 위주로 노출하고,
  // 보류 탭은 드롭다운으로 접어 상단 탭의 과밀과 '준비 중' 도배를 제거한다.
  const isAiAnchor = navigation.anchor?.key === 'ai';
  const visibleTabs = isAiAnchor
    ? navigation.tabs.filter((tab) => !tab.deferred || tab.key === navigation.activeTab?.key)
    : navigation.tabs;
  const hiddenDeferredTabs = isAiAnchor
    ? navigation.tabs.filter((tab) => tab.deferred && tab.key !== navigation.activeTab?.key)
    : [];

  return (
    <header className="hub-topbar" style={{
      flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line-soft)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div className="hub-topbar__main">
        <IconButton
          className="hub-mobile-only hub-mobile-nav-opener"
          ref={menuButtonRef}
          aria-expanded={navOpen}
          aria-controls="hub-mobile-navigation"
          icon="menu"
          tooltip="내비게이션 열기"
          onClick={onSidebarOpen}
        />

        <div className="hub-topbar__crumbs" style={{ minWidth: 0 }}>
          <span className="hub-topbar__section">{sectionLabel}</span>
          <strong className="hub-topbar__title">{pageLabel}</strong>
        </div>

        <div style={{ flex: 1 }} />

        <div className="hub-topbar__meta" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
          background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
          borderRadius: 999, fontSize: 11.5, color: 'var(--fg-muted)',
        }}>
          <Iconed name="clock" size={12} style={{ color: 'var(--moon-300)' }} />
          <span className="mono" style={{ color: 'var(--fg)' }}>{weekday} · {m}/{d} · {hh}:{mm}</span>
        </div>

        {/* AI 어드바이저 코파일럿 (⌘J) */}
        <IconButton className="hub-topbar__secondary" icon="sparkle" tooltip="AI 어드바이저 (⌘J)" onClick={onAdvisorOpen} />
        {/* 보류 스코프(Agents) 상시 버튼 제거 — 코어 루프(고객 연락)가 그 자리를 갖는다. */}
        <IconButton className="hub-topbar__secondary" icon="signal" tooltip="고객 연락 열기" onClick={() => onNavigate('dashboard/revenue/followups')} />
        <IconButton
          icon={themePreference === 'auto' ? 'clock' : theme === 'dark' ? 'moon' : 'sun'}
          tooltip={themePreference === 'auto'
            ? '테마 자동 (07–18시 밝게) · 밝게 고정하기'
            : themePreference === 'light' ? '밝은 테마 · 어둡게 고정하기' : '어두운 테마 · 자동으로 전환하기'}
          onClick={() => onTheme(themePreference === 'auto' ? 'light' : themePreference === 'light' ? 'dark' : 'auto')}
        />
        <InquiryBell className="hub-topbar__secondary" state={inquiryNotifications} onNavigate={onNavigate} />
        <Button variant="ghost" size="sm" title="빠른 입력 · C" onClick={onQuickCapture}>빠른 입력</Button>
        {!path.startsWith('dashboard/discovery') && <Button className="hub-topbar__primary-action" variant="primary" size="sm" icon="plus" onClick={onNew}>New</Button>}
      </div>

      {navigation.tabs.length > 0 && !pageOwnsTabs(path) && (
        <nav className="hub-topbar__tabs" aria-label={`${navigation.anchor.label} 하위 메뉴`}>
          {visibleTabs.map((tab) => {
            const selected = navigation.activeTab?.key === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onNavigate(tab.path)}
              >
                {tab.label}
                {/* 보류 스코프 마커(README §4) — 코어와 같은 완성 표면처럼 읽히지 않게. */}
                {tab.deferred && (
                  <span style={{ marginLeft: 5, fontSize: 10.5, color: 'var(--fg-faint)', letterSpacing: 0 }}>
                    준비 중
                  </span>
                )}
              </button>
            );
          })}
          {hiddenDeferredTabs.length > 0 && (
            <div ref={deferredMenuRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <button
                type="button"
                className="hub-topbar__deferred-toggle"
                onClick={() => setDeferredMenuOpen((v) => !v)}
                aria-expanded={deferredMenuOpen}
                aria-haspopup="true"
                title="보류된 기능 목록"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0 8px',
                  height: 26,
                  fontSize: 11,
                  color: 'var(--fg-faint)',
                  background: deferredMenuOpen ? 'var(--surface-2)' : 'transparent',
                  border: '1px dashed var(--line-soft)',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  marginLeft: 4,
                }}
              >
                <span>보류 ({hiddenDeferredTabs.length})</span>
                <span style={{ transform: deferredMenuOpen ? 'rotate(180deg)' : 'none', display: 'inline-flex', transition: 'transform var(--dur-hover) var(--ease-hub)' }}>
                  <Iconed name="chevronD" size={10} />
                </span>
              </button>
              {deferredMenuOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 4,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: '0 8px 24px -4px rgba(0,0,0,0.5)',
                  padding: '4px',
                  minWidth: 150,
                  zIndex: 90,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}>
                  <div style={{ padding: '4px 8px', fontSize: 10.5, color: 'var(--fg-faint)', fontWeight: 500 }}>
                    보류된 기능 (준비 중)
                  </div>
                  {hiddenDeferredTabs.map((dt) => (
                    <button
                      key={dt.key}
                      type="button"
                      onClick={() => {
                        setDeferredMenuOpen(false);
                        onNavigate(dt.path);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        fontSize: 12,
                        color: 'var(--fg-muted)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 'var(--r-sm)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--fg)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)'; }}
                    >
                      <span>{dt.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>준비 중</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      )}
    </header>
  );
}

"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import "./hub-tokens.css";

import { Sidebar } from "./hub-sidebar";
import { TopBar } from "./hub-topbar";
import { CommandPalette } from "./hub-command-palette";
import { TweaksPanel } from "./hub-tweaks-panel";
import { LEGACY_TREE, LEGACY_REDIRECTS } from "./hub-data";

import { DailyBrief } from "./pages/daily-brief";
import { Calendar, Decisions, Roadmap, Rhythm } from "./pages/work";
import { Projects } from "./pages/projects";
import { Studio, Queue, Campaigns } from "./pages/content";
import { RevenueOverview, Leads, Deals, Cases, Accounts } from "./pages/revenue";
import { Segments } from "./pages/segments";
import { Followups } from "./pages/followups";
import { AutomationsIndex, EmailAutomation, Webhooks, Runs, Flows } from "./pages/automations";
import { SheetsSync } from "./pages/sheets-sync";
import { AgentsChat, AgentsCouncil, AgentsOrders, AgentsOffice } from "./pages/agents";
import { Evolution, Settings } from "./pages/evolution-settings";

function LegacyPlaceholder({ path, onNavigate }) {
  const hit = LEGACY_TREE.find(x => x.path === path);
  const redirect = LEGACY_REDIRECTS[path];
  const label = hit?.label || (redirect ? path.split('/').slice(-1)[0] : path.split('/').slice(-1)[0]);
  return (
    <div style={{ padding: 'var(--section-gap)', maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div style={{
        padding: 'var(--card-pad)',
        background: 'var(--surface)',
        border: '1px dashed var(--line)',
        borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>Archive · 이동됨</div>
        <div style={{ fontSize: 18, fontWeight: 500, marginTop: 6 }}>{label}</div>
        {redirect ? (
          <>
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              이 경로의 기능은 <span style={{ color: 'var(--moon-200)', fontWeight: 500 }}>{redirect.label}</span> 로 흡수됐어요.
              해당 섹션에서 이어서 작업하시면 됩니다.
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => onNavigate?.(redirect.to)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', fontSize: 12.5, fontWeight: 500,
                color: 'var(--bg)', background: 'var(--moon-200)',
                border: '1px solid var(--moon-100)', borderRadius: 'var(--r-sm)',
                cursor: 'pointer',
              }}>
                {redirect.label} 열기 →
              </button>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>/{path}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              알려진 매핑이 없는 경로입니다. 사이드바에서 정식 섹션을 골라주세요.
            </div>
            <div className="mono" style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-faint)' }}>
              /{path}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const PAGE_MAP = {
  'dashboard/daily-brief': (n) => <DailyBrief onNavigate={n} />,
  'dashboard/work/calendar': () => <Calendar />,
  'dashboard/work/projects': () => <Projects />,
  'dashboard/work/decisions': () => <Decisions />,
  'dashboard/work/roadmap': () => <Roadmap />,
  'dashboard/work/rhythm': () => <Rhythm />,
  'dashboard/content/studio': () => <Studio />,
  'dashboard/content/queue': () => <Queue />,
  'dashboard/content/campaigns': () => <Campaigns />,
  'dashboard/revenue/overview': (n) => <RevenueOverview onNavigate={n} />,
  'dashboard/revenue/leads': () => <Leads />,
  'dashboard/revenue/deals': (n) => <Deals onNavigate={n} />,
  'dashboard/revenue/cases': () => <Cases />,
  'dashboard/revenue/accounts': (n) => <Accounts onNavigate={n} />,
  'dashboard/revenue/followups': () => <Followups />,
  'dashboard/automations': (n) => <AutomationsIndex onNavigate={n} />,
  'dashboard/automations/flows': (n) => <Flows onNavigate={n} />,
  'dashboard/automations/email': (n) => <EmailAutomation onNavigate={n} />,
  'dashboard/automations/webhooks': (n) => <Webhooks onNavigate={n} />,
  'dashboard/automations/runs': () => <Runs />,
  'dashboard/automations/sheets': () => <SheetsSync />,
  'dashboard/agents/chat': (n) => <AgentsChat onNavigate={n} />,
  'dashboard/agents/council': (n) => <AgentsCouncil onNavigate={n} />,
  'dashboard/agents/orders': (n) => <AgentsOrders onNavigate={n} />,
  'dashboard/agents/office': (n) => <AgentsOffice onNavigate={n} />,
  'dashboard/evolution': (n) => <Evolution onNavigate={n} />,
  'dashboard/settings': (n) => <Settings onNavigate={n} />,

  // ── real_v1.1 workspaces → existing pages scoped by org_scope ──
  'dashboard/classin/pipeline': (n) => <Deals workspace="classin" onNavigate={n} />,
  'dashboard/classin/revenue': () => <Leads workspace="classin" />,
  'dashboard/classin/segments': (n) => <Segments workspace="classin" onNavigate={n} />,
  'dashboard/classin/accounts': (n) => <Accounts workspace="classin" onNavigate={n} />,
  'dashboard/classin/followups': () => <Followups />,
  'dashboard/classin/projects': () => <Projects workspace="classin" />,
  'dashboard/classin/automations': () => <SheetsSync />,
  'dashboard/classin/cohorts': () => <Projects workspace="classin" />,   // legacy real_v1 bookmark alias
  'dashboard/classin/content': () => <Queue workspace="classin" />,      // legacy real_v1 bookmark alias
  'dashboard/brand/projects': () => <Projects workspace="brand" />,
  'dashboard/brand/studio': () => <Studio workspace="brand" />,
  'dashboard/brand/queue': () => <Queue workspace="brand" />,
};

const PARENT_JUMP = {
  'dashboard': 'dashboard/daily-brief',
  'dashboard/work': 'dashboard/work/projects',
  'dashboard/content': 'dashboard/content/queue',
  'dashboard/revenue': 'dashboard/revenue/overview',
  'dashboard/agents': 'dashboard/agents/chat',
  'dashboard/classin': 'dashboard/classin/pipeline',
  'dashboard/brand': 'dashboard/brand/projects',
};

export function HubApp() {
  const router = useRouter();
  const pathname = usePathname() || '/dashboard';
  const stripped = pathname.replace(/^\/+/, '').replace(/\/$/, '');
  let path = stripped || 'dashboard';
  if (PARENT_JUMP[path]) path = PARENT_JUMP[path];

  const [collapsed, setCollapsed] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const [density, setDensity] = React.useState('default');
  const [theme, setTheme] = React.useState('dark');
  const [themeTransitionSuppressed, setThemeTransitionSuppressed] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [isMobileViewport, setIsMobileViewport] = React.useState(false);
  const rootRef = React.useRef(null);
  const previousMobileNavOpenRef = React.useRef(false);
  const focusMobileTriggerOnResizeRef = React.useRef(false);
  const focusDesktopSidebarOnResizeRef = React.useRef(false);
  const lastFocusWithinSidebarRef = React.useRef(false);
  const lastFocusWasMobileTriggerRef = React.useRef(false);

  const applyTheme = React.useCallback((nextTheme) => {
    setThemeTransitionSuppressed(true);
    setTheme(nextTheme);
  }, []);

  React.useEffect(() => {
    const d = typeof window !== 'undefined' ? localStorage.getItem('mlp.density') : null;
    const t = typeof window !== 'undefined' ? localStorage.getItem('mlp.theme') : null;
    if (d) setDensity(d);
    if (t) applyTheme(t);
  }, [applyTheme]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('mlp.density', density);
  }, [density]);
  React.useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('mlp.theme', theme);
  }, [theme]);

  React.useLayoutEffect(() => {
    if (!themeTransitionSuppressed) return undefined;
    let secondFrame;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setThemeTransitionSuppressed(false));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [theme, themeTransitionSuppressed]);

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const syncViewport = () => {
      const sidebar = rootRef.current?.querySelector('.hub-sidebar-root');
      if (media.matches && (lastFocusWithinSidebarRef.current || sidebar?.contains(document.activeElement))) {
        focusMobileTriggerOnResizeRef.current = true;
      }
      if (!media.matches && lastFocusWasMobileTriggerRef.current) {
        focusDesktopSidebarOnResizeRef.current = true;
      }
      setIsMobileViewport(media.matches);
      if (!media.matches) setNavOpen(false);
    };
    syncViewport();
    media.addEventListener?.('change', syncViewport);
    return () => media.removeEventListener?.('change', syncViewport);
  }, []);

  const navigate = React.useCallback((p) => {
    const [basePath, suffix = ''] = String(p || '').split(/(?=[?#])/, 2);
    const target = PARENT_JUMP[basePath] || basePath;
    router.push('/' + target + suffix);
    setNavOpen(false);
  }, [router]);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (!isMobileViewport || !navOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMobileViewport, navOpen]);

  React.useLayoutEffect(() => {
    if (!isMobileViewport) {
      previousMobileNavOpenRef.current = false;
      if (focusDesktopSidebarOnResizeRef.current) {
        focusDesktopSidebarOnResizeRef.current = false;
        rootRef.current?.querySelector('.hub-sidebar-root button')?.focus();
      }
      return undefined;
    }

    const wasOpen = previousMobileNavOpenRef.current;
    previousMobileNavOpenRef.current = navOpen;
    if (navOpen) {
      rootRef.current?.querySelector('.hub-sidebar-root button')?.focus();
    } else if (wasOpen || focusMobileTriggerOnResizeRef.current) {
      focusMobileTriggerOnResizeRef.current = false;
      rootRef.current?.querySelector('.hub-mobile-only')?.focus();
    }
    return undefined;
  }, [isMobileViewport, navOpen]);

  const render = PAGE_MAP[path];
  const page = render ? render(navigate) : <LegacyPlaceholder path={path} onNavigate={navigate} />;
  const sidebarCollapsed = collapsed && !navOpen;
  const mobileNavClosed = isMobileViewport && !navOpen;
  const mobileNavOpen = isMobileViewport && navOpen;

  return (
    <div
      ref={rootRef}
      className="hub-app"
      onFocusCapture={(event) => {
        lastFocusWithinSidebarRef.current = Boolean(event.target?.closest?.('.hub-sidebar-root'));
        lastFocusWasMobileTriggerRef.current = Boolean(event.target?.closest?.('.hub-mobile-nav-trigger'));
      }}
      data-theme={theme}
      data-density={density}
      data-theme-switching={themeTransitionSuppressed ? 'true' : 'false'}
    >
      <div className="hub-shell" data-nav-open={navOpen ? 'true' : 'false'}>
        <div
          className="hub-mobile-backdrop"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
        <Sidebar
          className="hub-sidebar-root"
          active={path}
          onNavigate={navigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            if (isMobileViewport) setNavOpen(false);
            else setCollapsed(c => !c);
          }}
          openPalette={() => setPaletteOpen(true)}
          inert={mobileNavClosed}
          ariaHidden={mobileNavClosed}
          toggleTooltip={isMobileViewport ? 'Close navigation' : 'Collapse'}
        />
        <main className="hub-main" inert={mobileNavOpen || undefined} aria-hidden={mobileNavOpen || undefined}>
          <TopBar
            path={path}
            onNavigate={navigate}
            onNew={() => setPaletteOpen(true)}
            onSidebarOpen={() => setNavOpen(true)}
            navOpen={navOpen}
            onTweaksToggle={() => setTweaksOpen(o => !o)}
            density={density}
            onDensity={setDensity}
            theme={theme}
            onTheme={applyTheme}
          />
          <div key={path} className="hub-content scroll-y fade-up">
            {page}
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} />
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} density={density} onDensity={setDensity} />
    </div>
  );
}

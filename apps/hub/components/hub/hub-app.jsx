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
import { AutomationsIndex, EmailAutomation, Webhooks, Runs, Flows } from "./pages/automations";
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
  'dashboard/revenue/overview': () => <RevenueOverview />,
  'dashboard/revenue/leads': () => <Leads />,
  'dashboard/revenue/deals': () => <Deals />,
  'dashboard/revenue/cases': () => <Cases />,
  'dashboard/revenue/accounts': () => <Accounts />,
  'dashboard/automations': (n) => <AutomationsIndex onNavigate={n} />,
  'dashboard/automations/flows': () => <Flows />,
  'dashboard/automations/email': () => <EmailAutomation />,
  'dashboard/automations/webhooks': () => <Webhooks />,
  'dashboard/automations/runs': () => <Runs />,
  'dashboard/agents/chat': () => <AgentsChat />,
  'dashboard/agents/council': () => <AgentsCouncil />,
  'dashboard/agents/orders': () => <AgentsOrders />,
  'dashboard/agents/office': () => <AgentsOffice />,
  'dashboard/evolution': (n) => <Evolution onNavigate={n} />,
  'dashboard/settings': () => <Settings />,
};

const PARENT_JUMP = {
  'dashboard': 'dashboard/daily-brief',
  'dashboard/work': 'dashboard/work/calendar',
  'dashboard/content': 'dashboard/content/studio',
  'dashboard/revenue': 'dashboard/revenue/overview',
  'dashboard/agents': 'dashboard/agents/chat',
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
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    const d = typeof window !== 'undefined' ? localStorage.getItem('mlp.density') : null;
    const t = typeof window !== 'undefined' ? localStorage.getItem('mlp.theme') : null;
    if (d) setDensity(d);
    if (t) setTheme(t);
  }, []);

  React.useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('mlp.density', density);
  }, [density]);
  React.useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('mlp.theme', theme);
  }, [theme]);

  const navigate = React.useCallback((p) => {
    const target = PARENT_JUMP[p] || p;
    router.push('/' + target);
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

  const render = PAGE_MAP[path];
  const page = render ? render(navigate) : <LegacyPlaceholder path={path} onNavigate={navigate} />;
  const sidebarCollapsed = collapsed && !navOpen;

  return (
    <div ref={rootRef} className="hub-app" data-theme={theme} data-density={density}>
      <div className="hub-shell" data-nav-open={navOpen ? 'true' : 'false'}>
        <button
          type="button"
          className="hub-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
        <Sidebar
          className="hub-sidebar-root"
          active={path}
          onNavigate={navigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          openPalette={() => setPaletteOpen(true)}
        />
        <main className="hub-main">
          <TopBar
            path={path}
            onNavigate={navigate}
            onSidebarOpen={() => setNavOpen(true)}
            onTweaksToggle={() => setTweaksOpen(o => !o)}
            density={density}
            onDensity={setDensity}
            theme={theme}
            onTheme={setTheme}
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

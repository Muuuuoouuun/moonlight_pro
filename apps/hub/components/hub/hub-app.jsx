"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import "./hub-tokens.css";

import { Sidebar } from "./hub-sidebar";
import { TopBar } from "./hub-topbar";
import { CommandPalette } from "./hub-command-palette";
import { TweaksPanel } from "./hub-tweaks-panel";
import { LEGACY_TREE } from "./hub-data";

import { DailyBrief } from "./pages/daily-brief";
import { Calendar, Decisions, Roadmap, Rhythm } from "./pages/work";
import { Projects } from "./pages/projects";
import { Studio, Queue, Campaigns } from "./pages/content";
import { RevenueOverview, Leads, Deals, Cases, Accounts } from "./pages/revenue";
import { AutomationsIndex, EmailAutomation, Webhooks, Runs, Flows } from "./pages/automations";
import { AgentsChat, AgentsCouncil, AgentsOrders, AgentsOffice } from "./pages/agents";
import { Evolution, Settings } from "./pages/evolution-settings";

function LegacyPlaceholder({ path }) {
  const hit = LEGACY_TREE.find(x => x.path === path);
  const label = hit?.label || path.split('/').slice(-1)[0];
  return (
    <div style={{ padding: 'var(--section-gap)', maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div style={{
        padding: 'var(--card-pad)',
        background: 'var(--surface)',
        border: '1px dashed var(--line)',
        borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>기타 · Archive</div>
        <div style={{ fontSize: 18, fontWeight: 500, marginTop: 6 }}>{label}</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          이전 구현이 이 경로에 있었습니다. 디자인 시스템 정합 작업이 완료될 때까지 자리만 유지합니다.
          필요하면 해당 기존 페이지를 다시 연결하거나 디자인의 정식 섹션으로 재편성할 수 있어요.
        </div>
        <div className="mono" style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-faint)' }}>
          /{path}
        </div>
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
  'dashboard/evolution': () => <Evolution />,
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
  const page = render ? render(navigate) : <LegacyPlaceholder path={path} />;

  return (
    <div ref={rootRef} className="hub-app" data-theme={theme} data-density={density}>
      <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
        <Sidebar
          active={path}
          onNavigate={navigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          openPalette={() => setPaletteOpen(true)}
        />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TopBar
            path={path}
            onNavigate={navigate}
            density={density}
            onDensity={setDensity}
            theme={theme}
            onTheme={setTheme}
          />
          <div key={path} className="scroll-y fade-up" style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
            {page}
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} />
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} density={density} onDensity={setDensity} />
    </div>
  );
}

"use client";

import React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import "./hub-tokens.css";

import { Sidebar } from "./hub-sidebar";
import { TopBar } from "./hub-topbar";
import { CommandPalette } from "./hub-command-palette";
import { TweaksPanel } from "./hub-tweaks-panel";
import { LEGACY_TREE, LEGACY_REDIRECTS } from "./hub-data";
import {
  DEFAULT_HUB_PREFERENCES,
  persistHubPreference,
  readHubPreferences,
} from "@/lib/hub-preferences";

// Chunk-load placeholder — pages carry their own data loading states, so this
// only covers the (brief) JS fetch. Keep it calm: no spinner, dim mono text.
function PageChunkFallback() {
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', justifyContent: 'center' }}>
      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>불러오는 중…</span>
    </div>
  );
}

// Every page is code-split into its own chunk (route-level lazy load). The
// static imports used to pull all ~20 pages into one client bundle, so first
// paint downloaded revenue+content+daily-brief+… regardless of route.
// Named exports sharing one module (e.g. pages/work) still produce one chunk
// per module — dynamic() just resolves the same import promise.
const lazyPage = (loader) => dynamic(loader, { loading: PageChunkFallback });

const DailyBrief = lazyPage(() => import("./pages/daily-brief").then(m => m.DailyBrief));
const Overview = lazyPage(() => import("./pages/overview").then(m => m.Overview));
const Calendar = lazyPage(() => import("./pages/work").then(m => m.Calendar));
const Decisions = lazyPage(() => import("./pages/work").then(m => m.Decisions));
const Roadmap = lazyPage(() => import("./pages/work").then(m => m.Roadmap));
const Rhythm = lazyPage(() => import("./pages/work").then(m => m.Rhythm));
const MyWork = lazyPage(() => import("./pages/my-work").then(m => m.MyWork));
const Projects = lazyPage(() => import("./pages/projects").then(m => m.Projects));
const Studio = lazyPage(() => import("./pages/content").then(m => m.Studio));
const Queue = lazyPage(() => import("./pages/content").then(m => m.Queue));
const Campaigns = lazyPage(() => import("./pages/content").then(m => m.Campaigns));
const RevenueOverview = lazyPage(() => import("./pages/revenue").then(m => m.RevenueOverview));
const Leads = lazyPage(() => import("./pages/revenue").then(m => m.Leads));
const Deals = lazyPage(() => import("./pages/revenue").then(m => m.Deals));
const Cases = lazyPage(() => import("./pages/revenue").then(m => m.Cases));
const Accounts = lazyPage(() => import("./pages/revenue").then(m => m.Accounts));
const Customers = lazyPage(() => import("./pages/customers").then(m => m.Customers));
const RevenueHeatmap = lazyPage(() => import("./pages/revenue-heatmap").then(m => m.RevenueHeatmap));
const Segments = lazyPage(() => import("./pages/segments").then(m => m.Segments));
const Followups = lazyPage(() => import("./pages/followups").then(m => m.Followups));
const AutomationsIndex = lazyPage(() => import("./pages/automations").then(m => m.AutomationsIndex));
const EmailAutomation = lazyPage(() => import("./pages/automations").then(m => m.EmailAutomation));
const Webhooks = lazyPage(() => import("./pages/automations").then(m => m.Webhooks));
const Runs = lazyPage(() => import("./pages/automations").then(m => m.Runs));
const Flows = lazyPage(() => import("./pages/automations").then(m => m.Flows));
const SheetsSync = lazyPage(() => import("./pages/sheets-sync").then(m => m.SheetsSync));
const AgentsChat = lazyPage(() => import("./pages/agents").then(m => m.AgentsChat));
const AgentsCouncil = lazyPage(() => import("./pages/agents").then(m => m.AgentsCouncil));
const AgentsOrders = lazyPage(() => import("./pages/agents").then(m => m.AgentsOrders));
const Evolution = lazyPage(() => import("./pages/evolution-settings").then(m => m.Evolution));
const Settings = lazyPage(() => import("./pages/evolution-settings").then(m => m.Settings));

// Idle prefetch — the flip side of code splitting is a chunk fetch (and the
// "불러오는 중…" flash) on first navigation to a page. After the current page
// settles, warm the daily-loop pages during browser idle time so those
// navigations render instantly. Everything else (agents, automations,
// settings, …) stays strictly on-demand to keep the prefetch budget small.
// import() dedupes against dynamic()'s loader, so this fills the same module
// cache the router reads from; failures are harmless (navigation just
// re-fetches).
const PREFETCH_PAGES = [
  () => import("./pages/daily-brief"),
  () => import("./pages/my-work"),
  () => import("./pages/revenue"),
  () => import("./pages/projects"),
  () => import("./pages/overview"),
];

function useIdlePagePrefetch() {
  React.useEffect(() => {
    let cancelled = false;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    // One module per idle slot — never compete with user-initiated work.
    let queue = [...PREFETCH_PAGES];
    let handle;
    const pump = () => {
      if (cancelled || !queue.length) return;
      const load = queue.shift();
      load().catch(() => {}).finally(() => { if (!cancelled) handle = idle(pump); });
    };
    handle = idle(pump);
    return () => { cancelled = true; cancelIdle(handle); };
  }, []);
}

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
  'dashboard/overview': (n) => <Overview onNavigate={n} />,
  'dashboard/work/my': (n) => <MyWork onNavigate={n} />,
  'dashboard/work/calendar': () => <Calendar />,
  'dashboard/work/projects': () => <Projects />,
  'dashboard/work/decisions': () => <Decisions />,
  'dashboard/work/roadmap': () => <Roadmap />,
  'dashboard/work/rhythm': () => <Rhythm />,
  'dashboard/content/studio': () => <Studio />,
  'dashboard/content/queue': () => <Queue />,
  'dashboard/content/campaigns': () => <Campaigns />,
  'dashboard/revenue/overview': (n) => <RevenueOverview onNavigate={n} />,
  'dashboard/revenue/customers': (n) => <Customers onNavigate={n} />,
  'dashboard/revenue/heatmap': (n) => <RevenueHeatmap onNavigate={n} />,
  'dashboard/revenue/leads': () => <Leads />,
  'dashboard/revenue/deals': (n) => <Deals onNavigate={n} />,
  'dashboard/revenue/cases': () => <Cases />,
  'dashboard/revenue/accounts': (n) => <Accounts onNavigate={n} />,
  'dashboard/revenue/followups': (n) => <Followups onNavigate={n} />,
  'dashboard/automations': (n) => <AutomationsIndex onNavigate={n} />,
  'dashboard/automations/flows': (n) => <Flows onNavigate={n} />,
  'dashboard/automations/email': (n) => <EmailAutomation onNavigate={n} />,
  'dashboard/automations/webhooks': (n) => <Webhooks onNavigate={n} />,
  'dashboard/automations/runs': () => <Runs />,
  'dashboard/automations/sheets': () => <SheetsSync />,
  'dashboard/agents/chat': (n) => <AgentsChat onNavigate={n} />,
  'dashboard/agents/council': (n) => <AgentsCouncil onNavigate={n} />,
  'dashboard/agents/orders': (n) => <AgentsOrders onNavigate={n} />,
  'dashboard/evolution': (n) => <Evolution onNavigate={n} />,
  'dashboard/settings': (n) => <Settings onNavigate={n} />,

  // ── real_v1.1 workspaces → existing pages scoped by org_scope ──
  'dashboard/classin/pipeline': (n) => <Deals workspace="classin" onNavigate={n} />,
  'dashboard/classin/revenue': () => <Leads workspace="classin" />,
  'dashboard/classin/segments': (n) => <Segments workspace="classin" onNavigate={n} />,
  'dashboard/classin/accounts': (n) => <Accounts workspace="classin" onNavigate={n} />,
  'dashboard/classin/followups': (n) => <Followups onNavigate={n} />,
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
  useIdlePagePrefetch();
  const router = useRouter();
  const pathname = usePathname() || '/dashboard';
  const searchParams = useSearchParams();
  const stripped = pathname.replace(/^\/+/, '').replace(/\/$/, '');
  let path = stripped || 'dashboard';
  if (PARENT_JUMP[path]) path = PARENT_JUMP[path];

  // The Projects surface is shared by two sidebar anchors (할 일 · 프로젝트·기획);
  // `view` is what tells them apart, so the shell has to hand it to the sidebar.
  const view = searchParams.get('view');

  const [collapsed, setCollapsed] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  // SSR and the first client render must use the same values. Persisted browser
  // preferences are restored only after hydration, then written synchronously
  // from user actions so StrictMode cannot clobber them with the defaults.
  const [density, setDensity] = React.useState(DEFAULT_HUB_PREFERENCES.density);
  const [theme, setTheme] = React.useState(DEFAULT_HUB_PREFERENCES.theme);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    let storage = null;
    try { storage = window.localStorage; } catch { /* storage can be blocked */ }
    const stored = readHubPreferences(storage);
    setDensity(stored.density);
    setTheme(stored.theme);
  }, []);

  const updateDensity = React.useCallback((nextDensity) => {
    setDensity(nextDensity);
    let storage = null;
    try { storage = window.localStorage; } catch { /* storage can be blocked */ }
    persistHubPreference(storage, 'density', nextDensity);
  }, []);

  const updateTheme = React.useCallback((nextTheme) => {
    setTheme(nextTheme);
    let storage = null;
    try { storage = window.localStorage; } catch { /* storage can be blocked */ }
    persistHubPreference(storage, 'theme', nextTheme);
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
          view={view}
          onNavigate={navigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          openPalette={() => setPaletteOpen(true)}
        />
        <main className="hub-main">
          <TopBar
            path={path}
            onNavigate={navigate}
            onNew={() => setPaletteOpen(true)}
            onSidebarOpen={() => setNavOpen(true)}
            onTweaksToggle={() => setTweaksOpen(o => !o)}
            density={density}
            onDensity={updateDensity}
            theme={theme}
            onTheme={updateTheme}
          />
          <div key={path} className="hub-content scroll-y fade-up">
            {page}
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} />
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} density={density} onDensity={updateDensity} />
    </div>
  );
}

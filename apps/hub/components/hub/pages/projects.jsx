"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar, EmptyState } from "../hub-primitives";
import { requestCouncilAdvice, councilChatPath, COUNCIL_MODE_LABEL, COUNCIL_PREVIEW_NOTE } from "../council-client";
import {
  BRANDS as FALLBACK_BRANDS,
  BRAND_PROJECTS as FALLBACK_PROJECTS,
  BRAND_TODOS as FALLBACK_TODOS,
  KANBAN_COLUMNS as FALLBACK_COLUMNS,
} from "../hub-data";
import {
  getWorkspace,
  filterBrandsByWorkspace,
  filterProjectsByWorkspace,
  filterTodosByWorkspace,
} from "../workspace-map";

// PMS Board persistence key — localStorage v1 (see cols state + effect below).
const PMS_BOARD_STORAGE_KEY = 'hub:pms-board:v1';

const EMPTY_ALL_BRAND = {
  key: 'all',
  id: 'all',
  name: '전체 브랜드',
  glyph: '◐',
  tone: 'moon',
  kind: 'index',
  desc: '모든 프로젝트',
  projects: 0,
  tasks: 0,
  open: 0,
  changes: 0,
};

function DetailSection({ title, count = 0, empty, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>{title}</span>
        <span className="mono" style={{ color: 'var(--fg-faint)' }}>{count}</span>
      </div>
      {count > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
      ) : (
        <div style={{ padding: '10px 11px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg-faint)', fontSize: 11.5 }}>
          {empty}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ title, body, meta, badge, tone = 'neutral' }) {
  return (
    <div style={{ padding: '9px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {badge && <Badge tone={tone} size="xs">{badge}</Badge>}
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.2, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {meta && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{meta}</span>}
      </div>
      {body && (
        <div style={{ marginTop: 5, color: 'var(--fg-muted)', fontSize: 11.5, lineHeight: 1.45 }}>
          {body}
        </div>
      )}
    </div>
  );
}

const COUNCIL_MODES = [
  { k: 'brand-strategy', l: '브랜드 전략' },
  { k: 'audience-analysis', l: '오디언스 분석' },
  { k: 'flow-review', l: '플로우 점검' },
  { k: 'meeting-synthesis', l: '회의록 정리' },
];

// Council brand advisor — the brand-side counterpart of revenue.jsx's GuruCoachPanel.
// Modes cover brand strategy, audience(고객) analysis, flow review, and meeting-note synthesis.
// meeting-synthesis takes pasted notes as the draft; the others read the assembled brand context.
function CouncilBrandPanel({ router, focusRef = null, focusLabel = null }) {
  const [mode, setMode] = React.useState('brand-strategy');
  const [notes, setNotes] = React.useState('');
  const [res, setRes] = React.useState({ state: 'idle', text: '', note: '' });
  const needsNotes = mode === 'meeting-synthesis';

  const run = async () => {
    setRes({ state: 'loading', text: '', note: '' });
    const draft = needsNotes ? notes.trim() : null;
    const r = await requestCouncilAdvice({ mode, ref: focusRef, draft });
    if (r.state === 'done') setRes({ state: 'done', text: r.text, note: '' });
    else setRes({ state: r.state, text: '', note: r.note || '' });
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Council 자문</div>
            <Badge tone="moon" size="xs">브랜드 advisor</Badge>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>
            {focusLabel ? `${focusLabel} · ` : ''}콘텐츠·브랜드·프로젝트 원장 기반 추천 조언
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="sparkle" disabled={res.state === 'loading' || (needsNotes && !notes.trim())} onClick={run}>
          {res.state === 'loading' ? '자문 중…' : COUNCIL_MODE_LABEL[mode]}
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: needsNotes || res.state !== 'idle' ? 12 : 0 }}>
        {COUNCIL_MODES.map(m => (
          <button key={m.k} onClick={() => setMode(m.k)} style={{
            padding: '5px 11px', fontSize: 11.5, borderRadius: 999,
            border: '1px solid ' + (mode === m.k ? 'var(--moon-500)' : 'var(--line-soft)'),
            background: mode === m.k ? 'var(--surface-3)' : 'var(--surface-2)',
            color: mode === m.k ? 'var(--fg)' : 'var(--fg-muted)',
          }}>{m.l}</button>
        ))}
      </div>
      {needsNotes && (
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="회의록·메모를 붙여넣으면 결정·오너·기한이 분명한 액션으로 정리합니다."
          rows={3} style={{
            width: '100%', resize: 'vertical', marginBottom: res.state !== 'idle' ? 12 : 0,
            background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
            color: 'var(--fg)', fontSize: 12.5, lineHeight: 1.5, padding: 10, outline: 'none', fontFamily: 'inherit',
          }} />
      )}
      {res.state === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--moon-300)', boxShadow: '0 0 8px var(--moon-300)', animation: 'mlMoonPulse 1.2s ease-in-out infinite' }} />
          원장·브랜드 보이스를 읽고 자문을 정리하는 중…
        </div>
      )}
      {res.state === 'done' && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{res.text}</div>
          <div style={{ marginTop: 12 }}>
            <Button variant="outline" size="xs" iconRight="arrowRight" onClick={() => router.push('/' + councilChatPath({ mode, ref: focusRef }))}>Chat에서 이어가기</Button>
          </div>
        </div>
      )}
      {(res.state === 'preview' || res.state === 'error') && (
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          <Badge tone={res.state === 'preview' ? 'neutral' : 'danger'} size="xs">{res.state === 'preview' ? 'preview' : 'error'}</Badge>
          <span style={{ marginLeft: 8 }}>{res.state === 'preview' ? COUNCIL_PREVIEW_NOTE : res.note}</span>
        </div>
      )}
    </Card>
  );
}

export function Projects({ workspace }) {
  const ws = getWorkspace(workspace);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Council advisor is brand-side; keep it off the ClassIn sales lane (that's Guru's domain).
  // 회사(company) workspace was absorbed into classin — see workspace-map.js.
  const councilEnabled = workspace !== 'classin';
  const [brand, setBrand] = React.useState('all');
  const [view, setView] = React.useState('tree');
  const [ledger, setLedger] = React.useState({
    source: 'mock',
    brands: FALLBACK_BRANDS,
    projects: FALLBACK_PROJECTS,
    updates: [],
    decisions: [],
    notes: [],
    checks: [],
    columns: FALLBACK_COLUMNS,
  });
  const [todos, setTodos] = React.useState(FALLBACK_TODOS);
  const [drag, setDrag] = React.useState(null);
  // localStorage v1 — DB(tasks 테이블) 승격은 보드↔태스크 매핑 설계 후.
  const [cols, setCols] = React.useState(() => {
    if (typeof window === 'undefined') return FALLBACK_COLUMNS;
    try {
      const saved = window.localStorage.getItem(PMS_BOARD_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length ? parsed : FALLBACK_COLUMNS;
    } catch {
      return FALLBACK_COLUMNS;
    }
  });
  const [expanded, setExpanded] = React.useState(() => new Set(['pm-1', 'bm-1']));
  const [openDetail, setOpenDetail] = React.useState(null);
  const [brandMenuOpen, setBrandMenuOpen] = React.useState(false);
  const [sidebarHidden, setSidebarHidden] = React.useState(false);
  const [syncState, setSyncState] = React.useState('mock');
  const brandMenuRef = React.useRef(null);
  const createdFromQueryRef = React.useRef(false);
  const [orderPending, setOrderPending] = React.useState(false);
  const [orderResult, setOrderResult] = React.useState(null); // { tone: 'ok'|'err', label }

  const formatTime = (d) => {
    try {
      return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    } catch {
      return d.toISOString().slice(11, 19);
    }
  };

  async function sendProjectOrder(project) {
    if (!project || orderPending) return;
    setOrderPending(true);
    setOrderResult(null);
    const startedAt = Date.now();
    try {
      const response = await fetch('/api/projects/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, status: project.status, title: project.name }),
      });
      const data = await response.json().catch(() => ({}));
      const elapsed = Date.now() - startedAt;
      if (elapsed < 100) await new Promise(r => setTimeout(r, 100 - elapsed));

      if (response.ok || data.status === 'saved' || data.status === 'preview') {
        setOrderResult({ tone: 'ok', label: `↗ ${formatTime(new Date())}` });
      } else {
        setOrderResult({ tone: 'err', label: data.error || data.message || `실패 ${response.status}` });
      }
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    } finally {
      setOrderPending(false);
    }
  }

  const isLiveLedger = ledger.source === 'supabase';
  const rawBrands = isLiveLedger
    ? (ledger.brands?.length ? ledger.brands : [EMPTY_ALL_BRAND])
    : (ledger.brands?.length ? ledger.brands : FALLBACK_BRANDS);
  const rawProjects = isLiveLedger
    ? (Array.isArray(ledger.projects) ? ledger.projects : [])
    : (ledger.projects?.length ? ledger.projects : FALLBACK_PROJECTS);
  // Workspace scope: restrict to this workspace's brands/projects/todos.
  // With no workspace, the filters return their input unchanged (global behavior).
  const brands = ws ? filterBrandsByWorkspace(rawBrands, workspace) : rawBrands;
  const allProjects = ws ? filterProjectsByWorkspace(rawProjects, workspace) : rawProjects;
  const scopedTodos = ws ? filterTodosByWorkspace(todos, workspace) : todos;
  // Scoped 'all' = first brand in this workspace, or its scoped 'all' index.
  const wsDefaultBrand = ws
    ? (brands.find(b => b.key !== 'all')?.key || brands[0]?.key || 'all')
    : 'all';
  const projects = brand === 'all' ? allProjects : allProjects.filter(p => p.brand === brand);
  const brandTodos = brand === 'all' ? scopedTodos : scopedTodos.filter(t => t.brand === brand);
  const currentBrand = brands.find(b => b.key === brand) || brands[0] || EMPTY_ALL_BRAND;

  React.useEffect(() => {
    let active = true;

    async function loadLedger() {
      setSyncState('loading');
      try {
        const response = await fetch('/api/hub/projects', { cache: 'no-store' });
        const data = await response.json().catch(() => null);

        if (!active || !response.ok || !data || data.status === 'error') {
          if (active) setSyncState('mock');
          return;
        }

        if (data.source === 'supabase') {
          const liveProjects = Array.isArray(data.projects) ? data.projects : [];
          const liveColumns = Array.isArray(data.columns) ? data.columns : [];
          setLedger({
            source: data.source,
            brands: data.brands?.length ? data.brands : [EMPTY_ALL_BRAND],
            projects: liveProjects,
            updates: Array.isArray(data.updates) ? data.updates : [],
            decisions: Array.isArray(data.decisions) ? data.decisions : [],
            notes: Array.isArray(data.notes) ? data.notes : [],
            checks: Array.isArray(data.checks) ? data.checks : [],
            columns: liveColumns,
          });
          setTodos(Array.isArray(data.todos) ? data.todos : []);
          setCols(liveColumns);
          setExpanded(new Set(liveProjects.slice(0, 2).map(p => p.id)));
          setSyncState('live');
        } else {
          setSyncState('mock');
        }
      } catch {
        if (active) setSyncState('mock');
      }
    }

    loadLedger();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!brands.some(b => b.key === brand)) {
      setBrand(wsDefaultBrand);
    }
  }, [brand, brands, wsDefaultBrand]);

  const toggleTodo = (id) => setTodos(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const createProject = React.useCallback((status = 'In progress') => {
    const id = `local-project-${Date.now()}`;
    const projectBrand = brand === 'all' ? (brands.find(b => b.key !== 'all')?.key || 'moonpm') : brand;
    const project = {
      id,
      brand: projectBrand,
      name: '새 프로젝트',
      status,
      progress: 0,
      due: '이번주',
      owner: 'Me',
      tag: null,
      tasks: 0,
      done: 0,
    };
    setLedger(prev => ({ ...prev, projects: [project, ...(prev.projects || [])] }));
    setExpanded(prev => new Set([...prev, id]));
    setOpenDetail(id);
    setView('tree');
  }, [brand, brands]);

  const createTodo = React.useCallback((projectId = openDetail) => {
    const project = allProjects.find(p => p.id === projectId) || projects[0] || allProjects[0];
    const todoBrand = project?.brand || (brand === 'all' ? 'moonpm' : brand);
    const todoProject = project?.id || 'inbox';
    const id = `local-todo-${Date.now()}`;
    setTodos(prev => [{
      id,
      brand: todoBrand,
      project: todoProject,
      title: '새 할 일',
      due: '오늘',
      done: false,
      priority: 'med',
      assignee: 'Me',
    }, ...prev]);
    if (project?.id) {
      setExpanded(prev => new Set([...prev, project.id]));
      setOpenDetail(project.id);
    }
  }, [allProjects, brand, openDetail, projects]);

  const moveCard = (cardId, toCol) => {
    setCols(cs => {
      let card;
      const next = cs.map(c => ({ ...c, cards: c.cards.filter(x => { if (x.id === cardId) { card = x; return false; } return true; }) }));
      if (card) { const t = next.find(c => c.key === toCol); if (t) t.cards = [card, ...t.cards]; }
      return next;
    });
  };

  const createBoardCard = React.useCallback((colKey) => {
    const id = `local-card-${Date.now()}`;
    setCols(prev => prev.map(col => (
      col.key === colKey
        ? {
          ...col,
          cards: [{
            id,
            title: '새 카드',
            tag: null,
            priority: 'med',
            project: currentBrand?.name || 'Moonlight',
            due: 'Today',
          }, ...col.cards],
        }
        : col
    )));
    setView('board');
  }, [currentBrand]);

  // localStorage v1 — DB(tasks 테이블) 승격은 보드↔태스크 매핑 설계 후.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PMS_BOARD_STORAGE_KEY, JSON.stringify(cols));
    } catch {
      // quota or serialization errors — ignore, board still works in-memory.
    }
  }, [cols]);

  const resetBoard = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(PMS_BOARD_STORAGE_KEY); } catch { /* ignore */ }
    }
    setCols(FALLBACK_COLUMNS);
  }, []);

  const statusTone = { 'In progress': 'info', Review: 'warning', Planning: 'moon', Backlog: 'neutral', Blocked: 'danger', Done: 'success' };
  const prioTone = { critical: 'danger', high: 'danger', med: 'warning', medium: 'warning', low: 'neutral' };
  const updateTone = { reported: 'neutral', active: 'info', blocked: 'danger', done: 'success' };
  const checkTone = { pending: 'neutral', done: 'success', skipped: 'warning', blocked: 'danger' };

  React.useEffect(() => {
    const close = (e) => { if (brandMenuRef.current && !brandMenuRef.current.contains(e.target)) setBrandMenuOpen(false); };
    if (brandMenuOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [brandMenuOpen]);

  React.useEffect(() => {
    if (searchParams.get('new') !== 'project' || createdFromQueryRef.current) return;
    createProject();
    createdFromQueryRef.current = true;
  }, [createProject, searchParams]);

  return (
    <div className="hub-workspace-shell" style={{ display: 'grid', gridTemplateColumns: sidebarHidden ? '1fr' : '240px 1fr', height: '100%', overflow: 'hidden' }}>
      {!sidebarHidden && (
      <aside style={{ borderRight: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-faint)' }}>Brands</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>브랜드 포맷 · {Math.max(0, brands.length - 1)}개</div>
          </div>
          <IconButton icon="chevronL" size={24} iconSize={13} onClick={() => setSidebarHidden(true)} tooltip="접기" />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {brands.map(b => {
            const active = brand === b.key;
            const count = b.key === 'all' ? allProjects.length : (b.projects || 0);
            const changes = b.key === 'all'
              ? brands.filter(x => x.key !== 'all').reduce((s, x) => s + (x.changes || 0), 0)
              : (b.changes || 0);
            return (
              <button key={b.key} onClick={() => setBrand(b.key)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', marginBottom: 1,
                background: active ? 'var(--surface-3)' : 'transparent',
                border: active ? '1px solid var(--line)' : '1px solid transparent',
                borderRadius: 'var(--r-sm)', textAlign: 'left',
                color: active ? 'var(--fg)' : 'var(--fg-muted)',
                position: 'relative',
              }}>
                <span style={{ fontSize: 15, width: 20, textAlign: 'center', position: 'relative' }}>
                  {b.glyph}
                  {changes > 0 && (
                    <span style={{
                      position: 'absolute', top: -3, right: -3,
                      width: 7, height: 7, borderRadius: 999,
                      background: 'var(--danger)',
                      boxShadow: '0 0 0 2px ' + (active ? 'var(--surface-3)' : 'var(--surface)'),
                    }} />
                  )}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                {changes > 0 && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                    minWidth: 16, height: 14, padding: '0 5px',
                    borderRadius: 999, background: 'var(--danger)', color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    letterSpacing: '-0.02em',
                  }}>{changes > 99 ? '99+' : changes}</span>
                )}
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', background: active ? 'var(--surface)' : 'transparent', padding: '1px 5px', borderRadius: 4 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </aside>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="hub-page-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {sidebarHidden && (
            <IconButton icon="chevronR" size={28} iconSize={14} onClick={() => setSidebarHidden(false)} tooltip="브랜드 사이드바 펼치기" />
          )}
          <div ref={brandMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => setBrandMenuOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px 6px 8px',
              background: brandMenuOpen ? 'var(--surface-3)' : 'var(--surface-2)',
              border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
              color: 'var(--fg)', cursor: 'pointer', position: 'relative',
            }}>
              <span style={{ fontSize: 16, position: 'relative' }}>
                {currentBrand.glyph}
                {(() => {
                  const totalChanges = brands.filter(b => b.key !== 'all').reduce((s, b) => s + (b.changes || 0), 0);
                  if (brand === 'all' && totalChanges > 0) {
                    return (
                      <span style={{
                        position: 'absolute', top: -4, right: -6,
                        minWidth: 14, height: 14, padding: '0 4px',
                        borderRadius: 999, background: 'var(--danger)', color: '#fff',
                        fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 2px var(--surface-2)',
                      }}>{totalChanges}</span>
                    );
                  }
                  if (brand !== 'all' && currentBrand.changes > 0) {
                    return (
                      <span style={{
                        position: 'absolute', top: -4, right: -6,
                        minWidth: 14, height: 14, padding: '0 4px',
                        borderRadius: 999, background: 'var(--danger)', color: '#fff',
                        fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 2px var(--surface-2)',
                      }}>{currentBrand.changes}</span>
                    );
                  }
                  return null;
                })()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em' }}>{currentBrand.name}</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--line-soft)' }}>
                {brand === 'all' ? allProjects.length : (currentBrand.projects || 0)}
              </span>
              <span style={{ fontSize: 9, color: 'var(--fg-faint)', marginLeft: 2, transform: brandMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
            </button>
            {brandMenuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                minWidth: 260,
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 'var(--r)', boxShadow: '0 12px 40px -12px oklch(0 0 0 / 0.5)',
                padding: 4, display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ padding: '6px 10px 4px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>브랜드 몰아보기</div>
                {brands.map(b => {
                  const active = brand === b.key;
                  const count = b.key === 'all' ? allProjects.length : (b.projects || 0);
                  const bTodos = scopedTodos.filter(t => b.key === 'all' || t.brand === b.key).filter(t => !t.done).length;
                  const changes = b.key === 'all'
                    ? brands.filter(x => x.key !== 'all').reduce((s, x) => s + (x.changes || 0), 0)
                    : (b.changes || 0);
                  return (
                    <button key={b.key} onClick={() => { setBrand(b.key); setBrandMenuOpen(false); }} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 'var(--r-sm)',
                      background: active ? 'var(--surface-3)' : 'transparent',
                      textAlign: 'left', color: active ? 'var(--fg)' : 'var(--fg-muted)',
                      cursor: 'pointer', position: 'relative',
                    }}>
                      <span style={{ fontSize: 16, width: 22, textAlign: 'center', position: 'relative' }}>
                        {b.glyph}
                        {changes > 0 && (
                          <span style={{
                            position: 'absolute', top: -3, right: -2,
                            width: 8, height: 8, borderRadius: 999,
                            background: 'var(--danger)',
                            boxShadow: '0 0 0 2px var(--surface)',
                          }} />
                        )}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12.5, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                          {changes > 0 && (
                            <span style={{
                              fontSize: 9.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                              minWidth: 16, height: 14, padding: '0 5px',
                              borderRadius: 999, background: 'var(--danger)', color: '#fff',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              letterSpacing: '-0.02em',
                            }}>{changes > 99 ? '99+' : changes}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {changes > 0 ? `${changes}개 새 변동 · ${b.desc || '전체 브랜드 포맷'}` : (b.desc || '전체 브랜드 포맷')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{count}p</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{bTodos}t</span>
                      </div>
                      {active && <span style={{ fontSize: 11, color: 'var(--moon-300)' }}>✓</span>}
                    </button>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 4, padding: '6px 10px', fontSize: 10.5, color: 'var(--fg-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>사이드바로 전환</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setSidebarHidden(false); setBrandMenuOpen(false); }}
                    style={{ fontSize: 10.5, color: 'var(--moon-300)', padding: '2px 6px', borderRadius: 4 }}>펼치기</button>
                </div>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
              {projects.length} projects · {brandTodos.filter(t => !t.done).length} open todos · {currentBrand.desc}
              <span className="mono" style={{ marginLeft: 8, color: syncState === 'live' ? 'var(--success)' : syncState === 'loading' ? 'var(--warning)' : 'var(--fg-faint)' }}>
                {syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : 'mock'}
              </span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
            {[{k:'tree',l:'List'},{k:'board',l:'Board'},{k:'todos',l:'To-dos'}].map(t => (
              <button key={t.k} onClick={() => setView(t.k)} style={{
                padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
                color: view === t.k ? 'var(--fg)' : 'var(--fg-faint)',
                background: view === t.k ? 'var(--surface-3)' : 'transparent',
              }}>{t.l}</button>
            ))}
          </div>
          {view === 'board' && (
            <Button variant="ghost" size="sm" onClick={resetBoard}>보드 초기화</Button>
          )}
          <Button variant="primary" size="sm" icon="plus" onClick={() => view === 'todos' ? createTodo() : createProject()}>{view === 'todos' ? 'To-do' : 'Project'}</Button>
        </div>

        {view === 'tree' && (
          <div className="hub-projects-main-grid" style={{ display: 'grid', gridTemplateColumns: openDetail ? '1fr 360px' : '1fr', flex: 1, overflow: 'hidden' }}>
            <div className="scroll-y" style={{ padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                {councilEnabled && <CouncilBrandPanel router={router} />}
                {projects.length === 0 && ws && allProjects.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon="projects"
                      title={`${ws.label} — 아직 연결된 프로젝트가 없습니다.`}
                      description="브랜드를 이 워크스페이스에 연결하면 여기에 표시됩니다."
                    />
                  </Card>
                ) : projects.length === 0 && (
                  <Card>
                    <EmptyState
                      icon="projects"
                      title="프로젝트 원장이 비어 있습니다"
                      description="Supabase 연결은 live 상태입니다. 첫 프로젝트를 만들거나 외부 project webhook을 보내면 이 목록에 바로 표시됩니다."
                      action={<Button variant="primary" size="sm" icon="plus" onClick={() => createProject()}>Project</Button>}
                    />
                  </Card>
                )}
                {[
                  { key: 'In progress', label: '진행중', tone: 'var(--info)' },
                  { key: 'Blocked',     label: '막힘',   tone: 'var(--danger)' },
                  { key: 'Review',      label: '검토',   tone: 'var(--warning)' },
                  { key: 'Planning',    label: '계획',   tone: 'var(--moon-400)' },
                  { key: 'Done',        label: '완료',   tone: 'var(--success)' },
                  { key: 'Backlog',     label: '백로그', tone: 'var(--fg-faint)' },
                ].map(group => {
                  const groupProjects = projects.filter(p => p.status === group.key);
                  if (!groupProjects.length) return null;
                  return (
                    <div key={group.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 3, height: 14, background: group.tone, borderRadius: 2 }} />
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{group.label}</div>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{groupProjects.length}</span>
                      </div>
                      <Card pad={false} className="hub-table-card">
                        <div style={{
                          display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                          padding: '8px 14px', background: 'var(--surface-2)',
                          borderBottom: '1px solid var(--line-soft)',
                          fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em',
                          alignItems: 'center', gap: 8,
                        }}>
                          <span /><span />
                          <span>프로젝트 / 하위 아이템</span>
                          <span style={{ textAlign: 'center' }}>Own</span>
                          <span>기한</span>
                          <span>작업 상태</span>
                        </div>
                        {groupProjects.map((p, pi) => {
                          const isOpen = expanded.has(p.id);
                          const pTodos = scopedTodos.filter(t => t.project === p.id);
                          const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
                          const isSel = openDetail === p.id;
                          return (
                            <React.Fragment key={p.id}>
                              <div style={{
                                display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                padding: '10px 14px', alignItems: 'center', gap: 8,
                                borderBottom: (isOpen || pi < groupProjects.length - 1) ? '1px solid var(--line-soft)' : 'none',
                                background: isSel ? 'var(--surface-3)' : 'transparent',
                                cursor: 'pointer',
                              }}
                                onClick={() => setOpenDetail(p.id === openDetail ? null : p.id)}
                              >
                                <button onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }} style={{
                                  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: 'var(--fg-muted)', borderRadius: 4,
                                }}>
                                  <span style={{ display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10 }}>▶</span>
                                </button>
                                <input type="checkbox" style={{ margin: 0, accentColor: 'var(--moon-400)' }} onClick={e => e.stopPropagation()} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <span style={{ fontSize: 14 }}>{pBrand.glyph}</span>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                  </div>
                                  <span className="mono" style={{
                                    fontSize: 10, color: 'var(--fg-faint)',
                                    background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4,
                                    border: '1px solid var(--line-soft)',
                                  }}>{pTodos.length}</span>
                                  <div style={{ width: 60, height: 4, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                                    <div style={{ width: p.progress + '%', height: '100%', background: statusTone[p.status] === 'warning' ? 'var(--warning)' : 'var(--moon-400)' }} />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <Avatar name={p.owner} size={22} tone={p.owner === 'Me' ? 'moon' : p.owner === 'Council' ? 'info' : 'neutral'} />
                                </div>
                                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{p.due}</span>
                                <div><Badge tone={statusTone[p.status]} size="xs">{p.status === 'In progress' ? '작업 중' : p.status === 'Review' ? '검토' : p.status === 'Planning' ? '계획' : p.status === 'Blocked' ? '막힘' : p.status === 'Done' ? '완료' : p.status}</Badge></div>
                              </div>

                              {isOpen && (
                                <div style={{ background: 'var(--surface-2)', borderBottom: pi < groupProjects.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                                  <div style={{
                                    display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                    padding: '6px 14px 6px 44px', gap: 8, alignItems: 'center',
                                    fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em',
                                    borderBottom: '1px solid var(--line-soft)',
                                  }}>
                                    <span /><span /><span>하위 아이템</span><span style={{ textAlign: 'center' }}>Own</span><span>기한</span><span>상태</span>
                                  </div>
                                  {pTodos.length === 0 && (
                                    <div style={{ padding: '10px 14px 10px 66px', fontSize: 11.5, color: 'var(--fg-faint)' }}>하위 아이템이 없습니다.</div>
                                  )}
                                  {pTodos.map((t, ti) => (
                                    <div key={t.id} style={{
                                      display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                      padding: '8px 14px 8px 44px', alignItems: 'center', gap: 8,
                                      borderBottom: ti < pTodos.length - 1 ? '1px solid var(--line-soft)' : 'none',
                                      opacity: t.done ? 0.55 : 1,
                                    }}>
                                      <span />
                                      <button onClick={() => toggleTodo(t.id)} style={{
                                        width: 14, height: 14, borderRadius: 3,
                                        border: '1.5px solid ' + (t.done ? 'var(--success)' : 'var(--line-strong)'),
                                        background: t.done ? 'var(--success)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        {t.done && <span style={{ fontSize: 9, color: 'var(--bg)' }}>✓</span>}
                                      </button>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Dot tone={prioTone[t.priority]} size={4} />
                                        <span style={{ fontSize: 12.5, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <Avatar name={t.assignee} size={18} tone={t.assignee === 'Me' ? 'moon' : t.assignee === 'Council' ? 'info' : 'neutral'} />
                                      </div>
                                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{t.due}</span>
                                      <Badge tone={t.done ? 'success' : 'neutral'} size="xs">{t.done ? '완료' : '열림'}</Badge>
                                    </div>
                                  ))}
                                  <button onClick={() => createTodo(p.id)} style={{
                                    width: '100%', padding: '8px 14px 10px 66px', textAlign: 'left',
                                    fontSize: 11.5, color: 'var(--fg-faint)',
                                    borderTop: pTodos.length ? '1px solid var(--line-soft)' : 'none',
                                  }}>＋ 하위 아이템 추가</button>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                        <button onClick={() => createProject(group.key)} style={{
                          width: '100%', padding: '10px 14px', textAlign: 'left',
                          fontSize: 11.5, color: 'var(--fg-faint)',
                          borderTop: '1px solid var(--line-soft)',
                        }}>＋ {group.label} 프로젝트 추가</button>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>

            {openDetail && (() => {
              const p = allProjects.find(x => x.id === openDetail);
              if (!p) return null;
              const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
              const pTodos = scopedTodos.filter(t => t.project === p.id);
              const pUpdates = (ledger.updates || []).filter(u => u.projectId === p.id).slice(0, 5);
              const pDecisions = (ledger.decisions || []).filter(d => d.projectId === p.id).slice(0, 4);
              const pNotes = (ledger.notes || []).filter(n => n.projectId === p.id).slice(0, 4);
              const pChecks = (ledger.checks || []).filter(c => c.projectId === p.id).slice(0, 4);
              const doneCount = pTodos.filter(t => t.done).length;
              return (
                <aside style={{ borderLeft: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{pBrand.glyph}</span>
                    <div style={{ fontSize: 11, color: 'var(--fg-faint)', flex: 1 }}>{pBrand.name}</div>
                    <IconButton icon="x" size={22} iconSize={12} onClick={() => setOpenDetail(null)} />
                  </div>
                  <div className="scroll-y" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em' }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Badge tone={statusTone[p.status]} size="xs">{p.status}</Badge>
                        {p.tag === 'company' && <Badge tone="company" size="xs">Company</Badge>}
                        {p.tag === 'personal' && <Badge tone="personal" size="xs">Personal</Badge>}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 9, fontSize: 12 }}>
                      <span style={{ color: 'var(--fg-faint)' }}>Owner</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={p.owner} size={18} tone={p.owner === 'Me' ? 'moon' : 'neutral'} />
                        {p.owner}
                      </span>
                      <span style={{ color: 'var(--fg-faint)' }}>기한</span>
                      <span className="mono" style={{ color: 'var(--fg)' }}>{p.due}</span>
                      <span style={{ color: 'var(--fg-faint)' }}>진행률</span>
                      <span className="mono">{p.progress}% · {p.done}/{p.tasks}</span>
                      <span style={{ color: 'var(--fg-faint)' }}>최근 활동</span>
                      <span className="mono" style={{ color: 'var(--fg-muted)' }}>{p.lastActivityLabel || '미정'}</span>
                      <span style={{ color: 'var(--fg-faint)' }}>다음 액션</span>
                      <span style={{ color: 'var(--fg-muted)' }}>{p.nextAction || '아직 지정되지 않음'}</span>
                      <span style={{ color: 'var(--fg-faint)' }}>생성</span>
                      <span className="mono" style={{ color: 'var(--fg-muted)' }}>{p.createdAtLabel || '미정'}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 6 }}>설명</div>
                      <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
                        {p.summary || `${pBrand.desc}. 이 프로젝트는 ${p.status === 'In progress' ? '활발히 진행 중' : p.status === 'Review' ? '최종 검토 단계' : '초기 계획 단계'}이며, ${pTodos.length}개의 하위 아이템으로 구성됩니다.`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
                        <span style={{ flex: 1 }}>체크리스트 · {doneCount}/{pTodos.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pTodos.map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)' }}>
                            <button onClick={() => toggleTodo(t.id)} style={{
                              width: 14, height: 14, borderRadius: 3,
                              border: '1.5px solid ' + (t.done ? 'var(--success)' : 'var(--line-strong)'),
                              background: t.done ? 'var(--success)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>{t.done && <span style={{ fontSize: 9, color: 'var(--bg)' }}>✓</span>}</button>
                            <span style={{ flex: 1, fontSize: 12, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--fg-faint)' : 'var(--fg)' }}>{t.title}</span>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{t.due}</span>
                          </div>
                        ))}
                        <button onClick={() => createTodo(p.id)} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11.5, color: 'var(--fg-faint)' }}>＋ 항목 추가</button>
                      </div>
                    </div>
                    <DetailSection title="최근 업데이트" count={pUpdates.length} empty={syncState === 'live' ? '이 프로젝트에 연결된 update가 아직 없습니다.' : 'live 연결 후 project_updates가 여기에 표시됩니다.'}>
                      {pUpdates.map(update => (
                        <ActivityRow
                          key={update.id}
                          title={update.title}
                          body={update.summary || update.nextAction}
                          meta={update.progress !== null && update.progress !== undefined ? `${update.progress}%` : update.happenedAtLabel}
                          badge={update.source}
                          tone={updateTone[update.status] || 'neutral'}
                        />
                      ))}
                    </DetailSection>
                    <DetailSection title="결정" count={pDecisions.length} empty="이 프로젝트에 연결된 결정 기록이 없습니다.">
                      {pDecisions.map(decision => (
                        <ActivityRow
                          key={decision.id}
                          title={decision.title}
                          body={decision.summary}
                          meta={decision.decidedAtLabel}
                          badge="decision"
                          tone="moon"
                        />
                      ))}
                    </DetailSection>
                    <DetailSection title="노트" count={pNotes.length} empty="이 프로젝트에 연결된 노트가 없습니다.">
                      {pNotes.map(note => (
                        <ActivityRow
                          key={note.id}
                          title={note.title}
                          body={note.body}
                          meta={note.createdAtLabel}
                          badge="note"
                          tone="neutral"
                        />
                      ))}
                    </DetailSection>
                    <DetailSection title="루틴 체크" count={pChecks.length} empty="이 프로젝트에 연결된 routine check가 없습니다.">
                      {pChecks.map(check => (
                        <ActivityRow
                          key={check.id}
                          title={check.checkType}
                          body={check.note}
                          meta={check.checkedAtLabel}
                          badge={check.status}
                          tone={checkTone[check.status] || 'neutral'}
                        />
                      ))}
                    </DetailSection>
                  </div>
                  <div style={{ padding: 12, borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Button variant="primary" size="sm" icon="chat" style={{ flex: 1 }} onClick={() => {
                      setExpanded(prev => new Set([...prev, p.id]));
                      setView('tree');
                    }}>열기</Button>
                    {councilEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon="sparkle"
                        onClick={() => router.push('/' + councilChatPath({ mode: 'brand-strategy', ref: p.id }))}
                      >
                        Council
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      icon="orders"
                      onClick={() => sendProjectOrder(p)}
                    >
                      {orderPending ? 'Sending…' : '주문 보내기'}
                    </Button>
                    {orderResult && !orderPending && (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          color: orderResult.tone === 'ok' ? 'var(--success)' : 'var(--danger)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {orderResult.label}
                      </span>
                    )}
                  </div>
                </aside>
              );
            })()}
          </div>
        )}

        {view === 'todos' && (
          <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
            <div style={{ maxWidth: 880, margin: '0 auto' }}>
              {brandTodos.length === 0 && (
                <Card>
                  <EmptyState
                    icon="orders"
                    title="열린 할 일이 없습니다"
                    description={syncState === 'live' ? 'Supabase tasks 원장에 표시할 항목이 없습니다.' : '할 일이 생기면 날짜 버킷별로 정리됩니다.'}
                    action={<Button variant="primary" size="sm" icon="plus" onClick={() => createTodo()}>To-do</Button>}
                  />
                </Card>
              )}
              {['오늘','내일','이번주','다음주'].map(bucket => {
                const items = brandTodos.filter(t => t.bucket === bucket || t.due === bucket || (bucket === '이번주' && ['이번주','4/20','4/21','4/22','4/23'].includes(t.due)));
                if (!items.length) return null;
                return (
                  <div key={bucket} style={{ marginBottom: 'var(--section-gap)' }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 8 }}>{bucket} · {items.length}</div>
                    <Card pad={false}>
                      {items.map((t, i) => {
                        const proj = allProjects.find(p => p.id === t.project);
                        const pBrand = brands.find(b => b.key === t.brand) || brands[0] || EMPTY_ALL_BRAND;
                        return (
                          <div key={t.id} style={{
                            display: 'grid', gridTemplateColumns: '22px 1fr 140px 100px 80px',
                            padding: '10px 14px', alignItems: 'center', gap: 10,
                            borderBottom: i < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                            opacity: t.done ? 0.5 : 1,
                          }}>
                            <button onClick={() => toggleTodo(t.id)} style={{
                              width: 16, height: 16, borderRadius: 4,
                              border: '1.5px solid ' + (t.done ? 'var(--success)' : 'var(--line-strong)'),
                              background: t.done ? 'var(--success)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {t.done && <span style={{ fontSize: 10, color: 'var(--bg)' }}>✓</span>}
                            </button>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>
                                {pBrand.glyph} {pBrand.name} · {proj?.name}
                              </div>
                            </div>
                            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{t.assignee}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Dot tone={prioTone[t.priority]} />{t.priority}
                            </span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', textAlign: 'right' }}>{t.due}</span>
                          </div>
                        );
                      })}
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'board' && (
            <div className="hub-scroll-x" style={{ display: 'flex', gap: 'var(--gap)', overflowX: 'auto', flex: 1, padding: 'var(--section-gap)' }}>
            {cols.map(col => (
              <div key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={() => drag && moveCard(drag, col.key)}
                style={{
                  width: 280, flexShrink: 0,
                  background: 'var(--surface)', border: '1px solid var(--line-soft)',
                  borderRadius: 'var(--r-lg)',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', padding: '1px 6px', background: 'var(--surface-3)', borderRadius: 4 }}>{col.cards.length}</span>
                  <div style={{ flex: 1 }} />
                  <IconButton icon="plus" size={22} iconSize={12} tooltip="Add card" onClick={() => createBoardCard(col.key)} />
                </div>
                <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {col.cards.length === 0 && (
                    <div style={{ padding: '18px 8px', fontSize: 11.5, color: 'var(--fg-faint)', textAlign: 'center' }}>카드 없음</div>
                  )}
                  {col.cards.map(c => (
                    <div key={c.id} draggable onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag(null)}
                      style={{
                        background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                        borderRadius: 'var(--r-sm)', padding: '10px 11px', cursor: 'grab',
                        opacity: drag === c.id ? 0.4 : 1,
                      }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 }}>
                        <Dot tone={prioTone[c.priority]} size={5} />
                        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{c.project}</span>
                        <div style={{ flex: 1 }} />
                        {c.tag === 'personal' && <Badge tone="personal" size="xs">P</Badge>}
                        {c.tag === 'company' && <Badge tone="company" size="xs">C</Badge>}
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{c.title}</div>
                      {c.due && <div className="mono" style={{ fontSize: 10, color: 'var(--warning)', marginTop: 6 }}>⏱ {c.due}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

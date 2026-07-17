"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar, EmptyState, SyncBadge, SegmentedControl, EditDrawer } from "../hub-primitives";
import { buildProjectDraft, buildProjectTimeline, buildTaskBoardColumns, buildTaskDraft, createClientId, taskStatusForBoardColumn } from "@/lib/pms-ui";
import {
  getWorkspace,
  filterBrandsByWorkspace,
  filterProjectsByWorkspace,
  filterTodosByWorkspace,
} from "../workspace-map";

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
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{count}</span>
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

const PROJECT_VIEW_OPTIONS = [
  { key: 'tree', label: 'List' },
  { key: 'board', label: 'Board' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'todos', label: 'To-dos' },
];
const PROJECT_VIEWS = new Set(PROJECT_VIEW_OPTIONS.map(v => v.key));

// Timeline view: status → left-stripe token (§5.2 — status color lives on stripes/chips,
// never as a full bar fill) and the same Korean status labels the List view row uses.
const STATUS_LINE_TOKEN = {
  'In progress': 'var(--info-line)',
  Review: 'var(--warning-line)',
  Planning: 'var(--line-strong)',
  Backlog: 'var(--line-soft)',
  Blocked: 'var(--danger-line)',
  Done: 'var(--success-line)',
};
const STATUS_LABEL_KO = {
  'In progress': '작업 중',
  Review: '검토',
  Planning: '계획',
  Blocked: '막힘',
  Done: '완료',
  Backlog: '백로그',
};

// Container category folders (2026-07-15 spec §4.2). The ledger resolves
// `category` (meta.category → canonical map → 'general'); empty folders are
// never rendered. Collapse state is UI-only.
const PROJECT_CATEGORIES = [
  { key: 'sns-channel', label: 'SNS 채널' },
  { key: 'ka-deal', label: 'KA·딜' },
  { key: 'general', label: '일반' },
];
const FOLDER_STORAGE_KEY = 'mlp.pms.folders';
// List 뷰의 브랜드 섹션 접기 상태 (전체 브랜드 볼 때만). UI 전용, 브랜드 slug로 영속.
const BRAND_SECTION_KEY = 'mlp.pms.brand-sections';
// 콘텐츠 프로젝트 파이프라인 — "＋ 콘텐츠"로 생성 시 이 4단계가 하위 아이템으로 순차 시드된다.
// (예: "7월3주차 Class.moon 콘텐츠" 프로젝트 안의 기획→초안→검토→업로드)
const CONTENT_STAGES = ['기획', '초안', '검토', '업로드'];

// 사이드바 드래그 정렬 — 분류(폴더)와 컨테이너(브랜드) 순서. UI 전용, localStorage 영속.
const FOLDER_ORDER_KEY = 'mlp.pms.folder-order';
const BRAND_ORDER_KEY = 'mlp.pms.brand-order';

// order(키 배열)에 없는 항목은 원래 순서를 유지하며 맨 뒤로 (stable sort).
function applyCustomOrder(items, order, keyOf) {
  if (!order || !order.length) return items;
  const idx = new Map(order.map((k, i) => [k, i]));
  const rank = (it) => (idx.has(keyOf(it)) ? idx.get(keyOf(it)) : Number.POSITIVE_INFINITY);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

// prevOrder를 현재 존재하는 키로 정규화한 뒤, movingKey를 targetKey '앞'으로 이동한 새 순서 배열.
function computeMovedOrder(prevOrder, currentKeys, movingKey, targetKey) {
  const present = new Set(currentKeys);
  const base = prevOrder.filter((k) => present.has(k));
  for (const k of currentKeys) if (!base.includes(k)) base.push(k);
  if (movingKey === targetKey) return base; // 자기 자신에 드롭 → 정규화만
  const from = base.indexOf(movingKey);
  if (from === -1) return base;
  base.splice(from, 1);
  const to = base.indexOf(targetKey);
  if (to === -1) base.push(movingKey);
  else base.splice(to, 0, movingKey);
  return base;
}

// Container (brand) create helpers. brands.slug must be unique per workspace and
// is required by the table; Korean names collapse to an id-based fallback.
function slugifyContainer(name, id) {
  const base = String(name || '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || `c-${String(id || '').slice(0, 8)}`;
}

// Optimistic row for preview mode (Engine not configured) — shaped like a ledger
// brand so brandGroups places it in the right category folder immediately.
function buildLocalContainer(draft, slug) {
  return {
    key: slug,
    id: draft.id,
    name: String(draft.name || '').trim(),
    glyph: '○',
    tone: 'moon',
    kind: 'brand',
    orgScope: draft.orgScope,
    category: draft.category,
    desc: '새 컨테이너 · 저장 대기',
    preview: true,
    projects: 0,
    tasks: 0,
    open: 0,
    changes: 0,
  };
}

// `?view=tasks` is the sidebar spec's wording for the same view the page calls
// 'todos' — accept both so old and new links resolve.
function normalizeProjectView(raw) {
  const v = String(raw || '');
  if (v === 'tasks') return 'todos';
  return PROJECT_VIEWS.has(v) ? v : 'tree';
}

export function Projects({ workspace }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ws = getWorkspace(workspace);
  const [brand, setBrand] = React.useState('all');

  // The open view lives in the URL, not in state: the sidebar tells 할 일 from
  // 프로젝트·기획 by `?view`, and it makes the view bookmarkable. The ref keeps
  // setView's identity stable so the existing createProject/createTodo callbacks
  // don't need it in their dependency lists.
  const view = normalizeProjectView(searchParams.get('view'));
  const searchParamsRef = React.useRef(searchParams);
  searchParamsRef.current = searchParams;
  const setView = React.useCallback((next) => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (next === 'tree') params.delete('view');
    else params.set('view', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);
  const [ledger, setLedger] = React.useState({
    source: 'preview',
    brands: [EMPTY_ALL_BRAND],
    projects: [],
    updates: [],
    decisions: [],
    notes: [],
    checks: [],
    columns: [],
  });
  const [todos, setTodos] = React.useState([]);
  const [drag, setDrag] = React.useState(null);
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [openDetail, setOpenDetail] = React.useState(null);
  const [brandMenuOpen, setBrandMenuOpen] = React.useState(false);
  const [sidebarHidden, setSidebarHidden] = React.useState(false);
  const [syncState, setSyncState] = React.useState('preview');
  const brandMenuRef = React.useRef(null);
  const createdFromQueryRef = React.useRef(false);
  const [orderPending, setOrderPending] = React.useState(false);
  const [orderResult, setOrderResult] = React.useState(null); // { tone: 'ok'|'err', label }
  const [projectDraft, setProjectDraft] = React.useState(null);
  const [taskDraft, setTaskDraft] = React.useState(null);
  const [containerDraft, setContainerDraft] = React.useState(null);
  const [localContainers, setLocalContainers] = React.useState([]);

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

  const ledgerBrands = ledger.brands?.length ? ledger.brands : [EMPTY_ALL_BRAND];
  // Optimistic containers (preview mode) ride alongside the ledger until a live
  // reload carries the same slug and supersedes them.
  const rawBrands = localContainers.length
    ? [...ledgerBrands, ...localContainers.filter(lc => !ledgerBrands.some(b => b.key === lc.key))]
    : ledgerBrands;
  const rawProjects = Array.isArray(ledger.projects) ? ledger.projects : [];
  // Workspace scope: restrict to this workspace's brands/projects/todos. With no
  // workspace the filters return their input unchanged, so the unscoped page stays
  // byte-identical in effect. filterBrandsByWorkspace keeps the 'all' index, so a
  // scoped view reads as "전체(스코프 내)" — only in-scope brands ever appear.
  // rawBrands (UNFILTERED) rides along so records whose brand slug is unknown to the
  // static set still resolve membership through their live brand's orgScope.
  const brands = ws ? filterBrandsByWorkspace(rawBrands, workspace) : rawBrands;
  const allProjects = ws ? filterProjectsByWorkspace(rawProjects, workspace, rawBrands) : rawProjects;
  const scopedTodos = ws ? filterTodosByWorkspace(todos, workspace, rawBrands) : todos;
  // Scoped default = first non-'all' brand in this workspace (used only when the current
  // brand selection falls out of scope, e.g. after switching workspaces).
  const wsDefaultBrand = ws
    ? (brands.find(b => b.key !== 'all')?.key || brands[0]?.key || 'all')
    : 'all';
  const projects = brand === 'all' ? allProjects : allProjects.filter(p => p.brand === brand);
  const brandTodos = brand === 'all' ? scopedTodos : scopedTodos.filter(t => t.brand === brand);
  const currentBrand = brands.find(b => b.key === brand) || brands[0] || EMPTY_ALL_BRAND;
  const visibleColumns = buildTaskBoardColumns(brandTodos, allProjects);

  const loadLedger = React.useCallback(async ({ initial = false } = {}) => {
    setSyncState('loading');
    try {
      const response = await fetch('/api/hub/projects', { cache: 'no-store' });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data || data.status === 'error') {
        setSyncState('preview');
        return false;
      }

      if (data.source === 'supabase') {
        const liveProjects = Array.isArray(data.projects) ? data.projects : [];
        setLedger({
          source: data.source,
          brands: data.brands?.length ? data.brands : [EMPTY_ALL_BRAND],
          projects: liveProjects,
          updates: Array.isArray(data.updates) ? data.updates : [],
          decisions: Array.isArray(data.decisions) ? data.decisions : [],
          notes: Array.isArray(data.notes) ? data.notes : [],
          checks: Array.isArray(data.checks) ? data.checks : [],
          columns: Array.isArray(data.columns) ? data.columns : [],
        });
        setTodos(Array.isArray(data.todos) ? data.todos : []);
        if (initial) setExpanded(new Set(liveProjects.slice(0, 2).map(p => p.id)));
        setSyncState('live');
        return true;
      }

      setLedger({
        source: 'preview',
        brands: [EMPTY_ALL_BRAND],
        projects: [],
        updates: [],
        decisions: [],
        notes: [],
        checks: [],
        columns: [],
      });
      setTodos([]);
      setSyncState('preview');
      return false;
    } catch {
      setSyncState('preview');
      return false;
    }
  }, []);

  // ?project= 딥링크가 "원장 로드 후 1회" 계약(§8.1)을 지킬 수 있도록 최초 로드 완료를
  // 기록한다 — syncState 초기값이 'preview'라서 상태만으로는 로드 전/후를 구분 못 한다.
  const initialLoadDoneRef = React.useRef(false);
  React.useEffect(() => {
    loadLedger({ initial: true }).finally(() => { initialLoadDoneRef.current = true; });
  }, [loadLedger]);

  React.useEffect(() => {
    if (!brands.some(b => b.key === brand)) {
      setBrand(wsDefaultBrand);
    }
  }, [brand, brands, wsDefaultBrand]);

  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const createProject = React.useCallback((initialStatus = 'Planning', brandKeyOverride = null) => {
    // brandKeyOverride: 전체 뷰의 브랜드 섹션 하단 "추가"가 그 섹션의 브랜드로 시드한다.
    const selectedBrand = brandKeyOverride
      ? (brands.find(item => item.key === brandKeyOverride) || null)
      : (brand === 'all'
        ? brands.find(item => item.key !== 'all')
        : currentBrand);
    if (!selectedBrand || selectedBrand.id === 'all') {
      setOrderResult({ tone: 'err', label: '프로젝트를 연결할 브랜드가 없습니다' });
      return;
    }
    setProjectDraft({
      ...buildProjectDraft({
        brandId: selectedBrand.id,
        brandKey: selectedBrand.key,
        initialStatus,
      }),
      id: createClientId(),
    });
  }, [brand, brands, currentBrand]);

  // 콘텐츠 프로젝트: 브랜드 시드 + contentPipeline 플래그. 저장이 성공하면 persistProject가
  // CONTENT_STAGES(기획→초안→검토→업로드)를 하위 아이템으로 시드한다.
  const createContentProject = React.useCallback((brandKeyOverride = null) => {
    const selectedBrand = brandKeyOverride
      ? (brands.find(item => item.key === brandKeyOverride) || null)
      : (brand === 'all' ? brands.find(item => item.key !== 'all') : currentBrand);
    if (!selectedBrand || selectedBrand.id === 'all') {
      setOrderResult({ tone: 'err', label: '콘텐츠를 연결할 브랜드가 없습니다' });
      return;
    }
    setProjectDraft({
      ...buildProjectDraft({
        brandId: selectedBrand.id,
        brandKey: selectedBrand.key,
        initialStatus: 'Planning',
      }),
      id: createClientId(),
      title: `${selectedBrand.name} 콘텐츠`,
      contentPipeline: true,
    });
  }, [brand, brands, currentBrand]);

  const editProject = React.useCallback((project) => {
    setProjectDraft({
      kind: 'project',
      isNew: false,
      id: project.id,
      title: project.name,
      brandId: project.brandId,
      brandKey: project.brand,
      summary: project.summary || '',
      status: project.statusKey || 'active',
      priority: project.priority || 'medium',
      progress: project.progress || 0,
      nextAction: project.nextAction || '',
      dueAt: project.dueAt ? String(project.dueAt).slice(0, 10) : '',
    });
  }, []);

  const createTodo = React.useCallback((projectId = null, initialStatus = 'todo') => {
    setTaskDraft({
      ...buildTaskDraft({ projectId, initialStatus }),
      id: createClientId(),
    });
  }, []);

  const persistProject = React.useCallback(async () => {
    if (!projectDraft?.title?.trim()) return { ok: false, status: 'invalid-input' };
    try {
      const response = await fetch('/api/hub/projects', {
        method: projectDraft.isNew ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectDraft.id,
          title: projectDraft.title,
          brandId: projectDraft.brandId,
          summary: projectDraft.summary,
          status: projectDraft.status,
          priority: projectDraft.priority,
          progress: Number(projectDraft.progress || 0),
          nextAction: projectDraft.nextAction,
          dueAt: projectDraft.dueAt,
          source: 'hub-projects',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !['saved', 'duplicate'].includes(data.status)) {
        setOrderResult({ tone: 'err', label: data.error || `저장 실패 ${response.status}` });
        return { ok: false, status: data.status || 'error' };
      }
      // 콘텐츠 파이프라인 프로젝트: 기획→초안→검토→업로드를 하위 아이템으로 순차 시드.
      // 프로젝트 API가 클라이언트 id를 그대로 row id로 쓰므로 projectDraft.id로 연결 가능.
      let seeded = false;
      if (projectDraft.isNew && projectDraft.contentPipeline && data.status === 'saved') {
        const newProjectId = data.project?.id || projectDraft.id;
        // 원장은 tasks를 updated_at.desc로 정렬한다(operating-ledger). 체크리스트가
        // 기획→초안→검토→업로드로 위에서 아래로 읽히게 하려면 기획을 '마지막'에 생성해
        // 가장 최신이 되게 한다 → 역순 시드.
        for (const stage of [...CONTENT_STAGES].reverse()) {
          const stageRes = await fetch('/api/hub/tasks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id: createClientId(),
              title: stage,
              projectId: newProjectId,
              status: 'todo',
              priority: 'medium',
              source: 'hub-projects',
            }),
          }).catch(() => null);
          if (stageRes && stageRes.ok) seeded = true;
        }
      }
      await loadLedger();
      setOrderResult({
        tone: 'ok',
        label: projectDraft.isNew
          ? (seeded ? '콘텐츠 프로젝트 저장됨 · 4단계 시드' : '프로젝트 저장됨')
          : '프로젝트 업데이트됨',
      });
      return { ok: true, status: data.status };
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error' };
    }
  }, [loadLedger, projectDraft]);

  const createContainer = React.useCallback(() => {
    // Seed the drawer with the current scope's org so a container made under the
    // 개인 view lands in 개인, and under ClassIn lands in 업무·클래스인.
    setContainerDraft({
      kind: 'container',
      isNew: true,
      id: createClientId(),
      name: '',
      category: 'general',
      orgScope: workspace === 'classin' ? 'classin' : 'personal',
    });
  }, [workspace]);

  // Create a container (brand row). saved/duplicate → reload; preview (Engine not
  // configured) → keep an optimistic local row so the folder fills immediately.
  const persistContainer = React.useCallback(async () => {
    const name = containerDraft?.name?.trim();
    if (!name) return { ok: false, status: 'invalid-input' };
    const slug = slugifyContainer(name, containerDraft.id);
    try {
      const response = await fetch('/api/hub/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: containerDraft.id,
          name,
          slug,
          category: containerDraft.category,
          orgScope: containerDraft.orgScope,
          source: 'hub-projects',
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && ['saved', 'duplicate'].includes(data.status)) {
        setLocalContainers(prev => prev.filter(c => c.id !== containerDraft.id));
        await loadLedger();
        setBrand(slug);
        setOrderResult({ tone: 'ok', label: '컨테이너 저장됨' });
        return { ok: true, status: data.status };
      }
      if (data.status === 'preview') {
        setLocalContainers(prev => [...prev.filter(c => c.id !== containerDraft.id), buildLocalContainer(containerDraft, slug)]);
        setBrand(slug);
        setOrderResult({ tone: 'ok', label: '컨테이너 생성 · 저장 대기(preview)' });
        return { ok: true, status: 'preview' };
      }
      setOrderResult({ tone: 'err', label: data.error || `저장 실패 ${response.status}` });
      return { ok: false, status: data.status || 'error' };
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error' };
    }
  }, [containerDraft, loadLedger]);

  const persistTask = React.useCallback(async () => {
    if (!taskDraft?.title?.trim()) return { ok: false, status: 'invalid-input' };
    try {
      const response = await fetch('/api/hub/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: taskDraft.id,
          title: taskDraft.title,
          projectId: taskDraft.projectId || null,
          status: taskDraft.status,
          priority: taskDraft.priority,
          dueAt: taskDraft.dueAt,
          source: 'hub-projects',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !['saved', 'duplicate'].includes(data.status)) {
        setOrderResult({ tone: 'err', label: data.error || `저장 실패 ${response.status}` });
        return { ok: false, status: data.status || 'error' };
      }
      await loadLedger();
      setOrderResult({ tone: 'ok', label: '할 일 저장됨' });
      return { ok: true, status: data.status };
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error' };
    }
  }, [loadLedger, taskDraft]);

  const updateTaskStatus = React.useCallback(async (id, status) => {
    const response = await fetch('/api/hub/tasks', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'saved') {
      throw new Error(data.error || `상태 저장 실패 ${response.status}`);
    }
    await loadLedger();
  }, [loadLedger]);

  const toggleTodo = React.useCallback(async (id) => {
    const todo = todos.find(item => item.id === id);
    if (!todo) return;
    try {
      await updateTaskStatus(id, todo.status === 'done' ? 'todo' : 'done');
      setOrderResult({ tone: 'ok', label: todo.status === 'done' ? '할 일 다시 열림' : '할 일 완료됨' });
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  }, [todos, updateTaskStatus]);

  const moveCard = React.useCallback(async (id, column) => {
    const status = taskStatusForBoardColumn(column);
    if (!status) return;
    try {
      await updateTaskStatus(id, status);
      setOrderResult({ tone: 'ok', label: '보드 상태 저장됨' });
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  }, [updateTaskStatus]);

  const createBoardCard = React.useCallback((column) => {
    createTodo(null, taskStatusForBoardColumn(column) || 'todo');
  }, [createTodo]);

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
    router.replace(pathname);
  }, [createProject, searchParams, router, pathname]);

  // ?project=<id> 딥링크 (§8.1) — 원장 로드 후 해당 프로젝트의 우측 상세 패널을 1회 열고
  // 쿼리를 소거한다. 내 작업 상세 패널의 "프로젝트에서 열기"가 이 경로로 들어온다.
  // 상세 패널은 tree 뷰에만 있으므로 view 쿼리도 함께 지워 tree(기본)로 되돌린다.
  const projectQueryRef = React.useRef(false);
  React.useEffect(() => {
    if (projectQueryRef.current || !initialLoadDoneRef.current) return;
    const target = searchParams.get('project');
    if (!target) return;
    projectQueryRef.current = true;
    const match = allProjects.find((p) => p.id === target);
    if (match) {
      setOpenDetail(match.id);
      setExpanded((prev) => new Set([...prev, match.id]));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('project');
    if (match) params.delete('view');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, syncState, allProjects, router, pathname]);

  // 사이드바 드래그 정렬 상태 (UI 전용, localStorage). brandGroups가 이 순서를 적용하므로
  // 반드시 memo보다 먼저 선언한다.
  const [folderOrder, setFolderOrder] = React.useState([]);
  const [brandOrder, setBrandOrder] = React.useState([]);
  const [sidebarDrag, setSidebarDrag] = React.useState(null); // { type: 'folder'|'brand', key, folderId? }
  const [dragOverKey, setDragOverKey] = React.useState(null);
  React.useEffect(() => {
    try {
      const fo = JSON.parse(localStorage.getItem(FOLDER_ORDER_KEY) || 'null');
      if (Array.isArray(fo)) setFolderOrder(fo);
      const bo = JSON.parse(localStorage.getItem(BRAND_ORDER_KEY) || 'null');
      if (Array.isArray(bo)) setBrandOrder(bo);
    } catch { /* defaults apply */ }
  }, []);

  const brandGroups = React.useMemo(() => {
    const real = brands.filter(b => b.key !== 'all');
    const scopes = [
      { key: 'classin', label: '업무 · 클래스인', items: real.filter(b => b.orgScope === 'classin') },
      { key: 'personal', label: '개인', items: real.filter(b => b.orgScope !== 'classin') },
    ];
    const orderedCategories = applyCustomOrder(PROJECT_CATEGORIES, folderOrder, c => c.key);
    return scopes.map(g => ({
      ...g,
      folders: orderedCategories
        .map(cat => ({
          ...cat,
          id: `${g.key}:${cat.key}`,
          items: applyCustomOrder(g.items.filter(b => (b.category || 'general') === cat.key), brandOrder, b => b.key),
        }))
        .filter(f => f.items.length > 0),
    }));
  }, [brands, folderOrder, brandOrder]);

  // Folder collapse — default expanded; persisted per folder id.
  const [foldersCollapsed, setFoldersCollapsed] = React.useState({});
  React.useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FOLDER_STORAGE_KEY) || 'null');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setFoldersCollapsed(parsed);
    } catch { /* defaults apply */ }
  }, []);
  const toggleFolder = React.useCallback((id) => {
    setFoldersCollapsed(prev => {
      const map = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
      return map;
    });
  }, []);

  // List 뷰에서 전체 브랜드를 볼 때 각 브랜드의 프로젝트 목록 전체를 접는 아코디언 상태.
  const [brandSectionsCollapsed, setBrandSectionsCollapsed] = React.useState({});
  React.useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(BRAND_SECTION_KEY) || 'null');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setBrandSectionsCollapsed(parsed);
    } catch { /* defaults apply */ }
  }, []);
  const toggleBrandSection = React.useCallback((key) => {
    setBrandSectionsCollapsed(prev => {
      const map = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(BRAND_SECTION_KEY, JSON.stringify(map)); } catch { /* ignore */ }
      return map;
    });
  }, []);

  // 브랜드가 속한 폴더 id (scope:category) — 브랜드 드롭은 같은 폴더 안에서만 재정렬한다.
  const folderIdOf = (b) => `${b.orgScope === 'classin' ? 'classin' : 'personal'}:${b.category || 'general'}`;

  // 분류(폴더) 드롭 → 전역 카테고리 순서를 재정렬하고 localStorage에 영속.
  const handleFolderDrop = (targetCatKey) => {
    if (!sidebarDrag || sidebarDrag.type !== 'folder' || sidebarDrag.key === targetCatKey) {
      setSidebarDrag(null); setDragOverKey(null); return;
    }
    const next = computeMovedOrder(folderOrder, PROJECT_CATEGORIES.map(c => c.key), sidebarDrag.key, targetCatKey);
    setFolderOrder(next);
    try { localStorage.setItem(FOLDER_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setSidebarDrag(null); setDragOverKey(null);
  };

  // 컨테이너(브랜드) 드롭 → 같은 폴더 안에서만 순서 재정렬하고 영속. 다른 폴더로의 드롭은 무시.
  const handleBrandDrop = (targetBrand) => {
    if (!sidebarDrag || sidebarDrag.type !== 'brand' || sidebarDrag.key === targetBrand.key
        || sidebarDrag.folderId !== folderIdOf(targetBrand)) {
      setSidebarDrag(null); setDragOverKey(null); return;
    }
    const currentKeys = brands.filter(b => b.key !== 'all').map(b => b.key);
    const next = computeMovedOrder(brandOrder, currentKeys, sidebarDrag.key, targetBrand.key);
    setBrandOrder(next);
    try { localStorage.setItem(BRAND_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setSidebarDrag(null); setDragOverKey(null);
  };

  const renderBrandSidebarRow = (b) => {
    const active = brand === b.key;
    const count = b.key === 'all' ? allProjects.length : (b.projects || 0);
    const changes = b.key === 'all'
      ? brands.filter(x => x.key !== 'all').reduce((s, x) => s + (x.changes || 0), 0)
      : (b.changes || 0);
    const draggable = b.key !== 'all';
    const dragging = draggable && sidebarDrag?.type === 'brand' && sidebarDrag.key === b.key;
    const dropTarget = draggable && sidebarDrag?.type === 'brand' && dragOverKey === b.key
      && sidebarDrag.key !== b.key && sidebarDrag.folderId === folderIdOf(b);
    return (
      <button key={b.key} onClick={() => setBrand(b.key)}
        draggable={draggable}
        onDragStart={draggable ? () => setSidebarDrag({ type: 'brand', key: b.key, folderId: folderIdOf(b) }) : undefined}
        onDragEnd={() => { setSidebarDrag(null); setDragOverKey(null); }}
        onDragOver={draggable ? (e) => { e.preventDefault(); if (sidebarDrag?.type === 'brand') setDragOverKey(b.key); } : undefined}
        onDrop={draggable ? (e) => { e.preventDefault(); handleBrandDrop(b); } : undefined}
        style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 10px', marginBottom: 1,
        background: active ? 'var(--surface-3)' : 'transparent',
        border: active ? '1px solid var(--line)' : '1px solid transparent',
        borderRadius: 'var(--r-sm)', textAlign: 'left',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        position: 'relative',
        cursor: draggable ? 'grab' : 'pointer',
        opacity: dragging ? 0.4 : 1,
        boxShadow: dropTarget ? 'inset 0 2px 0 0 var(--moon-300)' : undefined,
      }}>
        {draggable && <Iconed name="drag" size={10} style={{ color: 'var(--fg-faint)', flexShrink: 0, marginRight: -4 }} />}
        {/* 글리프 단색·축소 (2026-07-15 spec §5) — 톤은 Badge/Dot에만. */}
        <span style={{ fontSize: 12, width: 18, textAlign: 'center', position: 'relative', color: active ? 'var(--fg-muted)' : 'var(--fg-faint)' }}>
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
            fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
            minWidth: 16, height: 14, padding: '0 5px',
            borderRadius: 999, background: 'var(--danger)', color: 'var(--bg)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            letterSpacing: '-0.02em',
          }}>{changes > 99 ? '99+' : changes}</span>
        )}
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', background: active ? 'var(--surface)' : 'transparent', padding: '1px 5px', borderRadius: 4 }}>{count}</span>
      </button>
    );
  };

  const renderBrandMenuRow = (b) => {
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
        <span style={{ fontSize: 12, width: 18, textAlign: 'center', position: 'relative', color: active ? 'var(--fg-muted)' : 'var(--fg-faint)' }}>
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
                fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                minWidth: 16, height: 14, padding: '0 5px',
                borderRadius: 999, background: 'var(--danger)', color: 'var(--bg)',
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
  };

  return (
    <div className="hub-workspace-shell" style={{ display: 'grid', gridTemplateColumns: sidebarHidden ? '1fr' : '240px 1fr', height: '100%', overflow: 'hidden' }}>
      {!sidebarHidden && (
      <aside style={{ borderRight: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-faint)' }}>분류</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>프로젝트 컨테이너 · {Math.max(0, brands.length - 1)}개</div>
          </div>
          <IconButton icon="plus" size={24} iconSize={13} onClick={createContainer} tooltip="새 컨테이너 (KA·딜·일반)" />
          <IconButton icon="chevronL" size={24} iconSize={13} onClick={() => setSidebarHidden(true)} tooltip="접기" />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {brands.filter(b => b.key === 'all').map(renderBrandSidebarRow)}
          {brandGroups.map(group => group.items.length === 0 ? null : (
            <div key={group.key}>
              <div style={{ padding: '10px 10px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>
                {group.label}
              </div>
              {group.folders.map(folder => {
                const closed = Boolean(foldersCollapsed[folder.id]);
                const fDragging = sidebarDrag?.type === 'folder' && sidebarDrag.key === folder.key;
                const fDropTarget = sidebarDrag?.type === 'folder' && dragOverKey === folder.id && sidebarDrag.key !== folder.key;
                return (
                  <div key={folder.id}>
                    <button
                      type="button"
                      className="hub-row"
                      aria-expanded={!closed}
                      onClick={() => toggleFolder(folder.id)}
                      draggable
                      onDragStart={() => setSidebarDrag({ type: 'folder', key: folder.key })}
                      onDragEnd={() => { setSidebarDrag(null); setDragOverKey(null); }}
                      onDragOver={(e) => { e.preventDefault(); if (sidebarDrag?.type === 'folder') setDragOverKey(folder.id); }}
                      onDrop={(e) => { e.preventDefault(); handleFolderDrop(folder.key); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 'var(--r-sm)',
                        color: 'var(--fg-dim)', fontSize: 11, textAlign: 'left',
                        cursor: 'grab',
                        opacity: fDragging ? 0.4 : 1,
                        boxShadow: fDropTarget ? 'inset 0 2px 0 0 var(--moon-300)' : undefined,
                      }}
                    >
                      <Iconed name="drag" size={10} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} />
                      <Iconed name="chevronD" size={11} style={{ transform: closed ? 'rotate(-90deg)' : 'none' }} />
                      <span style={{ flex: 1 }}>{folder.label}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{folder.items.length}</span>
                    </button>
                    {!closed && folder.items.map(renderBrandSidebarRow)}
                  </div>
                );
              })}
            </div>
          ))}
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
              <span style={{ fontSize: 14, position: 'relative', color: 'var(--fg-muted)' }}>
                {currentBrand.glyph}
                {(() => {
                  const totalChanges = brands.filter(b => b.key !== 'all').reduce((s, b) => s + (b.changes || 0), 0);
                  if (brand === 'all' && totalChanges > 0) {
                    return (
                      <span style={{
                        position: 'absolute', top: -4, right: -6,
                        minWidth: 14, height: 14, padding: '0 4px',
                        borderRadius: 999, background: 'var(--danger)', color: 'var(--bg)',
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
                        borderRadius: 999, background: 'var(--danger)', color: 'var(--bg)',
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
                {brands.filter(b => b.key === 'all').map(renderBrandMenuRow)}
                {brandGroups.map(group => group.items.length === 0 ? null : (
                  <div key={group.key}>
                    <div style={{ padding: '6px 10px 4px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>
                      {group.label}
                    </div>
                    {group.folders.map(folder => (
                      <div key={folder.id}>
                        <div style={{ padding: '4px 10px 2px', fontSize: 10.5, color: 'var(--fg-faint)' }}>{folder.label}</div>
                        {folder.items.map(renderBrandMenuRow)}
                      </div>
                    ))}
                  </div>
                ))}
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
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Projects</h2>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
              {projects.length} projects · {brandTodos.filter(t => !t.done).length} open todos · {currentBrand.desc}
              <SyncBadge state={syncState} />
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <SegmentedControl
            label="보기"
            options={PROJECT_VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
          {orderResult && (
            <span className="mono" style={{ fontSize: 10.5, color: orderResult.tone === 'ok' ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
              {orderResult.label}
            </span>
          )}
          <Button variant="primary" size="sm" icon="plus" onClick={() => view === 'todos' ? createTodo() : createProject()}>{view === 'todos' ? 'To-do' : 'Project'}</Button>
        </div>

        {view === 'tree' && (
          <div className="hub-projects-main-grid" style={{ display: 'grid', gridTemplateColumns: openDetail ? '1fr 360px' : '1fr', flex: 1, overflow: 'hidden' }}>
            <div className="scroll-y" style={{ padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                {projects.length === 0 && (
                  <Card>
                    <EmptyState
                      icon="projects"
                      title="프로젝트 기록이 비어 있습니다"
                      description="Supabase 연결은 live 상태입니다. 첫 프로젝트를 만들거나 외부 project webhook을 보내면 이 목록에 바로 표시됩니다."
                      action={<Button variant="primary" size="sm" icon="plus" onClick={() => createProject()}>Project</Button>}
                    />
                  </Card>
                )}
                {(() => {
                  const STATUS_GROUPS = [
                    { key: 'In progress', label: '진행중', tone: 'var(--info)' },
                    { key: 'Blocked',     label: '막힘',   tone: 'var(--danger)' },
                    { key: 'Review',      label: '검토',   tone: 'var(--warning)' },
                    { key: 'Planning',    label: '계획',   tone: 'var(--moon-400)' },
                    { key: 'Done',        label: '완료',   tone: 'var(--success)' },
                    { key: 'Backlog',     label: '백로그', tone: 'var(--fg-faint)' },
                  ];
                  // 전체 브랜드 뷰는 브랜드별 아코디언(목록 전체 접기), 특정 브랜드 뷰는 기존 상태별 그룹.
                  const sections = brand === 'all'
                    ? brands.filter(b => b.key !== 'all')
                        .map(b => ({ kind: 'brand', id: b.key, brand: b, items: projects.filter(p => p.brand === b.key) }))
                        .filter(s => s.items.length > 0)
                    : STATUS_GROUPS
                        .map(g => ({ kind: 'status', id: g.key, statusKey: g.key, label: g.label, tone: g.tone, items: projects.filter(p => p.status === g.key) }))
                        .filter(s => s.items.length > 0);
                  return sections.map(section => {
                    const items = section.items;
                    const collapsed = section.kind === 'brand' && Boolean(brandSectionsCollapsed[section.id]);
                    return (
                    <div key={section.id}>
                      {section.kind === 'brand' ? (
                      <button
                        type="button"
                        className="hub-row"
                        aria-expanded={!collapsed}
                        onClick={() => toggleBrandSection(section.id)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', marginBottom: 10, borderRadius: 'var(--r-sm)',
                          textAlign: 'left', color: 'var(--fg)',
                        }}
                      >
                        <Iconed name="chevronD" size={12} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', color: 'var(--fg-faint)' }} />
                        <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{section.brand.glyph}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.brand.name}</span>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{items.length}</span>
                      </button>
                      ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 3, height: 14, background: section.tone, borderRadius: 2 }} />
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{section.label}</div>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{items.length}</span>
                      </div>
                      )}
                      {!collapsed && (
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
                        {items.map((p, pi) => {
                          const isOpen = expanded.has(p.id);
                          const pTodos = scopedTodos.filter(t => t.project === p.id);
                          const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
                          const isSel = openDetail === p.id;
                          return (
                            <React.Fragment key={p.id}>
                              <div style={{
                                display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center', gap: 8,
                                borderBottom: (isOpen || pi < items.length - 1) ? '1px solid var(--line-soft)' : 'none',
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
                                  <span style={{ fontSize: 14, color: 'var(--fg-muted)' }}>{pBrand.glyph}</span>
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
                                <div style={{ background: 'var(--surface-2)', borderBottom: pi < items.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
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
                                      <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{t.due}</span>
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
                        {section.kind === 'brand' ? (
                        <div style={{ display: 'flex', borderTop: '1px solid var(--line-soft)' }}>
                          <button onClick={() => createContentProject(section.id)} style={{
                            flex: 1, padding: '10px 14px', textAlign: 'left',
                            fontSize: 11.5, color: 'var(--fg-muted)',
                          }}>＋ 콘텐츠 <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>기획·초안·검토·업로드</span></button>
                          <button onClick={() => createProject('Planning', section.id)} style={{
                            flex: '0 0 auto', padding: '10px 14px',
                            fontSize: 11.5, color: 'var(--fg-faint)',
                            borderLeft: '1px solid var(--line-soft)',
                          }}>＋ 프로젝트</button>
                        </div>
                        ) : (
                        <button onClick={() => createProject(section.statusKey)} style={{
                          width: '100%', padding: '10px 14px', textAlign: 'left',
                          fontSize: 11.5, color: 'var(--fg-faint)',
                          borderTop: '1px solid var(--line-soft)',
                        }}>＋ {section.label} 프로젝트 추가</button>
                        )}
                      </Card>
                      )}
                    </div>
                    );
                  });
                })()}
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
                    <span style={{ fontSize: 16, color: 'var(--fg-muted)' }}>{pBrand.glyph}</span>
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
                            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{t.due}</span>
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
                    <Button variant="outline" size="sm" onClick={() => editProject(p)}>편집</Button>
                    <Button variant="primary" size="sm" icon="chat" style={{ flex: 1 }} onClick={() => {
                      setExpanded(prev => new Set([...prev, p.id]));
                      setView('tree');
                    }}>열기</Button>
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
                    description={syncState === 'live' ? 'Supabase tasks 기록에 표시할 항목이 없습니다.' : '할 일이 생기면 날짜 버킷별로 정리됩니다.'}
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
                            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', textAlign: 'right' }}>{t.due}</span>
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
            {visibleColumns.map(col => (
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
                  <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '1px 6px', background: 'var(--surface-3)', borderRadius: 4 }}>{col.cards.length}</span>
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
                        borderRadius: 'var(--r-sm)', padding: 'var(--pad-y) var(--pad-x)', cursor: 'grab',
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

        {view === 'timeline' && (() => {
          if (projects.length === 0) {
            return (
              <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
                <div style={{ maxWidth: 880, margin: '0 auto' }}>
                  <Card>
                    <EmptyState
                      icon="projects"
                      title="타임라인에 표시할 프로젝트가 없습니다"
                      description="기한이 있는 프로젝트는 축 위에 막대로, 기한 미정 프로젝트는 아래 목록으로 표시됩니다."
                      action={<Button variant="primary" size="sm" icon="plus" onClick={() => createProject()}>Project</Button>}
                    />
                  </Card>
                </div>
              </div>
            );
          }
          const timeline = buildProjectTimeline(projects);
          const weekTicks = [];
          for (let d = 0; d <= timeline.totalDays; d += 7) {
            const tickDate = new Date(timeline.windowStart.getTime() + d * 86_400_000);
            weekTicks.push({
              offsetPct: (d / timeline.totalDays) * 100,
              label: new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(tickDate),
            });
          }
          return (
            <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                <Card pad={false} className="hub-table-card">
                  {timeline.items.length === 0 ? (
                    <div style={{ padding: '18px 14px', fontSize: 11.5, color: 'var(--fg-faint)' }}>기한이 지정된 프로젝트가 없습니다. 프로젝트를 편집해 기한을 지정하면 여기 축 위에 표시됩니다.</div>
                  ) : (
                    // Fixed inner min-width + horizontal scroll (same pattern as the board
                    // view's hub-scroll-x) so the ruler and bars never get squeezed unreadable
                    // on narrow viewports — the label column alone would eat a phone's width.
                    <div className="hub-scroll-x" style={{ overflowX: 'auto' }}>
                      <div style={{ minWidth: 640 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', borderBottom: '1px solid var(--line-soft)' }}>
                          <div style={{ padding: '8px 14px', fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>프로젝트</div>
                          <div style={{ position: 'relative', padding: '8px 0', background: 'var(--surface-2)' }}>
                            {weekTicks.map((tick, i) => (
                              <span key={i} className="mono" style={{ position: 'absolute', left: `${tick.offsetPct}%`, fontSize: 10, color: 'var(--fg-faint)', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{tick.label}</span>
                            ))}
                            <span className="mono" style={{ position: 'absolute', left: `${timeline.todayPct}%`, top: 0, fontSize: 10, color: 'var(--moon-300)', transform: 'translateX(-50%)', fontWeight: 600, whiteSpace: 'nowrap' }}>오늘</span>
                          </div>
                        </div>
                        {timeline.items.map((item, i) => {
                          const p = item.project;
                          const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
                          const lineToken = item.overdue ? 'var(--danger-line)' : (STATUS_LINE_TOKEN[p.status] || 'var(--line-strong)');
                          return (
                            <div key={p.id} className="hub-row" role="button" tabIndex={0}
                              onClick={() => editProject(p)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editProject(p); } }}
                              style={{
                                display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center',
                                borderBottom: i < timeline.items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', minWidth: 0 }}>
                                <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{pBrand.glyph}</span>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                  <div className="mono" style={{ fontSize: 10.5, color: item.overdue ? 'var(--danger)' : 'var(--fg-faint)', marginTop: 2 }}>{p.due}{item.overdue ? ' · 지남' : ''}</div>
                                </div>
                              </div>
                              <div style={{ position: 'relative', height: 34 }}>
                                <div style={{
                                  position: 'absolute', left: `${item.startPct}%`, width: `${Math.max(item.widthPct, 1.2)}%`,
                                  top: 8, height: 18, borderRadius: 999,
                                  background: 'var(--surface-3)', border: '1px solid var(--line)',
                                  boxShadow: `inset 2px 0 0 ${lineToken}`,
                                  overflow: 'hidden',
                                }}>
                                  <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, p.progress || 0))}%`, background: 'var(--moon-400)', opacity: 0.55 }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>

                {timeline.undated.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 8 }}>기한 미정 · {timeline.undated.length}</div>
                    <Card pad={false}>
                      {timeline.undated.map((p, i) => {
                        const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
                        return (
                          <div key={p.id} className="hub-row" role="button" tabIndex={0}
                            onClick={() => editProject(p)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editProject(p); } }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                              borderBottom: i < timeline.undated.length - 1 ? '1px solid var(--line-soft)' : 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{pBrand.glyph}</span>
                            <span style={{ flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                            <Badge tone={statusTone[p.status]} size="xs">{STATUS_LABEL_KO[p.status] || p.status}</Badge>
                          </div>
                        );
                      })}
                    </Card>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <EditDrawer
        title={projectDraft?.isNew ? '프로젝트 만들기' : '프로젝트 편집'}
        subtitle="브랜드별 프로젝트 기록"
        record={projectDraft}
        fields={[
          { key: 'title', label: '프로젝트명', placeholder: '프로젝트 이름' },
          {
            key: 'brandId',
            label: '브랜드',
            type: 'select',
            options: [
              { value: '', label: '브랜드 선택' },
              ...brands.filter(item => item.key !== 'all').map(item => ({ value: item.id, label: item.name })),
            ],
          },
          { key: 'summary', label: '설명', placeholder: '프로젝트 목적과 범위' },
          {
            key: 'status',
            label: '상태',
            type: 'select',
            options: [
              { value: 'draft', label: '계획' },
              { value: 'active', label: '진행' },
              { value: 'blocked', label: '막힘' },
              { value: 'completed', label: '완료' },
              { value: 'archived', label: '보관' },
            ],
          },
          {
            key: 'priority',
            label: '우선순위',
            type: 'select',
            options: [
              { value: 'low', label: '낮음' },
              { value: 'medium', label: '보통' },
              { value: 'high', label: '높음' },
              { value: 'critical', label: '긴급' },
            ],
          },
          { key: 'progress', label: '진행률 (%)', inputType: 'number', placeholder: '0' },
          { key: 'nextAction', label: '다음 액션', placeholder: '다음에 할 한 가지' },
          { key: 'dueAt', label: '기한', inputType: 'date' },
        ]}
        onChange={(key, value) => setProjectDraft(current => ({ ...current, [key]: value }))}
        onSave={persistProject}
        onClose={() => setProjectDraft(null)}
      />

      <EditDrawer
        title="새 컨테이너"
        subtitle="브랜드·KA·딜·일반을 분류와 함께 만든다"
        record={containerDraft}
        fields={[
          { key: 'name', label: '이름', placeholder: '예: 우리학원 KA · 신규 브랜드' },
          {
            key: 'category',
            label: '분류',
            type: 'select',
            options: [
              { value: 'sns-channel', label: 'SNS 채널' },
              { value: 'ka-deal', label: 'KA·딜' },
              { value: 'general', label: '일반' },
            ],
          },
          {
            key: 'orgScope',
            label: '소속',
            type: 'select',
            options: [
              { value: 'personal', label: '개인' },
              { value: 'classin', label: '업무 · 클래스인' },
            ],
          },
        ]}
        onChange={(key, value) => setContainerDraft(current => ({ ...current, [key]: value }))}
        onSave={persistContainer}
        onClose={() => setContainerDraft(null)}
      />

      <EditDrawer
        title="할 일 만들기"
        subtitle="프로젝트 실행 항목"
        record={taskDraft}
        fields={[
          { key: 'title', label: '할 일', placeholder: '실행할 작업' },
          {
            key: 'projectId',
            label: '프로젝트',
            type: 'select',
            options: [
              { value: '', label: '미지정' },
              ...allProjects.map(item => ({ value: item.id, label: item.name })),
            ],
          },
          {
            key: 'status',
            label: '상태',
            type: 'select',
            options: [
              { value: 'inbox', label: '수집' },
              { value: 'todo', label: '계획' },
              { value: 'doing', label: '진행' },
              { value: 'blocked', label: '대기' },
              { value: 'done', label: '완료' },
            ],
          },
          {
            key: 'priority',
            label: '우선순위',
            type: 'select',
            options: [
              { value: 'low', label: '낮음' },
              { value: 'medium', label: '보통' },
              { value: 'high', label: '높음' },
              { value: 'critical', label: '긴급' },
            ],
          },
          { key: 'dueAt', label: '기한', inputType: 'date' },
        ]}
        onChange={(key, value) => setTaskDraft(current => ({ ...current, [key]: value }))}
        onSave={persistTask}
        onClose={() => setTaskDraft(null)}
      />
    </div>
  );
}

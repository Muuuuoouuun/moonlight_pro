"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Checkbox, EmptyState, SyncBadge, SegmentedControl, EditDrawer, Kbd } from "../hub-primitives";
import { useUndoableAction } from "../use-undoable-action";
import {
  buildProjectCreatePayload,
  buildProjectDraft,
  buildProjectEditDraft,
  buildProjectPatch,
  buildProjectTimeline,
  buildTimelineItemAriaLabel,
  buildContentPipelineTaskSeeds,
  buildTaskBoardColumns,
  buildTaskDraft,
  buildTaskEditDraft,
  buildTaskPatch,
  contentPipelineReloadContains,
  createClientId,
  mergeProjectDetailQuery,
  mergeTimelineProjectQuery,
  projectReloadContains,
  rebaseProjectEditState,
  rotateProjectClientId,
  resolveProjectDraftOrgScope,
  selectProjectAreaId,
  shouldOpenGlobalProjectCreate,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  taskStatusForBoardColumn,
  validateProjectDraft,
} from "@/lib/pms-ui";
import { ProjectCreateDrawer } from "./project-create-drawer";
import { ProjectDetailPanel } from "./project-detail-panel";
import {
  ProjectPortfolioSummary,
  ProjectProgressGauge,
} from "./project-pms-components";
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
  'In progress': 'var(--pms-moonstone)',
  Review: 'var(--line-strong)',
  Planning: 'var(--line-strong)',
  Backlog: 'var(--line-soft)',
  Blocked: 'var(--danger-line)',
  Done: 'var(--line-strong)',
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
// 완료·보관된 프로젝트는 "터미널" — 기본 리스트에서 걷어내고 "완료·보관 항목 보기"
// 토글로만 다시 노출한다. 삭제도 archived로의 같은 상태 전환이라 이 집합을 공유한다.
const TERMINAL_PROJECT_STATUSES = new Set(['completed', 'archived', 'cancelled']);
function isTerminalProject(p) {
  return TERMINAL_PROJECT_STATUSES.has(String(p?.statusKey || '').toLowerCase());
}
const FOLDER_STORAGE_KEY = 'mlp.pms.folders';
// List 뷰의 브랜드 섹션 접기 상태 (전체 브랜드 볼 때만). UI 전용, 브랜드 slug로 영속.
const BRAND_SECTION_KEY = 'mlp.pms.brand-sections';
// 사이드바 드래그 정렬 — 분류(폴더)와 컨테이너(브랜드) 순서. UI 전용, localStorage 영속.
const FOLDER_ORDER_KEY = 'mlp.pms.folder-order';
const BRAND_ORDER_KEY = 'mlp.pms.brand-order';
const DETAIL_FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const selectedProjectId = searchParams.get('project');
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
    areas: [],
    projectEntities: [],
    brands: [EMPTY_ALL_BRAND],
    projects: [],
    updates: [],
    decisions: [],
    notes: [],
    checks: [],
    columns: [],
    partial: false,
    failedSources: [],
    partialSources: [],
    taskAggregation: null,
  });
  const [todos, setTodos] = React.useState([]);
  const [pendingTaskIds, setPendingTaskIds] = React.useState(() => new Set());
  const [contentItems, setContentItems] = React.useState([]);
  const [drag, setDrag] = React.useState(null);
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [showTerminal, setShowTerminal] = React.useState(false);
  // Row-checkbox completion (my-work의 undo 계약과 동일): 체크 → 짧은 취소선
  // 플래시 → 리스트에서 낙관적으로 사라짐 → 3.5초 되돌리기 창이 닫힌 뒤에야
  // 실제 PATCH가 나간다. 실수 탭이 진짜 복구 가능해야 한다.
  const [completingIds, setCompletingIds] = React.useState(() => new Set());
  const [hiddenIds, setHiddenIds] = React.useState(() => new Set());
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();
  const [openDetail, setOpenDetail] = React.useState(null);
  const [mobileDetail, setMobileDetail] = React.useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = React.useState(false);
  const [sidebarHidden, setSidebarHidden] = React.useState(false);
  const [syncState, setSyncState] = React.useState('preview');
  const [readError, setReadError] = React.useState(null);
  const ledgerReadRef = React.useRef({ requestId: 0, controller: null });
  const taskStatusPendingRef = React.useRef(new Set());
  const contentLoadedRef = React.useRef(false);
  const brandMenuRef = React.useRef(null);
  const detailSheetRef = React.useRef(null);
  const detailReturnFocusRef = React.useRef(null);
  const detailAutofocusPresentationRef = React.useRef(null);
  const createdFromQueryRef = React.useRef(false);
  const [orderPending, setOrderPending] = React.useState(false);
  const [orderResult, setOrderResult] = React.useState(null); // { tone: 'ok'|'err', label }
  const [projectDraft, setProjectDraft] = React.useState(null);
  const [projectCreateContext, setProjectCreateContext] = React.useState(null);
  const [projectEditSource, setProjectEditSource] = React.useState(null);
  const [taskDraft, setTaskDraft] = React.useState(null);
  const [taskEditSource, setTaskEditSource] = React.useState(null);
  const [containerDraft, setContainerDraft] = React.useState(null);
  const [localContainers, setLocalContainers] = React.useState([]);
  const drawerOpen = Boolean(projectDraft || taskDraft || containerDraft);

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
  // 파생 목록 memo — 생성 드로어 타이핑(projectDraft만 변경)마다 트리·보드가 전부
  // 재계산되던 것을 차단한다(system-eval P-7; deps는 원장·스코프 변화에만 반응).
  const brandProjects = React.useMemo(
    () => (brand === 'all' ? allProjects : allProjects.filter(p => p.brand === brand)),
    [allProjects, brand],
  );
  // 완료·보관은 본 리스트에 섞지 않는다 — 활성 그룹들 아래의 접힌 아코디언 섹션이
  // 유일한 표시 위치다(§8.1 상태 표시). hiddenIds는 완료 체크 후 되돌리기 창이
  // 열려 있는 동안의 낙관적 숨김.
  const terminalProjects = React.useMemo(() => brandProjects.filter(isTerminalProject), [brandProjects]);
  const terminalCount = terminalProjects.length;
  const projects = React.useMemo(
    () => brandProjects.filter(p => !isTerminalProject(p) && !hiddenIds.has(p.id)),
    [brandProjects, hiddenIds],
  );
  const brandTodos = React.useMemo(
    () => (brand === 'all' ? scopedTodos : scopedTodos.filter(t => t.brand === brand)),
    [scopedTodos, brand],
  );
  const currentBrand = brands.find(b => b.key === brand) || brands[0] || EMPTY_ALL_BRAND;
  const visibleColumns = React.useMemo(() => buildTaskBoardColumns(brandTodos, allProjects), [brandTodos, allProjects]);
  const openTodoCount = React.useMemo(() => brandTodos.filter(t => !t.done).length, [brandTodos]);
  const projectReadPartial = ledger.partialSources?.includes('projects') === true;
  const projectHeaderSummary = (() => {
    const taskReadPartial = ledger.taskAggregation?.partial === true || ledger.partialSources?.includes('tasks');
    const projectCountLabel = projectReadPartial ? `${projects.length}+` : projects.length;
    return ['live', 'partial'].includes(syncState)
      ? `${projectCountLabel} projects · ${taskReadPartial ? `${openTodoCount}+ open todos` : `${openTodoCount} open todos`}`
      : syncState === 'loading'
        ? '프로젝트 원장 확인 중'
        : syncState === 'error'
          ? '프로젝트 원장 읽기 실패'
          : 'preview · 실제 원장 미연결';
  })();

  // selectedProjectId를 deps에 넣으면 상세 열기/닫기(URL param 변경)마다 loadLedger가
  // 재생성되고 마운트 이펙트가 전체 원장을 재조회한다 — 목록 탐색이 전부 네트워크 왕복이
  // 된다. 최신값은 ref로 읽고, 재조회는 아래의 "로드 창 밖 선택" 이펙트만 담당한다.
  const selectedProjectIdRef = React.useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;
  const loadLedger = React.useCallback(async ({
    initial = false,
    projectId = selectedProjectIdRef.current,
  } = {}) => {
    const requestId = ledgerReadRef.current.requestId + 1;
    ledgerReadRef.current.controller?.abort();
    const controller = new AbortController();
    ledgerReadRef.current = { requestId, controller };
    const isCurrentRequest = () => ledgerReadRef.current.requestId === requestId;

    // 최초/범위 전환은 명시적인 loading 상태를 쓰되, 저장 뒤 재검증은 현재 원장을
    // 유지한다. 성공 여부가 정해지기 전까지 행 전체가 사라지는 깜빡임을 막는다.
    setSyncState(current => initial || !['live', 'partial'].includes(current) ? 'loading' : current);
    setReadError(null);
    try {
      const exactProjectId = typeof projectId === 'string' ? projectId.trim() : '';
      const endpoint = exactProjectId
        ? `/api/hub/projects?project=${encodeURIComponent(exactProjectId)}`
        : '/api/hub/projects';
      const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!isCurrentRequest()) return { ok: false, stale: true, projects: [], todos: [] };

      if (!response.ok || !data || data.status === 'error' || data.source === 'error') {
        setSyncState('error');
        setReadError(data?.error || data?.message || `프로젝트 원장 응답 실패 (${response.status})`);
        return { ok: false, projects: [], todos: [] };
      }

      if (data.source === 'supabase') {
        const liveProjects = Array.isArray(data.projects) ? data.projects : [];
        const liveTodos = Array.isArray(data.todos) ? data.todos : [];
        setLedger({
          source: data.source,
          areas: Array.isArray(data.areas) ? data.areas : [],
          projectEntities: Array.isArray(data.projectEntities) ? data.projectEntities : [],
          brands: data.brands?.length ? data.brands : [EMPTY_ALL_BRAND],
          projects: liveProjects,
          updates: Array.isArray(data.updates) ? data.updates : [],
          decisions: Array.isArray(data.decisions) ? data.decisions : [],
          notes: Array.isArray(data.notes) ? data.notes : [],
          checks: Array.isArray(data.checks) ? data.checks : [],
          columns: Array.isArray(data.columns) ? data.columns : [],
          partial: Boolean(data.partial),
          failedSources: Array.isArray(data.failedSources) ? data.failedSources : [],
          partialSources: Array.isArray(data.partialSources) ? data.partialSources : [],
          taskAggregation: data.taskAggregation || null,
          selection: data.selection || null,
        });
        setTodos(liveTodos);
        if (initial) setExpanded(new Set(liveProjects.slice(0, 2).map(p => p.id)));
        setSyncState(data.partial ? 'partial' : 'live');
        setReadError(null);
        return { ok: true, projects: liveProjects, todos: liveTodos };
      }

      setLedger({
        source: 'preview',
        areas: [],
        projectEntities: [],
        brands: [EMPTY_ALL_BRAND],
        projects: [],
        updates: [],
        decisions: [],
        notes: [],
        checks: [],
        columns: [],
        partial: false,
        failedSources: [],
        partialSources: [],
        taskAggregation: null,
        selection: null,
      });
      setTodos([]);
      setSyncState('preview');
      setReadError(null);
      return { ok: false, projects: [], todos: [] };
    } catch (error) {
      if (error?.name === 'AbortError' || !isCurrentRequest()) {
        return { ok: false, stale: true, projects: [], todos: [] };
      }
      setSyncState('error');
      setReadError(error instanceof Error ? error.message : String(error));
      return { ok: false, projects: [], todos: [] };
    }
  }, []);

  // ?project= 딥링크가 "원장 로드 후 1회" 계약(§8.1)을 지킬 수 있도록 최초 로드 완료를
  // 기록한다 — syncState 초기값이 'preview'라서 상태만으로는 로드 전/후를 구분 못 한다.
  const initialLoadDoneRef = React.useRef(false);
  React.useEffect(() => {
    loadLedger({ initial: true }).finally(() => { initialLoadDoneRef.current = true; });
    return () => { ledgerReadRef.current.controller?.abort(); };
  }, [loadLedger]);

  // 상세 열기(?project= 설정)에만 exact read — per-project updates/notes/decisions 보강
  // (selection read-back 계약)을 유지한다. 닫기(null)는 재조회하지 않는다: 이전에는 열기와
  // 닫기 모두 전체 원장을 다시 읽어 목록 탐색이 왕복 2회짜리였다. 기존 원장을 유지한 채
  // 백그라운드로 도는 재검증이라 로딩 깜빡임도 없다.
  React.useEffect(() => {
    if (!selectedProjectId || !initialLoadDoneRef.current) return;
    loadLedger({ projectId: selectedProjectId });
  }, [selectedProjectId, loadLedger]);

  // 프로젝트 상세의 "연관 콘텐츠" 섹션용. 상세를 실제로 열기 전에는 큰 콘텐츠
  // 원장을 요청하지 않고, 성공한 첫 조회만 재사용한다.
  React.useEffect(() => {
    if (!openDetail || contentLoadedRef.current) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/hub/content', { cache: 'no-store', signal: controller.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.source === 'error' || controller.signal.aborted) return;
        if (data.source === 'supabase' && Array.isArray(data.items)) {
          setContentItems(data.items);
        }
        contentLoadedRef.current = true;
      } catch {
        // 콘텐츠 원장 읽기 실패는 무시 — 상세 패널의 보조 섹션이다.
      }
    })();
    return () => { controller.abort(); };
  }, [openDetail]);

  React.useEffect(() => {
    if (!brands.some(b => b.key === brand)) {
      setBrand(wsDefaultBrand);
    }
  }, [brand, brands, wsDefaultBrand]);

  React.useEffect(() => {
    if (view !== 'tree' || !selectedProjectId) {
      setOpenDetail(null);
      return;
    }
    if (allProjects.some(project => project.id === selectedProjectId)) {
      setOpenDetail(selectedProjectId);
      setExpanded((current) => current.has(selectedProjectId)
        ? current
        : new Set([...current, selectedProjectId]));
      return;
    }
    setOpenDetail(null);
  }, [allProjects, selectedProjectId, view]);

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => setMobileDetail(query.matches);
    update();
    if (query.addEventListener) query.addEventListener('change', update);
    else query.addListener?.(update);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', update);
      else query.removeListener?.(update);
    };
  }, []);

  const openProjectDetail = React.useCallback((projectId) => {
    detailReturnFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    const params = mergeProjectDetailQuery(searchParamsRef.current, projectId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setOpenDetail(projectId);
  }, [pathname, router]);

  const closeProjectDetail = React.useCallback(() => {
    const returnFocus = detailReturnFocusRef.current;
    setOpenDetail(null);
    const params = new URLSearchParams(searchParamsRef.current.toString());
    params.delete('project');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    requestAnimationFrame(() => {
      if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
    });
  }, [pathname, router]);

  React.useEffect(() => {
    if (!openDetail || !mobileDetail) {
      detailAutofocusPresentationRef.current = null;
      return undefined;
    }
    const detailPresentationKey = `mobile:${openDetail}`;
    if (detailAutofocusPresentationRef.current === detailPresentationKey) return undefined;
    detailAutofocusPresentationRef.current = detailPresentationKey;
    if (drawerOpen) return undefined;
    const sheet = detailSheetRef.current;
    const detailAutofocusRaf = requestAnimationFrame(() => {
      sheet?.querySelector('[aria-label="상세 닫기"]')?.focus();
    });
    return () => cancelAnimationFrame(detailAutofocusRaf);
  }, [drawerOpen, mobileDetail, openDetail]);

  React.useEffect(() => {
    if (!openDetail || drawerOpen) return undefined;
    const sheet = detailSheetRef.current;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeProjectDetail();
        return;
      }
      if (!mobileDetail || event.key !== 'Tab' || !sheet) return;
      const focusable = Array.from(sheet.querySelectorAll(DETAIL_FOCUSABLE))
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeProjectDetail, drawerOpen, mobileDetail, openDetail]);

  // 데스크톱: 우측 상세 패널 바깥(빈 공간) 클릭 → 패널 접기. 모바일 시트는 이미
  // backdrop이 담당한다. 행 클릭은 제외 — 행은 "다른 프로젝트로 전환"이라 닫기와
  // 경쟁하면 같은 행 재클릭 시 닫힘→즉시 재열림으로 보인다.
  React.useEffect(() => {
    if (!openDetail || drawerOpen || mobileDetail) return undefined;
    const onDown = (event) => {
      const sheet = detailSheetRef.current;
      if (!sheet || sheet.contains(event.target)) return;
      if (event.target.closest('.hub-project-row, .hub-kanban-card, [role="dialog"]')) return;
      closeProjectDetail();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [closeProjectDetail, drawerOpen, mobileDetail, openDetail]);

  // ⌘Z/Ctrl+Z: 되돌리기 창(완료 체크 후 3.5초)이 열려 있는 동안 토스트의
  // 되돌리기 버튼과 같은 동작. 입력 필드 안에서는 브라우저의 텍스트 undo를
  // 가로채지 않는다.
  React.useEffect(() => {
    const action = orderResult?.action;
    if (!action) return undefined;
    const onKey = (event) => {
      if (event.key.toLowerCase() !== 'z' || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      const tag = event.target?.tagName?.toLowerCase?.() || '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;
      event.preventDefault();
      action.onClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderResult]);

  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const createProject = React.useCallback((initialStatus = 'Planning', brandKeyOverride = null) => {
    // Contextual entry points (brand sections and status lanes) may seed location.
    const contextBrand = brandKeyOverride
      ? (brands.find(item => item.key === brandKeyOverride) || null)
      : (brand === 'all' ? null : currentBrand);
    const areaId = selectProjectAreaId(ledger.areas) || '';
    setOrderResult(null);
    setProjectCreateContext(contextBrand?.id === 'all' ? null : contextBrand);
    setProjectEditSource(null);
    setProjectDraft(buildProjectDraft({
      contextBrand,
      areaId,
      initialStatus,
      orgScope: resolveProjectDraftOrgScope({ workspace }),
    }));
    return true;
  }, [brand, brands, currentBrand, ledger.areas, workspace]);

  const openGlobalProjectCreate = React.useCallback(() => {
    const areaId = selectProjectAreaId(ledger.areas) || '';
    setOrderResult(null);
    setProjectCreateContext(null);
    setProjectEditSource(null);
    setProjectDraft(buildProjectDraft({
      areaId,
      orgScope: resolveProjectDraftOrgScope({ workspace }),
    }));
    return true;
  }, [ledger.areas, workspace]);

  // 콘텐츠 프로젝트: 브랜드 시드 + contentPipeline 플래그. 저장이 성공하면 persistProject가
  // CONTENT_STAGES(기획→초안→검토→업로드)를 하위 아이템으로 시드한다.
  const createContentProject = React.useCallback((brandKeyOverride = null) => {
    const contextBrand = brandKeyOverride
      ? (brands.find(item => item.key === brandKeyOverride) || null)
      : (brand === 'all' ? brands.find(item => item.key !== 'all') : currentBrand);
    if (!contextBrand || contextBrand.id === 'all') {
      setOrderResult({ tone: 'err', label: '콘텐츠를 연결할 브랜드가 없습니다' });
      return false;
    }
    const areaId = selectProjectAreaId(ledger.areas, 'content') || selectProjectAreaId(ledger.areas) || '';
    setOrderResult(null);
    setProjectCreateContext(contextBrand?.id === 'all' ? null : contextBrand);
    setProjectEditSource(null);
    setProjectDraft({
      ...buildProjectDraft({
        contextBrand,
        areaId,
        initialStatus: 'Planning',
        orgScope: resolveProjectDraftOrgScope({
          workspace,
          brandOrgScope: contextBrand.orgScope,
          preferBrandScope: true,
        }),
      }),
      title: `${contextBrand.name} 콘텐츠`,
      contentPipeline: true,
    });
    return true;
  }, [brand, brands, currentBrand, ledger.areas, workspace]);

  const editProject = React.useCallback((project) => {
    setProjectCreateContext(null);
    setProjectEditSource(project);
    setProjectDraft(buildProjectEditDraft(project));
  }, []);

  // 완료·보관 둘 다 상태 전환 하나로 — "숨기기"와 "삭제(소프트)"가 같은 archived
  // 전환을 쓰기로 한 결정과 일치한다. 원자료(할 일·업데이트·결정)는 그대로 남는다.
  const setProjectStatus = React.useCallback(async (project, status) => {
    try {
      // 낙관적 동시성 체크(expectedUpdatedAt) 유지 — "미세 오차로 409" 문제는
      // 엔진의 마이크로초 절삭 버그였고 a780c98에서 근본 수정됐다. 이제 409는
      // 진짜로 다른 곳에서 먼저 수정한 경우에만 난다.
      const response = await fetch('/api/hub/projects', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          status,
          ...(project.updatedAt ? { expectedUpdatedAt: project.updatedAt } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'saved') {
        setOrderResult({ tone: 'err', label: data.error || `저장 실패 ${response.status}` });
        return;
      }
      await loadLedger();
      setOrderResult({
        tone: 'ok',
        label: status === 'completed' ? '완료 처리됨' : status === 'archived' ? '보관됨' : '다시 열림',
      });
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  }, [loadLedger]);

  const completeProject = React.useCallback((project) => {
    setProjectStatus(project, project.statusKey === 'completed' ? 'active' : 'completed');
  }, [setProjectStatus]);

  const archiveProject = React.useCallback((project) => {
    setProjectStatus(project, project.statusKey === 'archived' ? 'active' : 'archived');
  }, [setProjectStatus]);

  const PROJECT_STRIKE_MS = 180; // DESIGN.md 모션 가이드(120–180ms)와 일치

  const undoCompleteProject = React.useCallback((project) => {
    if (!cancelUndoable(project.id)) return; // 창이 이미 닫혔으면 PATCH가 나갔다
    setCompletingIds((s) => { const n = new Set(s); n.delete(project.id); return n; });
    setHiddenIds((s) => { const n = new Set(s); n.delete(project.id); return n; });
    setOrderResult({ tone: 'ok', label: '완료 취소됨' });
  }, [cancelUndoable]);

  // 행 체크박스의 완료: 취소선 플래시 → 낙관적 숨김 → 되돌리기 창이 닫힌 뒤에만
  // 실제 PATCH. 디테일 패널이 열린 프로젝트를 완료하면 패널도 닫는다(사라진 행의
  // 유령 패널 방지). 공유 훅이 언마운트 시 flush하므로 "완료됨" 영수증 후 페이지를
  // 떠나도 쓰기가 증발하지 않는다.
  const scheduleCompleteProject = React.useCallback((project) => {
    const id = project.id;
    setCompletingIds((s) => new Set(s).add(id));
    setTimeout(() => {
      setCompletingIds((s) => { const n = new Set(s); n.delete(id); return n; });
      setHiddenIds((s) => new Set(s).add(id));
    }, PROJECT_STRIKE_MS);
    setOpenDetail((cur) => (cur === id ? null : cur));
    setOrderResult({ tone: 'ok', label: '프로젝트 완료됨', action: { label: '되돌리기', onClick: () => undoCompleteProject(project) } });
    scheduleUndoable(id, async () => {
      await setProjectStatus(project, 'completed');
      setHiddenIds((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });
    });
  }, [setProjectStatus, undoCompleteProject, scheduleUndoable]);

  const createTodo = React.useCallback((projectId = null, initialStatus = 'todo') => {
    setTaskEditSource(null);
    setTaskDraft({
      ...buildTaskDraft({ projectId, initialStatus }),
      id: createClientId(),
    });
  }, []);

  const editTodo = React.useCallback((todo) => {
    setTaskEditSource(todo);
    setTaskDraft(buildTaskEditDraft(todo));
  }, []);

  const persistProjectCreate = React.useCallback(async (draft = projectDraft) => {
    if (Object.keys(validateProjectDraft(draft)).length > 0) {
      return { ok: false, status: 'invalid-input', error: 'missing-required-project-fields' };
    }
    try {
      const response = await fetch('/api/hub/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildProjectCreatePayload(draft)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !['saved', 'duplicate'].includes(data.status)) {
        setOrderResult({ tone: 'err', label: data.error || `저장 실패 ${response.status}` });
        return {
          ok: false,
          status: data.status || 'error',
          error: data.error,
          detail: data.detail,
          project: data.project || null,
        };
      }
      const durableProjectId = data.project?.id;
      if (!durableProjectId) {
        setOrderResult({ tone: 'err', label: '저장 응답에 프로젝트 ID가 없습니다' });
        return { ok: false, status: 'error', error: 'missing-durable-project-id', project: data.project || null };
      }
      // 콘텐츠 파이프라인 프로젝트: deterministic IDs make every stage retryable.
      const pipelineSeeds = draft.contentPipeline
        ? buildContentPipelineTaskSeeds(durableProjectId)
        : [];
      if (draft.contentPipeline) {
        // 원장은 tasks를 updated_at.desc로 정렬한다(operating-ledger). 체크리스트가
        // 기획→초안→검토→업로드로 위에서 아래로 읽히게 하려면 기획을 '마지막'에 생성해
        // 가장 최신이 되게 한다 → 역순 시드.
        for (const stage of [...pipelineSeeds].reverse()) {
          const stageResponse = await fetch('/api/hub/tasks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id: stage.id,
              title: stage.title,
              projectId: durableProjectId,
              status: 'todo',
              priority: 'medium',
              source: 'hub-projects',
            }),
          }).catch(() => null);
          const stageData = stageResponse
            ? await stageResponse.json().catch(() => ({}))
            : {};
          if (!stageResponse?.ok || !['saved', 'duplicate'].includes(stageData.status)) {
            const error = stageData.error || `content-pipeline-stage-failed:${stage.title}`;
            setOrderResult({ tone: 'err', label: `콘텐츠 단계 저장 실패 · ${stage.title}` });
            return {
              ok: false,
              status: 'pipeline-error',
              error,
              durableProjectId,
              project: data.project,
              failedStage: stage.title,
            };
          }
        }
      }
      const reloadResult = await loadLedger();
      const projectReloaded = projectReloadContains(reloadResult, durableProjectId);
      const pipelineTaskIds = pipelineSeeds.map((stage) => stage.id);
      if (
        draft.contentPipeline
        && (!projectReloaded || !contentPipelineReloadContains(reloadResult, pipelineTaskIds))
      ) {
        setOrderResult({ tone: 'err', label: '콘텐츠 4단계를 새 원장에서 확인하지 못했습니다' });
        return {
          ok: false,
          status: 'pipeline-error',
          error: 'content-pipeline-not-visible-after-reload',
          durableProjectId,
          project: data.project,
        };
      }
      if (!projectReloaded) {
        setOrderResult({ tone: 'err', label: '저장 후 원장에서 프로젝트를 확인하지 못했습니다' });
        return {
          ok: false,
          status: 'reload-error',
          error: 'created-project-not-visible-after-reload',
          durableProjectId,
          project: data.project,
        };
      }
      setBrand('all');
      const params = mergeProjectDetailQuery(searchParamsRef.current, durableProjectId);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      setExpanded((current) => new Set([...current, durableProjectId]));
      setOpenDetail(durableProjectId);
      setOrderResult({
        tone: 'ok',
        label: draft.contentPipeline ? '콘텐츠 프로젝트 저장됨 · 4단계 시드' : '프로젝트 저장됨',
      });
      return { ok: true, status: data.status, durableProjectId, project: data.project };
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }, [loadLedger, pathname, projectDraft, router]);

  const retryProjectCreateWithNewId = React.useCallback((draft) => {
    const nextDraft = rotateProjectClientId(draft);
    setProjectDraft(nextDraft);
    return nextDraft;
  }, []);

  const openConflictProject = React.useCallback(async (project) => {
    const durableProjectId = project?.id;
    if (!durableProjectId) {
      return { ok: false, status: 'error', error: 'missing-conflict-project-id' };
    }
    const reloadResult = await loadLedger({ projectId: durableProjectId });
    if (!projectReloadContains(reloadResult, durableProjectId)) {
      return { ok: false, status: 'reload-error', error: 'conflict-project-not-visible-after-reload' };
    }
    setBrand('all');
    const params = mergeProjectDetailQuery(searchParamsRef.current, durableProjectId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setOpenDetail(durableProjectId);
    return { ok: true, status: 'opened', durableProjectId };
  }, [loadLedger, pathname, router]);

  const persistProjectEdit = React.useCallback(async () => {
    if (!projectDraft?.title?.trim() || !projectEditSource) {
      return { ok: false, status: 'invalid-input', error: 'missing-project-edit-source' };
    }
    const patch = buildProjectPatch(projectEditSource, projectDraft);
    const dirtyKeys = Object.keys(patch).filter((key) => !['id', 'expectedUpdatedAt'].includes(key));
    if (dirtyKeys.length === 0) return { ok: true, status: 'saved' };

    try {
      const response = await fetch('/api/hub/projects', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'saved') {
        if (data.status === 'conflict' && data.project) {
          const message = '최신 원장 기준을 불러왔습니다. 입력을 유지했으니 다시 저장하면 새 기준으로 재시도합니다.';
          const rebasedEdit = rebaseProjectEditState(projectEditSource, projectDraft, data.project);
          setProjectEditSource(rebasedEdit.source);
          setProjectDraft(rebasedEdit.draft);
          setOrderResult({ tone: 'err', label: message });
          return {
            ok: false,
            status: 'conflict',
            error: data.error,
            detail: data.detail,
            project: data.project,
            message,
          };
        }
        setOrderResult({ tone: 'err', label: data.error || `업데이트 실패 ${response.status}` });
        return {
          ok: false,
          status: data.status || 'error',
          error: data.error,
          detail: data.detail,
          project: data.project || null,
        };
      }
      await loadLedger();
      setOpenDetail(data.project?.id || projectEditSource.id);
      setOrderResult({ tone: 'ok', label: '프로젝트 업데이트됨' });
      return { ok: true, status: 'saved' };
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }, [loadLedger, projectDraft, projectEditSource]);

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

  // 기존 컨테이너 편집 — 이름·분류·소속만. glyph는 드로어에 없지만 update_brand의
  // meta 통째-교체에서 유실되지 않도록 draft에 실어 보낸다.
  const editContainer = React.useCallback((container) => {
    if (!container?.id || container.key === 'all') return;
    setContainerDraft({
      kind: 'container',
      isNew: false,
      id: container.id,
      name: container.name || '',
      category: container.category || 'general',
      orgScope: container.orgScope || 'personal',
      glyph: container.glyph || '',
    });
  }, []);

  // Create a container (brand row). saved/duplicate → reload; preview (Engine not
  // configured) → keep an optimistic local row so the folder fills immediately.
  // Edit mode (isNew:false) PATCHes name·category·orgScope — slug/key는 그대로 둔다.
  const persistContainer = React.useCallback(async () => {
    const name = containerDraft?.name?.trim();
    if (!name) return { ok: false, status: 'invalid-input' };

    if (containerDraft.isNew === false) {
      try {
        const response = await fetch('/api/hub/brands', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: containerDraft.id,
            name,
            category: containerDraft.category,
            orgScope: containerDraft.orgScope,
            ...(containerDraft.glyph ? { glyph: containerDraft.glyph } : {}),
            source: 'hub-projects',
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.status === 'saved') {
          await loadLedger();
          setOrderResult({ tone: 'ok', label: '컨테이너 수정됨' });
          return { ok: true, status: 'saved' };
        }
        if (data.status === 'preview') {
          // 원장 행의 로컬 오버레이는 없다 — 저장 안 된 수정을 반영된 것처럼 그리지 않는다.
          return { ok: true, status: 'preview' };
        }
        setOrderResult({ tone: 'err', label: data.error || `수정 실패 ${response.status}` });
        return { ok: false, status: data.status || 'error' };
      } catch (error) {
        setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
        return { ok: false, status: 'error' };
      }
    }

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
        const durableContainerId = data.brand?.id;
        setLocalContainers(prev => prev.filter(c => c.id !== containerDraft.id));
        await loadLedger();
        setBrand(slug);
        if (durableContainerId) {
          setProjectDraft(current => current?.isNew && !current.brandId
            ? { ...current, brandId: durableContainerId, brandKey: slug }
            : current);
        }
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

    if (taskEditSource) {
      const patch = buildTaskPatch(taskEditSource, taskDraft);
      if (Object.keys(patch).length <= 1) {
        // Nothing changed — treat the save as a no-op success instead of an empty-patch error.
        return { ok: true, status: 'saved' };
      }
      try {
        const response = await fetch('/api/hub/tasks', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'saved') {
          setOrderResult({ tone: 'err', label: data.error || `저장 실패 ${response.status}` });
          return { ok: false, status: data.status || 'error' };
        }
        await loadLedger();
        setTaskEditSource(null);
        setOrderResult({ tone: 'ok', label: '할 일 저장됨' });
        return { ok: true, status: data.status };
      } catch (error) {
        setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
        return { ok: false, status: 'error' };
      }
    }

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
          description: taskDraft.description || '',
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
  }, [loadLedger, taskDraft, taskEditSource]);

  // 기존 할 일 삭제 — hub-direct DELETE (엔진 파이프라인엔 삭제 액션이 없다, tasks route 참고).
  const deleteTask = React.useCallback(async () => {
    const id = taskEditSource?.id;
    if (!id) return;
    try {
      const response = await fetch('/api/hub/tasks', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && ['saved', 'preview'].includes(data.status)) {
        if (data.status === 'saved') await loadLedger();
        setTaskEditSource(null);
        setOrderResult({ tone: 'ok', label: data.status === 'preview' ? '할 일 삭제 · 저장 대기(preview)' : '할 일 삭제됨' });
        return;
      }
      setOrderResult({ tone: 'err', label: data.error || `삭제 실패 ${response.status}` });
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  }, [loadLedger, taskEditSource]);

  const updateTaskStatus = React.useCallback(async (id, status) => {
    if (taskStatusPendingRef.current.has(id)) return false;
    taskStatusPendingRef.current.add(id);
    setPendingTaskIds(new Set(taskStatusPendingRef.current));
    // 낙관 flip — 체크박스가 PATCH+전체 원장 read를 직렬로 기다리며 멈춰 있던 것을
    // 즉시 반영하고, 실패 시 원상복구한다(2026-08-05 re-audit 속도 #2).
    const prevTodo = todos.find(item => item.id === id);
    const prevStatus = prevTodo?.status;
    const rollback = () => {
      if (prevTodo) setTodos(ts => ts.map(t => (t.id === id ? { ...t, status: prevStatus, done: prevStatus === 'done' } : t)));
    };
    if (prevTodo) {
      setTodos(ts => ts.map(t => (t.id === id ? { ...t, status, done: status === 'done' } : t)));
    }
    try {
      const response = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'saved') {
        rollback();
        throw new Error(data.error || `상태 저장 실패 ${response.status}`);
      }
      // 백그라운드 재검증(카운트·보드 정합) — UI는 이미 정착했으니 기다리지 않는다.
      loadLedger();
      return true;
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith('상태 저장 실패'))) rollback();
      throw error;
    } finally {
      taskStatusPendingRef.current.delete(id);
      setPendingTaskIds(new Set(taskStatusPendingRef.current));
    }
  }, [loadLedger, todos]);

  const toggleTodo = React.useCallback(async (id) => {
    const todo = todos.find(item => item.id === id);
    if (!todo) return;
    try {
      const updated = await updateTaskStatus(id, todo.status === 'done' ? 'todo' : 'done');
      if (!updated) return;
      setOrderResult({ tone: 'ok', label: todo.status === 'done' ? '할 일 다시 열림' : '할 일 완료됨' });
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  }, [todos, updateTaskStatus]);

  const moveCard = React.useCallback(async (id, column) => {
    const status = taskStatusForBoardColumn(column);
    if (!status) return;
    try {
      const updated = await updateTaskStatus(id, status);
      if (!updated) return;
      setOrderResult({ tone: 'ok', label: '보드 상태 저장됨' });
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  }, [updateTaskStatus]);

  const createBoardCard = React.useCallback((column) => {
    createTodo(null, taskStatusForBoardColumn(column) || 'todo');
  }, [createTodo]);

  const statusTone = { 'In progress': 'moon', Review: 'neutral', Planning: 'neutral', Backlog: 'neutral', Blocked: 'danger', Done: 'neutral' };
  const prioTone = { critical: 'danger', high: 'danger', med: 'neutral', medium: 'neutral', low: 'neutral' };
  const updateTone = { reported: 'neutral', active: 'moon', blocked: 'danger', done: 'neutral' };
  const checkTone = { pending: 'neutral', done: 'neutral', skipped: 'neutral', blocked: 'danger' };
  const contentTone = { idea: 'neutral', draft: 'neutral', review: 'moon', scheduled: 'info', published: 'success', archived: 'neutral' };

  React.useEffect(() => {
    const close = (e) => { if (brandMenuRef.current && !brandMenuRef.current.contains(e.target)) setBrandMenuOpen(false); };
    if (brandMenuOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [brandMenuOpen]);

  React.useEffect(() => {
    if (searchParams.get('new') !== 'project') {
      createdFromQueryRef.current = false;
      return;
    }
    if (drawerOpen || !initialLoadDoneRef.current || syncState === 'loading') return;
    if (createdFromQueryRef.current) return;
    const opened = openGlobalProjectCreate();
    if (!opened) return;
    createdFromQueryRef.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [drawerOpen, openGlobalProjectCreate, pathname, router, searchParams, syncState]);

  React.useEffect(() => {
    const onKey = (event) => {
      if (!shouldOpenGlobalProjectCreate(event, { drawerOpen })) return;
      // 첫 원장 로드 전에는 areas가 비어 "업무 분야가 없습니다" 오탐 에러가 뜬다 —
      // ?new=project 딥링크 이펙트와 같은 로드 완료 가드를 공유한다.
      if (!initialLoadDoneRef.current || syncState === 'loading') return;
      // N은 현재 뷰의 primary 생성을 따른다 — To-dos 뷰의 primary는 할 일 생성이라,
      // 여기서도 프로젝트를 만들면 보고 있는 목록과 무관한 레코드가 생긴다.
      if (view === 'todos') {
        createTodo();
        event.preventDefault();
        return;
      }
      const opened = openGlobalProjectCreate();
      if (opened) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createTodo, drawerOpen, openGlobalProjectCreate, syncState, view]);

  // ?project=<id> is the canonical detail selection. Normalize only the view;
  // the project id stays in the URL so reloads and exact bounded reads remain open.
  React.useEffect(() => {
    if (!initialLoadDoneRef.current || syncState === 'loading') return;
    if (!selectedProjectId || view === 'tree') return;
    const params = mergeProjectDetailQuery(searchParams, selectedProjectId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, selectedProjectId, syncState, view]);

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
              // 새 변동은 손실 상태가 아니다 (§5.2 no-warning-by-default) — 조용한 문스톤 점.
              background: 'var(--moon-400)',
              boxShadow: '0 0 0 2px ' + (active ? 'var(--surface-3)' : 'var(--surface)'),
            }} />
          )}
        </span>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
        {changes > 0 && (
          <span style={{
            fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
            minWidth: 16, height: 14, padding: '0 5px',
            borderRadius: 999, background: 'var(--surface-3)', color: 'var(--fg-muted)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            letterSpacing: '-0.02em',
          }}>{changes > 99 ? '99+' : changes}</span>
        )}
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: active ? 'var(--surface)' : 'transparent', padding: '1px 5px', borderRadius: 4 }}>{count}</span>
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
              background: 'var(--moon-400)',
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
                borderRadius: 999, background: 'var(--surface-3)', color: 'var(--fg-muted)',
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
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{count}p</span>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{bTodos}t</span>
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
          {currentBrand && currentBrand.key !== 'all' && currentBrand.id && (
            <IconButton icon="edit" size={24} iconSize={12} onClick={() => editContainer(currentBrand)} tooltip={`${currentBrand.name} 컨테이너 편집`} />
          )}
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
        <div className={`hub-page-header hub-project-page-header${openDetail ? ' hub-project-page-header--detail' : ''}`} style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {sidebarHidden && (
            <IconButton icon="chevronR" size={28} iconSize={14} onClick={() => setSidebarHidden(false)} tooltip="브랜드 사이드바 펼치기" />
          )}
          <div ref={brandMenuRef} style={{ position: 'relative' }}>
            <button className="hub-project-brand-trigger" aria-label={`${currentBrand.name} 범위 선택`} onClick={() => setBrandMenuOpen(o => !o)} style={{
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
                  // 새 변동 카운트 — 손실 신호가 아니므로 중립 칩 (§5.2), 글자는 10.5px 플로어.
                  if (brand === 'all' && totalChanges > 0) {
                    return (
                      <span style={{
                        position: 'absolute', top: -5, right: -7,
                        minWidth: 15, height: 15, padding: '0 4px',
                        borderRadius: 999, background: 'var(--surface-3)', color: 'var(--fg-muted)',
                        fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 2px var(--surface-2)',
                      }}>{totalChanges}</span>
                    );
                  }
                  if (brand !== 'all' && currentBrand.changes > 0) {
                    return (
                      <span style={{
                        position: 'absolute', top: -5, right: -7,
                        minWidth: 15, height: 15, padding: '0 4px',
                        borderRadius: 999, background: 'var(--surface-3)', color: 'var(--fg-muted)',
                        fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 2px var(--surface-2)',
                      }}>{currentBrand.changes}</span>
                    );
                  }
                  return null;
                })()}
              </span>
              <span className="hub-project-brand-trigger__meta" style={{ display: 'contents' }}>
                <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>{currentBrand.name}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--line-soft)' }}>
                  {brand === 'all' ? allProjects.length : (currentBrand.projects || 0)}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginLeft: 2, transform: brandMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
              </span>
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
          <div className="hub-project-header-context">
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Projects</h2>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
              {projectHeaderSummary} · {currentBrand.desc}
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
            // live region 필수(§11) — 되돌리기 창 개방을 스크린리더에도 알린다.
            // 완료 카피는 중립(§5.3 done ≠ green), 에러만 danger.
            <span
              className="mono"
              role={orderResult.tone === 'err' ? 'alert' : 'status'}
              aria-live="polite"
              style={{ fontSize: 10.5, color: orderResult.tone === 'err' ? 'var(--danger)' : 'var(--fg-muted)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              {orderResult.label}
              {orderResult.action && (
                <button
                  onClick={orderResult.action.onClick}
                  style={{ fontSize: 10.5, color: 'var(--moon-200)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {orderResult.action.label} <Kbd>⌘Z</Kbd>
                </button>
              )}
            </span>
          )}
          {view === 'todos' && (
            <Button variant="primary" size="sm" icon="plus" onClick={() => createTodo()}>To-do <Kbd>N</Kbd></Button>
          )}
          <Button className="hub-project-primary-control" variant={view === 'todos' ? 'outline' : 'primary'} size="sm" icon="plus" onClick={openGlobalProjectCreate}>
            Project {view !== 'todos' && <Kbd>N</Kbd>}
          </Button>
        </div>

        {view === 'tree' && (
          <div
            className="hub-projects-main-grid"
            data-detail-open={openDetail ? 'true' : 'false'}
            style={{ display: 'grid', gridTemplateColumns: openDetail ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)', flex: 1, overflow: 'hidden' }}
          >
            <div className="scroll-y" style={{ padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                <ProjectPortfolioSummary projects={projects} sourceState={syncState} projectCorePartial={projectReadPartial} />
                {syncState === 'error' && (
                  <Card>
                    <EmptyState
                      icon="projects"
                      title="프로젝트 원장을 읽지 못했습니다"
                      description={readError || "연결 상태를 확인한 뒤 다시 시도하세요. 실패한 읽기는 live로 표시하지 않습니다."}
                      action={<Button variant="outline" size="sm" onClick={() => loadLedger({ initial: true })}>다시 시도</Button>}
                    />
                  </Card>
                )}
                {syncState === 'partial' && (
                  <Card>
                    <EmptyState
                      icon="projects"
                      title="프로젝트 일부 원장을 읽지 못했습니다"
                      description={`${[...(ledger.failedSources || []), ...(ledger.partialSources || [])].join(', ')} 기록 일부를 확인할 수 없습니다. 읽힌 프로젝트와 할 일 데이터는 유지합니다.`}
                      action={<Button variant="outline" size="sm" onClick={() => loadLedger({ initial: true })}>다시 시도</Button>}
                    />
                  </Card>
                )}
                {!['error', 'loading'].includes(syncState) && projects.length === 0 && (
                  <Card>
                    <EmptyState
                      icon="projects"
                      title={syncState === 'preview' ? "preview · 실제 프로젝트 없음" : "프로젝트 기록이 비어 있습니다"}
                      description={syncState === 'preview'
                        ? "Supabase가 연결되지 않았습니다. 예시 데이터를 섞지 않으며, 연결 후 실제 프로젝트만 표시합니다."
                        : "Supabase 연결은 live 상태입니다. 첫 프로젝트를 만들거나 외부 project webhook을 보내면 이 목록에 바로 표시됩니다."}
                      action={<Button variant="primary" size="sm" icon="plus" onClick={() => createProject()}>Project</Button>}
                    />
                  </Card>
                )}
                {(() => {
                  const STATUS_GROUPS = [
                    { key: 'In progress', label: '진행중', tone: 'var(--pms-moonstone)' },
                    { key: 'Blocked',     label: '막힘',   tone: 'var(--danger)' },
                    { key: 'Review',      label: '검토',   tone: 'var(--line-strong)' },
                    { key: 'Planning',    label: '계획',   tone: 'var(--pms-moonstone)' },
                    { key: 'Done',        label: '완료',   tone: 'var(--fg-dim)' },
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
                      <Card pad={false} className="hub-table-card hub-project-table">
                        <div className="hub-project-list-head">
                          <span aria-hidden="true" />
                          <span>프로젝트 · 컨테이너</span>
                          <span>다음 행동</span>
                          <span>기한 · 위험</span>
                          <span>근거 진척</span>
                          <span>상태 · 우선순위</span>
                        </div>
                        {items.map((p, pi) => {
                          const isOpen = expanded.has(p.id);
                          const pTodos = scopedTodos.filter(t => t.project === p.id);
                          const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
                          const isSel = openDetail === p.id;
                          const dueTime = p.dueAt ? new Date(p.dueAt).getTime() : Number.NaN;
                          const terminal = isTerminalProject(p);
                          const overdue = !terminal && Number.isFinite(dueTime) && dueTime < new Date().setHours(0, 0, 0, 0);
                          const blocked = String(p.statusKey || '').toLowerCase() === 'blocked' || p.status === 'Blocked';
                          const nextAction = p.displayNextAction || p.projectNextAction || (p.updateEvidencePartial ? '업데이트 기록 미확인' : '다음 행동 미정');
                          const completing = completingIds.has(p.id);
                          return (
                            <React.Fragment key={p.id}>
                              <div className="hub-project-row" data-selected={isSel ? 'true' : 'false'} data-completing={completing ? 'true' : 'false'} data-terminal={terminal ? 'true' : 'false'}>
                                <div className="hub-project-row__controls">
                                  <button
                                    type="button"
                                    className="hub-project-expand"
                                    aria-label={`${p.name} 하위 항목 ${isOpen ? '접기' : '펼치기'}`}
                                    aria-expanded={isOpen}
                                    onClick={() => toggleExpand(p.id)}
                                  >
                                  <span style={{ display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10 }}>▶</span>
                                  </button>
                                  {/* 하위 아이템 체크박스와 같은 의미(완료)로 통일 — 선택은 행
                                      클릭이 담당한다. 체크 → 되돌리기 창과 함께 리스트에서 빠지고
                                      아래 완료·보관 섹션으로 이동. */}
                                  <Checkbox
                                    checked={terminal || completing}
                                    onChange={() => terminal ? completeProject(p) : scheduleCompleteProject(p)}
                                    size={16}
                                    label={terminal ? `다시 열기: ${p.name}` : `완료: ${p.name}`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="hub-project-row__open"
                                  aria-label={`${p.name} 상세 열기`}
                                  onClick={() => openProjectDetail(p.id)}
                                >
                                  <div className="hub-project-identity">
                                    <span className="hub-project-identity__glyph" aria-hidden="true">{pBrand.glyph}</span>
                                    <div className="hub-project-identity__copy">
                                      <strong>{p.name}</strong>
                                      <span>{pBrand.name} · 할 일 {pTodos.length}</span>
                                    </div>
                                  </div>
                                  <div className="hub-project-next-action">
                                    <span>다음 행동</span>
                                    <strong>{nextAction}</strong>
                                  </div>
                                  <div className="hub-project-due-risk">
                                    <span className="mono">{p.due || '기한 없음'}</span>
                                    {(blocked || overdue) && <span className="hub-project-risk-label">{blocked ? '막힘' : '기한 지남'}</span>}
                                    {!blocked && !overdue && <span>위험 신호 없음</span>}
                                  </div>
                                </button>
                                <ProjectProgressGauge
                                  progress={p.displayProgress}
                                  compact
                                  ariaLabel={`${p.name} 진척`}
                                />
                                <div className="hub-project-secondary-state">
                                  <Badge tone={statusTone[p.status]} size="xs">{STATUS_LABEL_KO[p.status] || p.status}</Badge>
                                  <span><Dot tone={prioTone[p.priority]} size={5} />{p.priority || 'medium'}</span>
                                </div>
                              </div>

                              {isOpen && (
                                <div className="hub-project-subtasks" style={{ borderBottom: pi < items.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                                  <div className="hub-project-subtasks__head">하위 아이템 · {pTodos.filter(t => t.done).length}/{pTodos.length} 완료</div>
                                  {pTodos.length === 0 && (
                                    <div className="hub-project-subtasks__empty">하위 아이템이 없습니다.</div>
                                  )}
                                  {pTodos.map((t, ti) => (
                                    <div key={t.id} className="hub-project-subtask" data-done={t.done ? 'true' : 'false'} style={{ borderBottom: ti < pTodos.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                                      <Checkbox
                                        checked={t.done}
                                        onChange={() => toggleTodo(t.id)}
                                        disabled={pendingTaskIds.has(t.id)}
                                        size={16}
                                        label={`${t.done ? '다시 열기' : '완료'}: ${t.title}`}
                                      />
                                      <div
                                        className="hub-project-subtask__title hub-row"
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`${t.title} 편집`}
                                        onClick={() => editTodo(t)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editTodo(t); } }}
                                        style={{ borderRadius: 'var(--r-sm)', padding: '4px 6px', margin: '-4px -6px' }}
                                      >
                                        <Dot tone={prioTone[t.priority]} size={4} />
                                        <span>{t.title}</span>
                                      </div>
                                      <span className="hub-project-subtask__assignee">{t.assignee}</span>
                                      <span className="mono hub-project-subtask__due">{t.due || '기한 없음'}</span>
                                    </div>
                                  ))}
                                  <button className="hub-project-subtasks__add" onClick={() => createTodo(p.id)}>＋ 하위 아이템 추가</button>
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
                          }}>＋ 콘텐츠 <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>기획·초안·검토·업로드</span></button>
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

                {/* 완료·보관 — 본 리스트에 섞지 않고 항상 맨 아래 접힌 섹션(기본 접힘).
                    §8.1 펼침/접힘 계약: aria-expanded + 셰브런. 행은 낮은 대비로
                    렌더해 활성 작업과 시각적 층을 분리한다. */}
                {terminalCount > 0 && (
                  <div>
                    <button
                      type="button"
                      className="hub-row"
                      aria-expanded={showTerminal}
                      onClick={() => setShowTerminal(v => !v)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', marginBottom: showTerminal ? 10 : 0, borderRadius: 'var(--r-sm)',
                        textAlign: 'left', color: 'var(--fg-dim)',
                      }}
                    >
                      <Iconed name="chevronD" size={12} style={{ transform: showTerminal ? 'none' : 'rotate(-90deg)', color: 'var(--fg-faint)' }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>완료·보관</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{terminalCount}</span>
                    </button>
                    {showTerminal && (
                      <Card pad={false} className="hub-table-card">
                        {terminalProjects.map((p, pi) => {
                          const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
                          return (
                            <div
                              key={p.id}
                              className="hub-row"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: 'var(--pad-y) var(--pad-x)', minHeight: 'var(--row-h)',
                                borderBottom: pi < terminalProjects.length - 1 ? '1px solid var(--line-soft)' : 'none',
                              }}
                            >
                              <Checkbox
                                checked
                                onChange={() => setProjectStatus(p, 'active')}
                                size={16}
                                label={`다시 열기: ${p.name}`}
                              />
                              <span style={{ fontSize: 12.5, color: 'var(--fg-faint)' }} aria-hidden="true">{pBrand.glyph}</span>
                              <button
                                type="button"
                                className="hub-row"
                                onClick={() => openProjectDetail(p.id)}
                                style={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', margin: '-2px -4px', borderRadius: 'var(--r-sm)' }}
                              >
                                <span style={{ fontSize: 13, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                <span style={{ fontSize: 11, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{pBrand.name}</span>
                              </button>
                              <Badge tone="neutral" size="xs">{STATUS_LABEL_KO[p.status] || p.status}</Badge>
                              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', flexShrink: 0 }}>{p.due || ''}</span>
                            </div>
                          );
                        })}
                      </Card>
                    )}
                  </div>
                )}
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
              const pContent = p.brandId ? contentItems.filter(c => c.brandId === p.brandId).slice(0, 5) : [];
              const detailFailedSources = ledger.selection?.projectId === p.id
                ? ledger.selection.failedSources
                : ledger.failedSources;
              return (
                <div
                  ref={detailSheetRef}
                  className="hub-project-detail-sheet"
                  role={mobileDetail ? 'dialog' : 'region'}
                  aria-modal={mobileDetail ? 'true' : undefined}
                  aria-label={`${p.name} 프로젝트 상세`}
                >
                  <button type="button" tabIndex={-1} className="hub-project-detail-sheet__backdrop" aria-label="프로젝트 상세 닫기" onClick={closeProjectDetail} />
                  <ProjectDetailPanel
                    project={p}
                    container={pBrand}
                    todos={pTodos}
                    updates={pUpdates}
                    decisions={pDecisions}
                    notes={pNotes}
                    checks={pChecks}
                    content={pContent}
                    syncState={syncState}
                    failedSources={detailFailedSources}
                    statusTone={statusTone}
                    updateTone={updateTone}
                    checkTone={checkTone}
                    contentTone={contentTone}
                    orderPending={orderPending}
                    orderResult={orderResult}
                    pendingTodoIds={pendingTaskIds}
                    onClose={closeProjectDetail}
                    onEdit={editProject}
                    onToggleTodo={toggleTodo}
                    onCreateTodo={createTodo}
                    onOpen={(project) => {
                      setExpanded(prev => new Set([...prev, project.id]));
                      setView('tree');
                    }}
                    onSendOrder={sendProjectOrder}
                    onComplete={completeProject}
                    onArchive={archiveProject}
                  />
                </div>
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
                          <div key={t.id} className="hub-project-todo-row" data-done={t.done ? 'true' : 'false'} data-last={i === items.length - 1 ? 'true' : 'false'}>
                            <div className="hub-project-todo-check">
                              <Checkbox
                                checked={t.done}
                                onChange={() => toggleTodo(t.id)}
                                disabled={pendingTaskIds.has(t.id)}
                                size={16}
                                label={`${t.done ? '다시 열기' : '완료'}: ${t.title}`}
                              />
                            </div>
                            <div
                              className="hub-project-todo-main hub-row"
                              role="button"
                              tabIndex={0}
                              aria-label={`${t.title} 편집`}
                              onClick={() => editTodo(t)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editTodo(t); } }}
                              style={{ minWidth: 0, borderRadius: 'var(--r-sm)', padding: '2px 6px', margin: '-2px -6px' }}
                            >
                              <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>
                                {pBrand.glyph} {pBrand.name} · {proj?.name}
                              </div>
                            </div>
                            <span className="hub-project-todo-assignee">{t.assignee}</span>
                            <span className="hub-project-todo-priority">
                              <Dot tone={prioTone[t.priority]} />{t.priority}
                            </span>
                            <span className="mono hub-project-todo-due">{t.due}</span>
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
                      // 보드 카드도 열 수 있어야 한다(§8.1 edit 계약) — 이전에는 이동만 가능하고
                      // 마우스로도 키보드로도 편집을 열 방법이 없었다. 클릭/Enter → 태스크 드로어,
                      // project-* 카드는 프로젝트 상세로.
                      role="button"
                      tabIndex={0}
                      aria-label={`${c.title} 열기`}
                      onClick={() => {
                        if (String(c.id).startsWith('project-')) { openProjectDetail(String(c.id).slice('project-'.length)); return; }
                        const t = todos.find(x => x.id === c.id);
                        if (t) editTodo(t);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (String(c.id).startsWith('project-')) { openProjectDetail(String(c.id).slice('project-'.length)); return; }
                        const t = todos.find(x => x.id === c.id);
                        if (t) editTodo(t);
                      }}
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
                      {c.due && <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 6 }}>기한 · {c.due}</div>}
                      <select
                        className="hub-project-board-status"
                        aria-label={`${c.title} 상태 변경`}
                        aria-busy={pendingTaskIds.has(c.id) ? 'true' : undefined}
                        disabled={pendingTaskIds.has(c.id)}
                        value={col.key}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) => moveCard(c.id, event.target.value)}
                      >
                        {visibleColumns.map(option => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
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
                      description="실제 시작일이 있는 프로젝트는 기간으로, 마감일만 있으면 마감 지점으로 표시됩니다."
                      action={<Button variant="primary" size="sm" icon="plus" onClick={() => createProject()}>Project</Button>}
                    />
                  </Card>
                </div>
              </div>
            );
          }
          const timeline = buildProjectTimeline(projects);
          const timelineProjectHref = (projectId) => {
            const params = mergeTimelineProjectQuery(searchParams, projectId);
            const query = params.toString();
            return query ? `${pathname}?${query}` : pathname;
          };
          const weekTicks = [];
          for (let d = 0; timeline.totalDays > 0 && d <= timeline.totalDays; d += 7) {
            const tickDate = new Date(timeline.windowStart.getTime() + d * 86_400_000);
            weekTicks.push({
              offsetPct: (d / timeline.totalDays) * 100,
              label: new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(tickDate),
            });
          }
          return (
            <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                {selectedProjectId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
                    <a
                      href={`/dashboard/work/projects?project=${encodeURIComponent(selectedProjectId)}`}
                      style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--moon-300)', fontSize: 12.5, textUnderlineOffset: 3 }}
                    >
                      프로젝트 상세로 돌아가기
                    </a>
                    <span className="mono" style={{ color: 'var(--fg-faint)', fontSize: 10.5 }}>
                      {projects.find(project => project.id === selectedProjectId)?.name || '선택한 프로젝트'}
                    </span>
                  </div>
                )}
                <Card pad={false} className="hub-table-card">
                  {timeline.items.length === 0 ? (
                    <div style={{ padding: '18px 14px', fontSize: 11.5, color: 'var(--fg-faint)' }}>기한이 지정된 프로젝트가 없습니다. 프로젝트를 편집해 기한을 지정하면 여기 축 위에 표시됩니다.</div>
                  ) : (
                    // Fixed inner min-width + horizontal scroll (same pattern as the board
                    // view's hub-scroll-x) so the ruler and bars never get squeezed unreadable
                    // on narrow viewports — the label column alone would eat a phone's width.
                    <div className="hub-scroll-x" style={{ overflowX: 'auto' }}>
                      <div style={{ minWidth: 640 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', borderBottom: '1px solid var(--line-soft)' }}>
                          <div style={{ padding: '8px 14px', fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>프로젝트</div>
                          <div style={{ position: 'relative', padding: '8px 0', background: 'var(--surface-2)' }}>
                            {weekTicks.map((tick, i) => (
                              <span key={i} className="mono" style={{ position: 'absolute', left: `${tick.offsetPct}%`, fontSize: 10.5, color: 'var(--fg-faint)', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{tick.label}</span>
                            ))}
                            <span className="mono" style={{ position: 'absolute', left: `${timeline.todayPct}%`, top: 0, fontSize: 10.5, color: 'var(--moon-300)', transform: 'translateX(-50%)', fontWeight: 600, whiteSpace: 'nowrap' }}>오늘</span>
                          </div>
                        </div>
                        {timeline.items.map((item, i) => {
                          const p = item.project;
                          const pBrand = brands.find(b => b.key === p.brand) || brands[0] || EMPTY_ALL_BRAND;
                          const lineToken = item.overdue ? 'var(--danger-line)' : (STATUS_LINE_TOKEN[p.status] || 'var(--line-strong)');
                          return (
                            <div key={p.id} className="hub-row"
                              data-selected={selectedProjectId === p.id ? 'true' : 'false'}
                              data-kind={item.kind}
                              style={{
                                display: 'grid', gridTemplateColumns: '260px 1fr', alignItems: 'center', minHeight: 44,
                                borderBottom: i < timeline.items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                                background: selectedProjectId === p.id ? 'var(--surface-2)' : 'transparent',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', minWidth: 0 }}>
                                <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{pBrand.glyph}</span>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <a
                                    href={timelineProjectHref(p.id)}
                                    aria-current={selectedProjectId === p.id ? 'page' : undefined}
                                    aria-label={buildTimelineItemAriaLabel(item)}
                                    style={{ minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'inherit', textDecoration: 'none' }}
                                  >
                                    <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                    <span className="mono" style={{ fontSize: 10.5, color: item.overdue ? 'var(--danger)' : 'var(--fg-faint)', marginTop: 2 }}>{p.due}{item.overdue ? ' · 지남' : ''}</span>
                                  </a>
                                  <div style={{ marginTop: 7 }}>
                                    <ProjectProgressGauge progress={p.displayProgress} compact ariaLabel={`${p.name} 진척`} />
                                  </div>
                                </div>
                              </div>
                              <div style={{ position: 'relative', minHeight: 54 }}>
                                {item.kind === 'range' ? (
                                  <div style={{
                                    position: 'absolute', left: `${item.startPct}%`, width: `${item.widthPct}%`,
                                    top: 18, height: 18, borderRadius: 999,
                                    background: 'var(--surface-3)', border: '1px solid var(--line)',
                                    boxShadow: `inset 1px 0 0 ${lineToken}`,
                                  }} />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      position: 'absolute', left: `${item.markerPct}%`, top: 18,
                                      width: 16, height: 16, borderRadius: 999,
                                      background: 'var(--surface-3)', border: `1px solid ${lineToken}`,
                                      boxShadow: `inset 0 0 0 3px var(--surface-3), inset 0 0 0 8px ${lineToken}`,
                                      transform: 'translateX(-50%)',
                                    }}
                                  />
                                )}
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
                          <a key={p.id} className="hub-row"
                            href={timelineProjectHref(p.id)}
                            aria-current={selectedProjectId === p.id ? 'page' : undefined}
                            data-selected={selectedProjectId === p.id ? 'true' : 'false'}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', minHeight: 44,
                              borderBottom: i < timeline.undated.length - 1 ? '1px solid var(--line-soft)' : 'none',
                              color: 'inherit', textDecoration: 'none',
                              background: selectedProjectId === p.id ? 'var(--surface-2)' : 'transparent',
                            }}
                          >
                            <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{pBrand.glyph}</span>
                            <span style={{ flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                            <Badge tone={statusTone[p.status]} size="xs">{STATUS_LABEL_KO[p.status] || p.status}</Badge>
                          </a>
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

      {projectDraft?.isNew && !containerDraft && (
        <ProjectCreateDrawer
          draft={projectDraft}
          areas={ledger.areas}
          brands={brands}
          entities={ledger.projectEntities}
          failedSources={ledger.failedSources}
          onChange={(key, value) => setProjectDraft(current => ({ ...current, [key]: value }))}
          onSave={persistProjectCreate}
          onRetryWithNewClientId={retryProjectCreateWithNewId}
          onOpenConflictProject={openConflictProject}
          onRetryAreas={() => loadLedger({ initial: true })}
          onClose={() => {
            setProjectDraft(null);
            setProjectCreateContext(null);
          }}
        />
      )}

      {projectDraft && !projectDraft.isNew && (
        <EditDrawer
          title="프로젝트 편집"
          subtitle="원본 프로젝트 필드만 변경합니다"
          record={projectDraft}
          fields={[
            { key: 'title', label: '프로젝트명', placeholder: '프로젝트 이름' },
            {
              key: 'brandId',
              label: '저장 위치',
              type: 'select',
              options: [
                { value: '', label: '컨테이너 선택' },
                ...brands.filter(item => item.key !== 'all').map(item => ({ value: item.id, label: item.name })),
              ],
            },
            { key: 'summary', label: '목표 결과', type: 'textarea', placeholder: '완료됐을 때 어떤 상태가 되어야 하나요?' },
            {
              key: 'status',
              label: '상태',
              type: 'select',
              row: 'project-state',
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
              row: 'project-state',
              options: [
                { value: 'low', label: '낮음' },
                { value: 'medium', label: '보통' },
                { value: 'high', label: '높음' },
                { value: 'critical', label: '긴급' },
              ],
            },
            { key: 'nextAction', label: '다음 행동', placeholder: '다음에 할 한 가지' },
            { key: 'dueAt', label: '기한', inputType: 'date' },
          ]}
          onChange={(key, value) => setProjectDraft(current => ({ ...current, [key]: value }))}
          onSave={persistProjectEdit}
          saveLabel="변경사항 저장"
          onClose={() => {
            setProjectDraft(null);
            setProjectEditSource(null);
          }}
        />
      )}

      <EditDrawer
        title={containerDraft?.isNew === false ? '컨테이너 편집' : '새 컨테이너'}
        subtitle={containerDraft?.isNew === false ? '이름·분류·소속을 변경한다 (key는 유지)' : '브랜드·KA·딜·일반을 분류와 함께 만든다'}
        record={containerDraft}
        fields={[
          { key: 'name', label: '이름', placeholder: '예: 우리학원 KA · 신규 브랜드' },
          {
            key: 'category',
            row: 'container-class',
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
            row: 'container-class',
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
        saveLabel={containerDraft?.isNew === false ? '변경사항 저장' : '컨테이너 만들기'}
        onClose={() => setContainerDraft(null)}
      />

      <EditDrawer
        title={taskEditSource ? '할 일 편집' : '할 일 만들기'}
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
          { key: 'status', row: 'task-state', label: '상태', type: 'select', options: TASK_STATUS_OPTIONS },
          { key: 'priority', row: 'task-state', label: '우선순위', type: 'select', options: TASK_PRIORITY_OPTIONS },
          { key: 'dueAt', label: '기한', inputType: 'date' },
          {
            key: 'description',
            label: '설명 · 참고 자료',
            type: 'textarea',
            placeholder: '상세 내용, 참고 링크, 메모를 적어두세요.',
          },
        ]}
        onChange={(key, value) => setTaskDraft(current => ({ ...current, [key]: value }))}
        onSave={persistTask}
        onDelete={taskEditSource ? deleteTask : undefined}
        saveLabel={taskEditSource ? '변경사항 저장' : '할 일 만들기'}
        onClose={() => { setTaskDraft(null); setTaskEditSource(null); }}
      />
    </div>
  );
}

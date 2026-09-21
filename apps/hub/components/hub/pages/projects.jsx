"use client";
import { checklistForSave } from '@/lib/task-checklist-input';

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Dot, Card, IconButton, Button, Checkbox, EmptyState, Input, SyncBadge, SegmentedControl, EditDrawer, Drawer, Kbd, Skeleton } from "../hub-primitives";
import { useUndoableAction } from "../use-undoable-action";
import { useCrmKeyboard, useCrmSelection } from "../use-crm-keyboard";
import { triggerCelebration, triggerSparkleAt } from "../celebration-fx";
import {
  buildContainerTree,
  flattenContainerChips,
  buildProjectCreatePayload,
  buildProjectDraft,
  buildProjectEditDraft,
  buildProjectPatch,
  buildProjectTimeline,
  buildContentPipelineTaskSeeds,
  buildTaskBoardColumns,
  buildTaskDraft,
  buildTaskEditDraft,
  buildTaskPatch,
  contentPipelineReloadContains,
  createClientId,
  mergeProjectDetailQuery,
  projectReloadContains,
  projectAreaLabel,
  rebaseProjectEditState,
  rotateProjectClientId,
  resolveProjectDraftOrgScope,
  selectProjectAreaId,
  shouldOpenGlobalProjectCreate,
  taskStatusForBoardColumn,
  validateProjectDraft,
} from "@/lib/pms-ui";
import { ProjectCreateDrawer, ProjectCreateInline } from "./project-create-drawer";
import { MemoWorkspace } from "./memo-workspace";
import { ProjectDeliveryEditor } from "./project-delivery";
import { ProjectDetailPanel } from "./project-detail-panel";
import { ContextMemoDrawer } from '../context-memo-drawer';
import { FloatingMentorWidget } from "../floating-mentor-widget";
import { ProjectPortfolioWorkspace } from "./project-portfolio-workspace";
import { ProjectTaskDetailDrawer } from './project-task-detail-drawer';
import { TaskChecklistGauge } from './project-task-checklist';
import { hasChecklistConflict, readTaskChecklist, validateTaskChecklist } from '@/lib/task-checklist';
import { ProjectExecutionBacklog, ProjectTaskFilters } from './project-execution-backlog';
import { buildTaskExecutionModel, mergeSavedTask, readTaskFilters, saveTaskChanges, writeTaskFilters } from '@/lib/pms-work-items';
import { isCanonicalUuid } from '@/lib/uuid';
import './project-execution.css';
import {
  BrandMark,
  ContainerFilterBar,
  ProjectPortfolioSummary,
  ProjectProgressGauge,
  ProjectStatusBadge,
} from "./project-pms-components";
import {
  BRAND_ORDER_KEY,
  BRAND_OWNED_CATEGORY,
  BRAND_SECTION_KEY,
  CONTAINER_CATEGORY_OPTIONS,
  DETAIL_FOCUSABLE,
  EMPTY_ALL_BRAND,
  EMPTY_CONTAINER_KEY,
  FOLDER_ORDER_KEY,
  FOLDER_STORAGE_KEY,
  IDLE_OPEN_KEY,
  LIST_STATUS_GROUPS,
  PROJECT_CATEGORIES,
  PROJECT_VIEW_OPTIONS,
  SIDEBAR_HIDDEN_KEY,
  SUMMARY_FILTER_LABELS,
  buildLocalContainer,
  compareProjectsByDue,
  computeMovedOrder,
  isTerminalProject,
  normalizeProjectView,
  slugifyContainer,
  computeDDay,
} from "./project-view-constants";
import { ProjectTimelineView } from "./project-timeline-view";
import { ProjectTodosView } from "./project-todos-view";
import { ProjectBoardView } from "./project-board-view";
import { classifyProjectPortfolio, portfolioWindow } from "./project-pms-metrics";
import {
  getWorkspace,
  filterBrandsByWorkspace,
  filterProjectsByWorkspace,
  filterTodosByWorkspace,
} from "../workspace-map";

// 모듈 스코프 stale-while-revalidate — 탭 복귀마다 11~14콜 원장 read를 기다리며 트리가
// 비던 것을 제거(4차 재감사 속도 M). 캐시 즉시 서빙 + 마운트마다 배경 재검증.
const PROJECTS_CACHE_SERVABLE_MS = 5 * 60 * 1000;
let projectsLedgerCache = null; // { at, ledger, todos, syncState }

export function Projects({ workspace }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ws = getWorkspace(workspace);
  const [brand, setBrand] = React.useState('all');
  const [councilWidgetProject, setCouncilWidgetProject] = React.useState(null);

  // The open view lives in the URL, not in state: the sidebar tells 할 일 from
  // 프로젝트·기획 by `?view`, and it makes the view bookmarkable. The ref keeps
  // setView's identity stable so the existing createProject/createTodo callbacks
  // don't need it in their dependency lists.
  const view = normalizeProjectView(searchParams.get('view'));
  const selectedProjectId = searchParams.get('project');
  const [memoTaskId, setMemoTaskId] = React.useState(searchParams.get('task') || null);
  const [contextMemo, setContextMemo] = React.useState(null);
  const [memoTaskFallback, setMemoTaskFallback] = React.useState(null);
  const taskFilters = readTaskFilters(searchParams);
  const taskView = ['backlog', 'board', 'todos'].includes(view);
  const searchParamsRef = React.useRef(searchParams);
  searchParamsRef.current = searchParams;
  const setView = React.useCallback((next) => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (next !== 'tree' && next !== 'timeline') params.delete('project');
    if (next === 'tree') params.delete('view');
    else params.set('view', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);
  const setTaskFilters = React.useCallback((filters) => {
    const params = writeTaskFilters(searchParamsRef.current, filters);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router]);
  const cachedProjects = projectsLedgerCache
    && Date.now() - projectsLedgerCache.at < PROJECTS_CACHE_SERVABLE_MS
    ? projectsLedgerCache
    : null;
  const [ledger, setLedger] = React.useState(cachedProjects ? cachedProjects.ledger : {
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
  const [todos, setTodos] = React.useState(cachedProjects ? cachedProjects.todos : []);
  const memoTask = (todos.find(t => t.id === memoTaskId) || (memoTaskFallback?.id === memoTaskId ? memoTaskFallback : null));
  const [pendingTaskIds, setPendingTaskIds] = React.useState(() => new Set());
  const [contentItems, setContentItems] = React.useState([]);
  const [drag, setDrag] = React.useState(null);
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [showTerminal, setShowTerminal] = React.useState(false);
  // Row-checkbox completion (my-work의 undo 계약과 동일): 체크 → 짧은 취소선
  // 플래시 → 리스트에서 낙관적으로 사라짐 → 3.5초 되돌리기 창이 닫힌 뒤에야
  // 실제 PATCH가 나간다. 실수 탭이 진짜 복구 가능해야 한다.
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();
  const [openDetail, setOpenDetail] = React.useState(null);
  const [mobileDetail, setMobileDetail] = React.useState(false);
  const [sidebarHidden, setSidebarHidden] = React.useState(true);
  const [containerPickerOpen, setContainerPickerOpen] = React.useState(false);
  const [syncState, setSyncState] = React.useState(cachedProjects ? cachedProjects.syncState : 'preview');
  const [readError, setReadError] = React.useState(null);
  const ledgerReadRef = React.useRef({ requestId: 0, controller: null });
  const taskStatusPendingRef = React.useRef(new Set());
  const contentLoadedRef = React.useRef(false);
  const detailSheetRef = React.useRef(null);
  const detailReturnFocusRef = React.useRef(null);
  const detailAutofocusPresentationRef = React.useRef(null);
  const createdFromQueryRef = React.useRef(false);
  const [orderPending, setOrderPending] = React.useState(false);
  const [orderResult, setOrderResult] = React.useState(null); // { tone: 'ok'|'err', label }
  const [deleteProjectTarget, setDeleteProjectTarget] = React.useState(null);
  const [deleteProjectPending, setDeleteProjectPending] = React.useState(false);
  const [deleteProjectError, setDeleteProjectError] = React.useState(null);
  const projectStatusPendingRef = React.useRef(new Set());
  const [deliveryProject, setDeliveryProject] = React.useState(null);
  const [projectDraft, setProjectDraft] = React.useState(null);
  const [projectEditSource, setProjectEditSource] = React.useState(null);
  const [taskDraft, setTaskDraft] = React.useState(null);
  const [taskEditSource, setTaskEditSource] = React.useState(null);
  const [taskChecklistConflict, setTaskChecklistConflict] = React.useState(null);
  const [containerDraft, setContainerDraft] = React.useState(null);
  const [localContainers, setLocalContainers] = React.useState([]);
  const drawerOpen = Boolean(contextMemo || deleteProjectTarget || projectDraft || deliveryProject || taskDraft || containerDraft || memoTaskId || !sidebarHidden || containerPickerOpen);

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

      if (data.status === 'saved') {
        setOrderResult({ tone: 'ok', label: `↗ ${formatTime(new Date())}` });
      } else if (data.status === 'preview') {
        setOrderResult({ tone: 'ok', label: `저장 대기(preview) · ${formatTime(new Date())}` });
      } else if (data.status === 'partial') {
        setOrderResult({ tone: 'err', label: '업데이트는 저장, 프로젝트 행 패치 실패 — 상태가 오래됐을 수 있습니다' });
      } else {
        // failed(502)·error — OK 영수증으로 위장하지 않는다(5차 재감사 S/M).
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
  // 유일한 표시 위치다(§8.1 상태 표시). 검증과 실제 저장 뒤 이곳으로 이동한다.
  const terminalProjects = React.useMemo(() => brandProjects.filter(isTerminalProject), [brandProjects]);
  const terminalCount = terminalProjects.length;
  const projects = React.useMemo(
    () => brandProjects.filter(p => !isTerminalProject(p)),
    [brandProjects],
  );
  const brandTodos = React.useMemo(
    () => (brand === 'all' ? scopedTodos : scopedTodos.filter(t => t.brand === brand)),
    [scopedTodos, brand],
  );
  const currentBrand = brands.find(b => b.key === brand) || brands[0] || EMPTY_ALL_BRAND;

  // 검색·요약 필터 (2026-08-19 PMS 디벨롭) — 세션 한정. 영속 선택(?view·?project)과 달리
  // 순간 조회 조건이라 URL·localStorage에 싣지 않는다.
  const [projectQuery, setProjectQuery] = React.useState('');
  const [summaryFilter, setSummaryFilter] = React.useState(null); // portfolio cell key | null
  const [showSummaryTable, setShowSummaryTable] = React.useState(false);
  const [inlineAddingProjectId, setInlineAddingProjectId] = React.useState(null);
  const [inlineTaskTitle, setInlineTaskTitle] = React.useState('');
  const [inlineSubmitting, setInlineSubmitting] = React.useState(false);
  const searchInputRef = React.useRef(null);
  const normalizedQuery = projectQuery.trim().toLowerCase();
  const resetTaskFilters = () => {
    setProjectQuery('');
    setTaskFilters({ projectId: '', priority: '', lens: 'open', sort: 'due' });
  };
  const taskExecution = React.useMemo(() => buildTaskExecutionModel(brandTodos, allProjects, {
    ...taskFilters, query: normalizedQuery,
  }), [brandTodos, allProjects, taskFilters.projectId, taskFilters.priority, taskFilters.lens, taskFilters.sort, normalizedQuery]);
  const taskReadFailed = ledger.failedSources?.includes('tasks') === true;
  const taskPartial = ledger.taskAggregation?.partial === true || ledger.partialSources?.includes('tasks') === true;
  const canWriteTasks = ['live', 'partial'].includes(syncState) && !taskReadFailed;

  // 행 렌더마다 돌던 O(n·m) find/filter 제거용 인덱스.
  const brandByKey = React.useMemo(() => new Map(brands.map(b => [b.key, b])), [brands]);
  const projectById = React.useMemo(() => new Map(allProjects.map(p => [p.id, p])), [allProjects]);
  const todosByProject = React.useMemo(() => {
    const map = new Map();
    for (const t of scopedTodos) {
      const arr = map.get(t.project);
      if (arr) arr.push(t); else map.set(t.project, [t]);
    }
    return map;
  }, [scopedTodos]);

  // 검색 대상: 프로젝트 이름 · 컨테이너 이름 · 다음 행동.
  const queriedProjects = React.useMemo(() => {
    if (!normalizedQuery) return projects;
    return projects.filter(p => {
      const b = brandByKey.get(p.brand);
      return `${p.name} ${b?.name || ''} ${p.displayNextAction || p.projectNextAction || ''}`
        .toLowerCase().includes(normalizedQuery);
    });
  }, [projects, normalizedQuery, brandByKey]);

  // 요약 4칸 클릭 필터 — 숫자를 만든 classifyProjectPortfolio와 같은 술어만 쓴다
  // (숫자 ≠ 행 수가 되는 순간 요약을 믿을 수 없다). 요약이 List에만 렌더되므로 List 전용.
  const visibleProjects = React.useMemo(() => {
    if (!summaryFilter) return queriedProjects;
    const window = portfolioWindow();
    return queriedProjects.filter(p => classifyProjectPortfolio(p, window)[summaryFilter]);
  }, [queriedProjects, summaryFilter]);

  const visibleColumns = React.useMemo(() => {
    return buildTaskBoardColumns(taskExecution.items, allProjects);
  }, [taskExecution.items, allProjects]);
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
  const taskProjectSelection = isCanonicalUuid(taskFilters.projectId) ? taskFilters.projectId : null;
  const selectedProjectIdRef = React.useRef(selectedProjectId || taskProjectSelection);
  selectedProjectIdRef.current = selectedProjectId || taskProjectSelection;
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
    setSyncState(current => (['live', 'partial'].includes(current) ? current : 'loading')); // 캐시/현재 원장 서빙 중엔 조용히 재검증
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
        setTodos(current => liveTodos.map(task => taskStatusPendingRef.current.has(task.id)
          ? current.find(item => item.id === task.id) || task : task));
        if (initial) setExpanded(new Set(liveProjects.slice(0, 2).map(p => p.id)));
        setSyncState(data.partial ? 'partial' : 'live');
        setReadError(null);
        if (!exactProjectId) {
          // 전체 범위 read만 캐시 — 프로젝트 상세 read는 목록 스냅샷이 아니다.
          projectsLedgerCache = {
            at: Date.now(),
            ledger: {
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
            },
            todos: liveTodos,
            syncState: data.partial ? 'partial' : 'live',
          };
        }
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
    if ((!selectedProjectId && !taskProjectSelection) || !initialLoadDoneRef.current) return;
    loadLedger({ projectId: selectedProjectId || taskProjectSelection });
  }, [selectedProjectId, taskProjectSelection, loadLedger]);

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
    if (!['tree', 'table'].includes(view) || !selectedProjectId) {
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
  const prepareProjectCreate = React.useCallback(() => {
    // List의 생성은 기존 상세를 밀어내고 같은 작업면을 사용한다. 별도 오버레이를 겹치지
    // 않으며, URL의 이전 선택도 함께 비워 새 프로젝트 저장 후 정확한 ID로 다시 연다.
    if (!openDetail) return;
    detailReturnFocusRef.current = null;
    closeProjectDetail();
  }, [closeProjectDetail, openDetail]);

  const createProject = React.useCallback((initialStatus = 'Planning', brandKeyOverride = null) => {
    // Contextual entry points (brand sections and status lanes) may seed location.
    const contextBrand = brandKeyOverride
      ? (brands.find(item => item.key === brandKeyOverride) || null)
      : (brand === 'all' ? null : currentBrand);
    const areaId = selectProjectAreaId(ledger.areas) || '';
    prepareProjectCreate();
    setOrderResult(null);
    setProjectEditSource(null);
    setProjectDraft(buildProjectDraft({
      contextBrand,
      areaId,
      initialStatus,
      orgScope: resolveProjectDraftOrgScope({ workspace }),
    }));
    return true;
  }, [brand, brands, currentBrand, ledger.areas, prepareProjectCreate, workspace]);

  const openGlobalProjectCreate = React.useCallback(() => {
    const areaId = selectProjectAreaId(ledger.areas) || '';
    prepareProjectCreate();
    setOrderResult(null);
    setProjectEditSource(null);
    setProjectDraft(buildProjectDraft({
      areaId,
      orgScope: resolveProjectDraftOrgScope({ workspace }),
    }));
    return true;
  }, [ledger.areas, prepareProjectCreate, workspace]);

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
    prepareProjectCreate();
    const areaId = selectProjectAreaId(ledger.areas, 'content') || selectProjectAreaId(ledger.areas) || '';
    setOrderResult(null);
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
  }, [brand, brands, currentBrand, ledger.areas, prepareProjectCreate, workspace]);

  const editProject = React.useCallback((project) => {
    setProjectEditSource(project);
    setProjectDraft(buildProjectEditDraft(project));
  }, []);

  // 완료·보관 둘 다 상태 전환 하나로 — "숨기기"와 "삭제(소프트)"가 같은 archived
  // 전환을 쓰기로 한 결정과 일치한다. 원자료(할 일·업데이트·결정)는 그대로 남는다.
  const setProjectStatus = React.useCallback(async (project, status) => {
    if (projectStatusPendingRef.current.has(project.id)) return { ok: false, message: '변경사항을 저장 중입니다.' };
    projectStatusPendingRef.current.add(project.id);
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
        const message = data.status === 'conflict'
          ? '다른 화면에서 프로젝트가 변경됐습니다. 창을 닫고 최신 내용을 확인한 뒤 다시 시도하세요.'
          : data.status === 'preview' ? '저장 연결이 필요합니다. 프로젝트는 그대로 유지됩니다.'
          : data.error || `저장 실패 ${response.status}`;
        setOrderResult({ tone: 'err', label: message });
        if (data.status === 'conflict') await loadLedger({ projectId: project.id });
        return { ok: false, message };
      }
      projectsLedgerCache = null;
      const reload = await loadLedger({ projectId: project.id });
      setOrderResult({
        tone: 'ok',
        label: !reload.ok ? '변경은 저장됐지만 목록을 다시 읽지 못했습니다. 새로고침해 확인하세요.' : status === 'completed' ? '완료 처리됨' : status === 'archived' ? '보관됨' : '다시 열림',
      });
      return { ok: true, reloaded: reload.ok };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOrderResult({ tone: 'err', label: message });
      return { ok: false, message };
    } finally {
      projectStatusPendingRef.current.delete(project.id);
    }
  }, [loadLedger]);

  const requestProjectDelete = (project) => {
    setDeleteProjectError(null);
    setDeleteProjectTarget(project);
  };

  const confirmProjectDelete = async () => {
    if (!deleteProjectTarget || deleteProjectPending) return;
    setDeleteProjectPending(true);
    setDeleteProjectError(null);
    const result = await setProjectStatus(deleteProjectTarget, 'archived');
    setDeleteProjectPending(false);
    if (!result.ok) {
      setDeleteProjectError(result.message);
      return;
    }
    setDeleteProjectTarget(null);
    if (result.reloaded) setOrderResult({ tone: 'ok', label: '프로젝트 삭제됨 · 완료·보관에서 다시 열 수 있습니다.' });
  };

  const completeProject = React.useCallback((project) => {
    if (project.statusKey === 'completed') setProjectStatus(project, 'active');
    else setDeliveryProject(project);
  }, [setProjectStatus]);

  const archiveProject = React.useCallback((project) => {
    setProjectStatus(project, project.statusKey === 'archived' ? 'active' : 'archived');
  }, [setProjectStatus]);

  // Completion opens acceptance review; a saved server response moves the row.
  const scheduleCompleteProject = React.useCallback((project) => {
    setDeliveryProject(project);
  }, []);

  // seed: 호출처가 미리 채워 주는 초안 필드({ title } · { dueAt } …). 드로어를 연 뒤
  // 같은 값을 손으로 다시 입력하는 왕복을 없앤다 — To-dos 구간 헤더의 기한 시드와
  // Council 위젯이 건네는 제목이 이 경로를 쓴다.
  const createTodo = React.useCallback((projectId = null, initialStatus = 'todo', seed = null) => {
    const contextualProjectId = projectId || (taskView && taskFilters.projectId !== 'none' ? taskFilters.projectId : null);
    setTaskEditSource(null);
    setTaskChecklistConflict(null);
    setTaskDraft({
      ...buildTaskDraft({ projectId: contextualProjectId || null, initialStatus }),
      title: '',
      id: createClientId(),
      ...(seed && typeof seed === 'object' ? seed : null),
    });
  }, [taskFilters.projectId, taskView]);

  // To-dos 뷰의 시간 구간(오늘·내일·이번 주·기한 없음) 생성 — 그 구간의 기한으로 시드해
  // 드로어에서 달력을 다시 열 필요가 없게 한다. 빈 문자열은 "기한 없음"이다.
  const createTodoForSection = React.useCallback((dueAt) => {
    createTodo(null, 'todo', { dueAt: dueAt || '' });
  }, [createTodo]);

  const handleQuickAddSubtask = React.useCallback(async (projectId) => {
    const title = inlineTaskTitle.trim();
    if (!title) return;
    setInlineSubmitting(true);
    try {
      const newId = createClientId();
      const payload = {
        id: newId,
        title,
        projectId: projectId || null,
        status: 'todo',
        priority: 'medium',
        dueAt: null,
        description: '',
        nextAction: '',
        checklist: [],
      };
      const response = await fetch('/api/hub/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && ['saved', 'created'].includes(data.status)) {
        const created = data.task || {
          ...payload,
          project: projectId,
          project_id: projectId,
          done: false,
          due: null,
          assignee: '나',
        };
        setTodos(ts => [...ts, created]);
        projectsLedgerCache = null;
        loadLedger();
        setInlineTaskTitle('');
        setOrderResult({ tone: 'ok', label: '하위 아이템 추가됨' });
      } else {
        setOrderResult({ tone: 'err', label: data.error || '하위 아이템 저장 실패' });
      }
    } catch (err) {
      setOrderResult({ tone: 'err', label: err instanceof Error ? err.message : String(err) });
    } finally {
      setInlineSubmitting(false);
    }
  }, [inlineTaskTitle, loadLedger]);

  // 페이지 레벨 N은 아래 뷰 인지 리스너 한 곳이 소유한다(todos → 할 일, 그 외 → 프로젝트).
  // 18차에 추가했던 무조건 usePageCreateHotkey는 preventDefault로 그 리스너를 영구
  // 가려 List/Board에서 N이 엉뚱한 To-do 드로어를 열었다(7차 사용성 회귀) — 제거.

  const editTodo = React.useCallback((todo) => {
    const source = 'project_id' in todo || 'updated_at' in todo ? mergeSavedTask({}, todo, allProjects) : todo;
    setTaskEditSource(source);
    setTaskChecklistConflict(null);
    setTaskDraft(buildTaskEditDraft(source));
  }, [allProjects]);

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

  const persistDelivery = React.useCallback(async (project, fields) => {
    const response = await fetch('/api/hub/projects', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: project.id, expectedUpdatedAt: project.updatedAt, ...fields }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'saved') return { ok: false, ...data,
      message: data.status === 'conflict' ? '다른 화면의 변경과 충돌했습니다. 입력은 유지했습니다.' : data.status === 'preview' ? 'Preview · 저장 연결이 필요합니다. 입력은 유지했습니다.' : data.error || '저장하지 못했습니다.' };
    if (fields.status === 'completed' && project.statusKey !== 'completed') {
      triggerCelebration({ mode: 'fireworks' });
    }
    const reload = await loadLedger({ projectId: project.id });
    return { ok: true, project: data.project, message: reload?.ok ? '계획과 실행 기록을 저장했습니다.' : '저장됐지만 목록을 다시 읽지 못했습니다. 새로고침해 확인하세요.' };
  }, [loadLedger]);

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
    // 브랜드 소유 컨테이너는 PMS에서 편집하지 않는다. Engine의 update_brand가
    // brands.meta를 {category, org_scope, source, glyph}로 통째 교체하므로, 여기서
    // 저장하면 브랜드 탭이 읽는 철학·보이스·규칙·금지어가 지워진다. 편집은 브랜드 탭이
    // meta 병합과 함께 가져간다 (2026-08-29 브랜드 탭 설계 §12 D1 후속).
    if (container.category === BRAND_OWNED_CATEGORY) return;
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
    if (!taskDraft?.title?.trim()) return { ok: false, status: 'invalid-input', message: '할 일 제목을 입력하세요.' };
    const checklistError = validateTaskChecklist(checklistForSave(taskDraft.checklist || []));
    if (checklistError) return { ok: false, status: 'invalid-input', message: checklistError };
    if (taskChecklistConflict) return { ok: false, status: 'conflict', message: '체크리스트 탭에서 사용할 항목을 선택한 뒤 저장하세요.' };
    if (!canWriteTasks || taskStatusPendingRef.current.size > 0) return { ok: false, status: 'error' };

    if (taskEditSource) {
      const patch = buildTaskPatch(taskEditSource, { ...taskDraft, checklist: checklistForSave(taskDraft.checklist || []) });
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
          if (data.status === 'conflict' && data.task) {
            const current = mergeSavedTask(taskEditSource, data.task, allProjects);
            const checklistClash = hasChecklistConflict(taskEditSource, taskDraft, current);
            setTaskChecklistConflict(checklistClash ? readTaskChecklist(current) : null);
            const { id, expectedUpdatedAt, ...changes } = patch;
            setTaskEditSource(current);
            setTaskDraft({ ...buildTaskEditDraft(current), ...changes });
            setTodos(ts => ts.map(t => t.id === current.id ? current : t));
            return { ok: false, status: 'conflict', message: checklistClash
              ? '체크리스트가 다른 창에서도 변경됐습니다. 체크리스트 탭에서 사용할 항목을 선택하세요.'
              : '다른 변경을 불러왔습니다. 입력한 변경을 유지했으니 확인 후 다시 저장하세요.' };
          }
          setOrderResult({ tone: 'err', label: data.status === 'preview' ? '저장소 연결이 필요합니다.' : '할 일을 저장하지 못했습니다.' });
          return { ok: false, status: data.status || 'error' };
        }
        // PATCH 응답의 task로 로컬 병합 — 영수증이 전체 원장 read를 기다리지 않는다.
        const saved = data.task || null;
        projectsLedgerCache = null;
        setTodos(ts => ts.map(t => t.id === patch.id ? mergeSavedTask(t, saved || {}, allProjects) : t));
        loadLedger(); // 배경 재검증(보드·카운트 정합)
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
          nextAction: taskDraft.nextAction || '',
          checklist: checklistForSave(taskDraft.checklist || []),
          source: 'hub-projects',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !['saved', 'duplicate'].includes(data.status)) {
        setOrderResult({ tone: 'err', label: data.error || `저장 실패 ${response.status}` });
        return { ok: false, status: data.status || 'error' };
      }
      // POST 에코(task)를 로컬 append — 영수증이 11+콜 전체 read를 기다리지 않는다.
      const created = data.task || null;
      if (created?.id) {
        projectsLedgerCache = null;
        setTodos(ts => ts.some(t => t.id === created.id) ? ts : [mergeSavedTask({}, created, allProjects), ...ts]);
      }
      loadLedger(); // 배경 재검증 (브랜드 조인·버킷 라벨 정합)
      setOrderResult({ tone: 'ok', label: '할 일 저장됨' });
      return { ok: true, status: data.status };
    } catch (error) {
      setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error' };
    }
  }, [allProjects, canWriteTasks, loadLedger, taskDraft, taskEditSource, taskChecklistConflict]);

  // 기존 할 일 삭제 — hub-direct DELETE (엔진 파이프라인엔 삭제 액션이 없다, tasks route 참고).
  // 낙관 제거 → 3.5초 되돌리기 창 → 창이 닫힌 뒤에만 실제 DELETE(7차 편의 — hard delete의
  // 안전장치가 confirm뿐이던 격차를 완료와 같은 지연-undo 계약으로). 늦은 실패·preview는
  // 행 복원 + 원인 명명.
  const deleteTask = React.useCallback(async () => {
    const id = taskEditSource?.id;
    if (!id) return { ok: false, status: 'no-selection' };
    const removed = todos.find(t => t.id === id) || null;
    const key = `delete-task-${id}`;
    setTodos(ts => ts.filter(t => t.id !== id)); // 즉시 반영 — 전체 read 대기 없음
    setTaskEditSource(null);
    const restore = () => {
      if (removed) setTodos(ts => (ts.some(t => t.id === id) ? ts : [removed, ...ts]));
    };
    setOrderResult({
      key,
      tone: 'ok',
      label: '할 일 삭제됨',
      action: {
        label: '되돌리기',
        onClick: () => {
          if (!cancelUndoable(key)) return; // 창이 닫혔으면 DELETE가 나갔다
          restore();
          setOrderResult({ tone: 'ok', label: '삭제 취소됨' });
        },
      },
    });
    scheduleUndoable(key, async () => {
      setOrderResult((cur) => (cur?.key === key ? null : cur)); // 창 종료 시 전체 소거(7차 UIUX 통일)
      try {
        const response = await fetch('/api/hub/tasks', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.status === 'saved') {
          loadLedger(); // 배경 재검증
          return;
        }
        restore();
        setOrderResult({
          tone: 'err',
          label: data.status === 'preview'
            ? 'Supabase 미설정 — 삭제가 저장되지 않아 할 일을 되살렸습니다.'
            : data.error || `삭제 실패 ${response.status} — 할 일을 되살렸습니다.`,
        });
      } catch (error) {
        restore();
        setOrderResult({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      }
    });
    return { ok: true, status: 'deferred' };
  }, [cancelUndoable, loadLedger, scheduleUndoable, taskEditSource, todos]);

  const applyTaskChanges = React.useCallback(async (rows, patch) => {
    if (!canWriteTasks || taskStatusPendingRef.current.size > 0) {
      return { saved: [], failed: rows.map(task => ({ id: task.id, message: '원장을 확인하거나 진행 중인 저장이 끝난 뒤 다시 시도하세요.' })) };
    }
    projectsLedgerCache = null;
    ledgerReadRef.current.controller?.abort();
    ledgerReadRef.current.requestId += 1;
    rows.forEach(task => taskStatusPendingRef.current.add(task.id));
    setPendingTaskIds(new Set(taskStatusPendingRef.current));
    try {
      const result = await saveTaskChanges(rows, patch, {
        onResult: receipt => {
          const saved = receipt.task || receipt.current;
          if (saved) setTodos(current => current.map(task => task.id === receipt.id ? mergeSavedTask(task, saved, allProjects) : task));
        },
      });
      setOrderResult({ tone: result.failed.length ? 'err' : 'ok', label: result.failed.length
        ? `${result.saved.length}개 저장 · ${result.failed.length}개 미저장`
        : `${result.saved.length}개 작업 저장됨` });
      return result;
    } finally {
      rows.forEach(task => taskStatusPendingRef.current.delete(task.id));
      setPendingTaskIds(new Set(taskStatusPendingRef.current));
      loadLedger();
    }
  }, [allProjects, canWriteTasks, loadLedger]);

  const updateTaskStatus = React.useCallback(async (id, status) => {
    const todo = todos.find(task => task.id === id);
    if (!todo) return false;
    const result = await applyTaskChanges([todo], { status });
    if (result.failed.length) throw new Error(result.failed[0].message);
    return result.saved.length === 1;
  }, [applyTaskChanges, todos]);

  const toggleTodo = React.useCallback(async (id) => {
    const todo = todos.find(item => item.id === id);
    if (!todo) return;
    const willBeDone = todo.status !== 'done';
    try {
      const updated = await updateTaskStatus(id, todo.status === 'done' ? 'todo' : 'done');
      if (!updated) return;
      if (willBeDone) {
        const pTasks = todos.filter(t => t.project === todo.project);
        if (pTasks.length > 0 && pTasks.every(t => t.id === id || t.status === 'done' || t.done)) {
          triggerCelebration({ mode: 'confetti' });
        }
      }
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

  // 프로젝트 상태 칩은 ProjectStatusBadge(→ LifecycleBadge) 하나가 소유한다(§8.2).
  // 색 이름 맵을 여기에 되살리지 않는다 — state-usage.test.mjs가 고정한다.
  const prioTone = { critical: 'danger', high: 'danger', med: 'neutral', medium: 'neutral', low: 'neutral' };
  const updateTone = { reported: 'neutral', active: 'neutral', blocked: 'danger', done: 'neutral' };
  const checkTone = { pending: 'neutral', done: 'neutral', skipped: 'neutral', blocked: 'danger' };
  // 콘텐츠 lifecycle은 §5.3 중립 — statusLabel이 상태를 말한다.
  const contentTone = { idea: 'neutral', draft: 'neutral', review: 'neutral', scheduled: 'neutral', published: 'neutral', archived: 'neutral' };

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
      if (taskView) {
        createTodo(null, view === 'backlog' ? 'inbox' : 'todo');
        event.preventDefault();
        return;
      }
      const opened = openGlobalProjectCreate();
      if (opened) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createTodo, drawerOpen, openGlobalProjectCreate, syncState, taskView, view]);

  // ?project=<id> is the canonical detail selection. Normalize only the view;
  // the project id stays in the URL so reloads and exact bounded reads remain open.
  React.useEffect(() => {
    if (!initialLoadDoneRef.current || syncState === 'loading') return;
    if (!selectedProjectId || view === 'tree' || view === 'memos') return;
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

  // 빈 컨테이너 노출 토글 — 기본은 숨김. containerTree memo가 읽으므로 먼저 선언한다.
  const [showEmptyContainers, setShowEmptyContainers] = React.useState(false);
  React.useEffect(() => {
    try {
      setShowEmptyContainers(localStorage.getItem(EMPTY_CONTAINER_KEY) === '1');
    } catch { /* defaults apply */ }
  }, []);
  const toggleEmptyContainers = React.useCallback(() => {
    setShowEmptyContainers(prev => {
      const next = !prev;
      try { localStorage.setItem(EMPTY_CONTAINER_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // 컨테이너 트리 — 두 계보의 합성 (2026-09-01 2609 병합): 숨김(08-29 P0-1 win)과
  // 진행 우선 정렬 + 휴면 묶음(08-19 mac)을 pms-ui.buildContainerTree 하나가 소유한다.
  // 보존 규칙(선택·preview는 비어도 유지)·hiddenCount 계약은 lib 테스트가 지킨다.
  const containerTree = React.useMemo(() => buildContainerTree(brands, {
    categories: PROJECT_CATEGORIES,
    folderOrder,
    brandOrder,
    selectedKey: brand,
    showEmpty: showEmptyContainers,
  }), [brands, folderOrder, brandOrder, brand, showEmptyContainers]);
  const brandGroups = containerTree.groups;
  const hiddenContainerCount = containerTree.hiddenCount;
  // 헤더 태그 필터용 평탄화 — 사이드바는 3단 트리를 그대로 쓰고, 필터 바만 분류 헤더 없이
  // 스코프 2묶음으로 읽는다 (2026-09-11 운영자 지시).
  const containerChipGroups = React.useMemo(() => flattenContainerChips(containerTree), [containerTree]);

  // Folder collapse — 저장값이 없으면 진행 신호로 기본값을 정한다: 진행 중인 컨테이너가
  // 하나도 없는 폴더는 접힘. 수동 토글은 localStorage에 영속되어 기본값을 이긴다.
  const [foldersCollapsed, setFoldersCollapsed] = React.useState({});
  React.useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FOLDER_STORAGE_KEY) || 'null');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setFoldersCollapsed(parsed);
    } catch { /* defaults apply */ }
  }, []);
  // currentClosed는 렌더에서 기본값까지 해석한 현재 상태 — 저장 맵에는 다음 상태를 명시적으로
  // 기록한다. 인자가 빠진 호출은 저장 맵 기준으로 방어한다 (양 계보의 첫-클릭 버그 수정 합류).
  const toggleFolder = React.useCallback((id, currentClosed) => {
    setFoldersCollapsed(prev => {
      const closed = typeof currentClosed === 'boolean' ? currentClosed : Boolean(prev[id]);
      const map = { ...prev, [id]: !closed };
      try { localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
      return map;
    });
  }, []);

  // 폴더 하단 "진행 없음" 묶음 펼침 상태 — 기본 접힘, 폴더 id로 영속.
  const [idleOpen, setIdleOpen] = React.useState({});
  React.useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(IDLE_OPEN_KEY) || 'null');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setIdleOpen(parsed);
    } catch { /* defaults apply */ }
  }, []);
  // currentOpened는 렌더가 기본값(showEmptyContainers·선택 브랜드)까지 해석한 표시 상태 —
  // 저장 맵 기준으로만 반전하면 기본 펼침 상태의 첫 클릭이 "펼침 저장"이 되는 무반응
  // 토글이 된다 (toggleFolder와 같은 클래스, 2609 감사 #5).
  const toggleIdle = React.useCallback((id, currentOpened) => {
    setIdleOpen(prev => {
      const opened = typeof currentOpened === 'boolean' ? currentOpened : Boolean(prev[id]);
      const map = { ...prev, [id]: !opened };
      try { localStorage.setItem(IDLE_OPEN_KEY, JSON.stringify(map)); } catch { /* ignore */ }
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

  // 리스트(tree) 섹션을 훅 레벨로 — 렌더와 j/k 커서가 같은 가시 순서를 공유한다(23차,
  // Revenue 4표면과 같은 §8.1 키보드 문법의 마지막 공백이 PMS였다).
  // 그룹 내부는 기한 임박순(Q116 확정) — .filter가 새 배열을 만들므로 in-place sort 안전.
  const listSections = React.useMemo(() => (
    brand === 'all'
      ? brands.filter(b => b.key !== 'all')
          .map(b => ({ kind: 'brand', id: b.key, brand: b, items: visibleProjects.filter(p => p.brand === b.key).sort(compareProjectsByDue) }))
          .filter(s => s.items.length > 0)
      : LIST_STATUS_GROUPS
          .map(g => ({ kind: 'status', id: g.key, statusKey: g.key, label: g.label, tone: g.tone, items: visibleProjects.filter(p => p.status === g.key).sort(compareProjectsByDue) }))
          .filter(s => s.items.length > 0)
  ), [brand, brands, visibleProjects]);

  // Timeline은 검색만 반영한다 (요약 필터는 요약이 렌더되는 List 전용). 렌더 본문에서
  // 매번 호출하던 buildProjectTimeline을 memo로 이동.
  const projectTimeline = React.useMemo(() => buildProjectTimeline(queriedProjects), [queriedProjects]);

  // j/k 순회 대상 — tree 뷰는 접힌 브랜드 섹션 제외 평탄화, board 뷰는 컬럼 순서 평탄화
  // (Deals 칸반과 동일 문법). 다른 뷰(todos·timeline)는 각자 문법이 있어 비활성.
  const kbRows = React.useMemo(() => {
    if (view === 'tree') {
      return visibleProjects.map(p => ({ id: p.id }));
    }
    if (view === 'table') {
      return listSections
        .filter(s => !(s.kind === 'brand' && brandSectionsCollapsed[s.id]))
        .flatMap(s => s.items.map(p => ({ id: p.id })));
    }
    if (view === 'board') {
      return visibleColumns.flatMap(col => col.cards.map(c => ({ id: c.id })));
    }
    return [];
  }, [view, listSections, brandSectionsCollapsed, visibleColumns]);

  const kbSelection = useCrmSelection(kbRows);
  const openKbSelected = React.useCallback((id) => {
    if (view === 'board' && !String(id).startsWith('project-')) {
      const t = todos.find(x => x.id === id);
      if (t) { editTodo(t); return; }
    }
    const projectId = String(id).startsWith('project-') ? String(id).slice('project-'.length) : id;
    openProjectDetail(projectId);
  }, [view, todos, editTodo, openProjectDetail]);
  useCrmKeyboard({
    enabled: (view === 'tree' || view === 'table' || view === 'board') && !drawerOpen,
    selection: kbSelection,
    // n은 위 뷰 인지 리스너가 소유(18차 회귀 이력) — 여기서는 바인딩하지 않는다.
    onEditSelected: openKbSelected,
    onSearchFocus: () => searchInputRef.current?.focus(),
  });
  React.useEffect(() => {
    if (!kbSelection.selectedId) return;
    document.querySelector(`[data-kb-row="${CSS.escape(String(kbSelection.selectedId))}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [kbSelection.selectedId]);

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

  // indent: 폴더 아래 트리 자식 행 (레일 래퍼 안). 드래그 핸들 아이콘은 소음이라 제거 —
  // draggable 속성과 grab 커서는 유지되므로 정렬 기능은 그대로다 (2026-08-19 위계 정리).
  const renderBrandSidebarRow = (b, { indent = false } = {}) => {
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
      <button key={b.key} className="hub-row" onClick={() => setBrand(b.key)}
        draggable={draggable}
        onDragStart={draggable ? () => setSidebarDrag({ type: 'brand', key: b.key, folderId: folderIdOf(b) }) : undefined}
        onDragEnd={() => { setSidebarDrag(null); setDragOverKey(null); }}
        onDragOver={draggable ? (e) => { e.preventDefault(); if (sidebarDrag?.type === 'brand') setDragOverKey(b.key); } : undefined}
        onDrop={draggable ? (e) => { e.preventDefault(); handleBrandDrop(b); } : undefined}
        style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: indent ? '6px 8px' : '8px 10px', marginBottom: 1,
        background: active ? 'var(--surface-3)' : undefined,
        border: active ? '1px solid var(--line)' : '1px solid transparent',
        borderRadius: 'var(--r-sm)', textAlign: 'left',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        position: 'relative',
        cursor: draggable ? 'grab' : 'pointer',
        opacity: dragging ? 0.4 : 1,
        boxShadow: dropTarget ? 'inset 0 1px 0 0 var(--moon-300)' : undefined,
      }}>
        {/* 모노그램 마크 제거 — 이름 첫 글자를 그대로 타일에 새기는 구조라 바로 옆
            이름과 글자가 겹쳐 보였다 (2026-09-15 운영자 지시). 변동 표시는 절대 배치
            오버레이 대신 이름 앞 인라인 점으로 옮긴다. */}
        {changes > 0 && (
          <span style={{
            flexShrink: 0, width: 6, height: 6, borderRadius: 999,
            // 새 변동은 손실 상태가 아니다 (§5.2 no-warning-by-default) — 조용한 문스톤 점.
            background: 'var(--moon-400)',
          }} />
        )}
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

  return (
    <div className="hub-workspace-shell hub-projects-workspace" style={{ display: 'grid', gridTemplateColumns: '1fr', height: '100%', overflow: 'hidden' }}>
      {!sidebarHidden && (
      <Drawer title="소속 관리" onClose={() => setSidebarHidden(true)} width="min(360px, 94vw)">
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-faint)' }}>분류</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
              프로젝트 컨테이너 · {containerTree.visibleCount}개
            </div>
          </div>
          {currentBrand && currentBrand.key !== 'all' && currentBrand.id && (
            currentBrand.category === BRAND_OWNED_CATEGORY ? (
              <IconButton
                icon="brand"
                size={24}
                iconSize={12}
                onClick={() => router.push(`/dashboard/brands?b=${encodeURIComponent(currentBrand.key)}`)}
                tooltip={`${currentBrand.name} · 브랜드 탭에서 열기`}
              />
            ) : (
              <IconButton icon="edit" size={24} iconSize={12} onClick={() => editContainer(currentBrand)} tooltip={`${currentBrand.name} 컨테이너 편집`} />
            )
          )}
          <IconButton icon="plus" size={24} iconSize={13} onClick={createContainer} tooltip="새 컨테이너 (KA·딜 · 일반)" />
          <IconButton icon="chevronL" size={24} iconSize={13} onClick={() => setSidebarHidden(true)} tooltip="접기" />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {brands.filter(b => b.key === 'all').map(b => renderBrandSidebarRow(b))}
          {brandGroups.map(group => group.items.length === 0 ? null : (
            <div key={group.key}>
              <div style={{ padding: '12px 10px 4px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>
                {group.label}
              </div>
              {group.folders.map(folder => {
                const containsCurrent = folder.items.some(x => x.key === brand);
                const hasSavedPref = Object.prototype.hasOwnProperty.call(foldersCollapsed, folder.id);
                // 저장값 없음 → 진행 컨테이너가 없으면 접힘. 브랜드 소유 분류(sns-channel)는
                // 진행이 있어도 기본 접힘으로 시작한다 (08-29 §4 P0-3 — 관리는 브랜드 탭 몫).
                // 숨긴 컨테이너를 보는 동안은 기본 열림 — 방금 "보기"를 눌렀는데 결과가 접힌
                // 폴더 뒤에 숨으면 토글이 무반응으로 읽힌다 (2609 병합 리뷰 #3).
                const savedClosed = hasSavedPref
                  ? Boolean(foldersCollapsed[folder.id])
                  : (showEmptyContainers ? false
                    : (folder.key === BRAND_OWNED_CATEGORY ? true : !folder.hasActive));
                // 현재 선택 브랜드를 품은 폴더는 저장값이 없을 때만 자동으로 열린다 — 명시적으로
                // 접어둔 선택은 존중해, 자동 열림이 접기 클릭을 무반응으로 만들지 않게 한다
                // (2609 병합 리뷰 #6; "자동 열림은 저장 상태를 덮어쓰지 않는다"를 문면대로).
                const closed = (containsCurrent && !hasSavedPref) ? false : savedClosed;
                const fDragging = sidebarDrag?.type === 'folder' && sidebarDrag.key === folder.key;
                const fDropTarget = sidebarDrag?.type === 'folder' && dragOverKey === folder.id && sidebarDrag.key !== folder.key;
                const idleTail = folder.hasActive && folder.idleItems.length > 0;
                // showEmptyContainers 동안 휴면 묶음 *기본값*은 펼침 — 드러낸 빈 컨테이너가
                // 그 안에 있다. 단, 명시적 토글은 항상 이긴다: 강제 고정이면 버튼이
                // aria-expanded만 삼키는 무반응 토글이 된다 (2609 감사 #5).
                const idleSaved = Object.prototype.hasOwnProperty.call(idleOpen, folder.id)
                  ? Boolean(idleOpen[folder.id])
                  : null;
                const idleOpened = !idleTail ? false
                  : (idleSaved !== null
                    ? idleSaved
                    : (showEmptyContainers || folder.idleItems.some(x => x.key === brand)));
                return (
                  <div key={folder.id}>
                    <button
                      type="button"
                      className="hub-row"
                      aria-expanded={!closed}
                      onClick={() => toggleFolder(folder.id, closed)}
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
                        boxShadow: fDropTarget ? 'inset 0 1px 0 0 var(--moon-300)' : undefined,
                      }}
                    >
                      <Iconed name="chevronD" size={11} style={{ flexShrink: 0, transform: closed ? 'rotate(-90deg)' : 'none' }} />
                      <span style={{ flex: 1 }}>{folder.label}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{folder.items.length}</span>
                    </button>
                    {!closed && (
                      <div style={{ margin: '1px 0 4px 16px', paddingLeft: 6, borderLeft: '1px solid var(--line-soft)' }}>
                        {(folder.hasActive ? folder.activeItems : folder.items).map(b => renderBrandSidebarRow(b, { indent: true }))}
                        {idleTail && (
                          <>
                            <button
                              type="button"
                              className="hub-row"
                              aria-expanded={idleOpened}
                              onClick={() => toggleIdle(folder.id, idleOpened)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                                padding: '4px 8px', borderRadius: 'var(--r-sm)',
                                color: 'var(--fg-faint)', fontSize: 11, textAlign: 'left', cursor: 'pointer',
                              }}
                            >
                              <Iconed name="chevronD" size={10} style={{ flexShrink: 0, transform: idleOpened ? 'none' : 'rotate(-90deg)' }} />
                              <span style={{ flex: 1 }}>진행 없음</span>
                              <span className="mono" style={{ fontSize: 10.5 }}>{folder.idleItems.length}</span>
                            </button>
                            {idleOpened && folder.idleItems.map(b => renderBrandSidebarRow(b, { indent: true }))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {(hiddenContainerCount > 0 || showEmptyContainers) && (
            <button
              type="button"
              className="hub-row"
              onClick={toggleEmptyContainers}
              aria-expanded={showEmptyContainers}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 6, padding: '7px 10px', borderRadius: 'var(--r-sm)',
                color: 'var(--fg-faint)', fontSize: 11, textAlign: 'left',
              }}
            >
              <Iconed name="chevronD" size={11} style={{ transform: showEmptyContainers ? 'none' : 'rotate(-90deg)' }} />
              <span style={{ flex: 1 }}>
                {showEmptyContainers ? '빈 컨테이너 숨기기' : '숨긴 컨테이너 보기'}
              </span>
              {!showEmptyContainers && (
                <span className="mono" style={{ fontSize: 10.5 }}>{hiddenContainerCount}</span>
              )}
            </button>
          )}
        </div>
      </Drawer>
      )}

      <div className="hub-projects-workspace-main" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className={`hub-page-header hub-project-page-header${openDetail ? ' hub-project-page-header--detail' : ''}`} style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="hub-project-header-context">
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Projects</h2>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
              {projectHeaderSummary} · {currentBrand.desc}
              <SyncBadge state={syncState} />
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {/* 검색 — `/`로 포커스(useCrmKeyboard), ESC는 검색어가 있을 때만 지우고 소비. */}
          {view !== 'tree' && view !== 'memos' && <span
            className="hub-project-search"
            style={{ display: 'contents' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && projectQuery) { e.stopPropagation(); setProjectQuery(''); }
            }}
          >
            <Input
              ref={searchInputRef}
              icon="search"
              placeholder="검색"
              value={projectQuery}
              onChange={setProjectQuery}
              style={{ flex: '0 1 180px', minWidth: 100 }}
            />
          </span>}
          <SegmentedControl
            className="hub-project-view-control"
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
          {taskView && (
            <Button className="hub-project-task-create" variant="primary" size="sm" icon="plus" disabled={!canWriteTasks || pendingTaskIds.size > 0} onClick={() => createTodo(null, view === 'backlog' ? 'inbox' : 'todo')}>작업 추가 <Kbd>N</Kbd></Button>
          )}
          <Button className="hub-project-primary-control" variant={taskView || view === 'tree' ? 'outline' : 'primary'} size="sm" icon="plus" onClick={openGlobalProjectCreate}>
            Project {!taskView && <Kbd>N</Kbd>}
          </Button>
        </div>

        {/* 컨테이너 태그 필터 — 사이드바가 접혀 있을 때의 기본 셀렉터다. 사이드바를 펴면
            같은 목록이 두 벌 보이므로 감춘다(선택 소유권은 한 곳). 드롭다운에만 있던
            생성·편집·숨긴 컨테이너 액션은 tail로 따라온다 (2609 감사 #2 재발 방지). */}
        {sidebarHidden && (
          <ContainerFilterBar
            allContainer={brands.find(b => b.key === 'all') || EMPTY_ALL_BRAND}
            allCount={allProjects.length}
            groups={containerChipGroups}
            countOf={(c) => c.projects || 0}
            selectedKey={brand}
            onSelect={setBrand}
            onOpenChange={setContainerPickerOpen}
            hiddenCount={hiddenContainerCount}
            showEmpty={showEmptyContainers}
            onToggleEmpty={toggleEmptyContainers}
            tail={(
              <>
                <IconButton icon="settings" size={28} onClick={() => setSidebarHidden(false)} tooltip="소속 관리·순서 변경" />
                {currentBrand && currentBrand.key !== 'all' && currentBrand.id && (
                  currentBrand.category === BRAND_OWNED_CATEGORY ? (
                    <IconButton
                      icon="brand"
                      size={26}
                      iconSize={12}
                      onClick={() => router.push(`/dashboard/brands?b=${encodeURIComponent(currentBrand.key)}`)}
                      tooltip={`${currentBrand.name} · 브랜드 탭에서 열기`}
                    />
                  ) : (
                    <IconButton icon="edit" size={26} iconSize={12} onClick={() => editContainer(currentBrand)} tooltip={`${currentBrand.name} 컨테이너 편집`} />
                  )
                )}
                <IconButton icon="plus" size={26} iconSize={13} onClick={createContainer} tooltip="새 컨테이너 (KA·딜 · 일반)" />
              </>
            )}
          />
        )}

        {view === 'memos' && <MemoWorkspace
          projects={projects}
          initialProjectId={selectedProjectId || ''}
          initialSource={searchParams.get('memo') || ''}
          onSaved={() => loadLedger()}
          onOpenTask={(id, raw) => { setMemoTaskFallback({ ...raw, project: raw.project_id || '', dueAt: raw.due_at || '', priorityRaw: raw.priority, updatedAt: raw.updated_at }); setMemoTaskId(id); }}
        />}
        {memoTaskId && <Drawer title={memoTask?.title || '업무 문맥'} onClose={() => setMemoTaskId(null)} width="min(420px, 96vw)">
          {memoTask && <div style={{ padding: 14 }}>
            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--fg-muted)', fontSize: 13 }}>{memoTask?.nextAction || memoTask?.description || '다음 행동을 업무 설명에 기록하세요.'}</p>
            <Button variant="outline" size="sm" onClick={() => { const task = memoTask; setMemoTaskId(null); if (task) editTodo(task); }}>업무 편집 · 상태 변경</Button>
          </div>}
          <MemoWorkspace key={memoTaskId} taskId={memoTaskId} onOpenTask={(id) => { const task = todos.find(t => t.id === id) || (memoTaskFallback?.id === id ? memoTaskFallback : null); if (task) {setMemoTaskId(null);editTodo(task);} }} />
          <a href={`/dashboard/work/projects?view=memos`} style={{ display:'block', padding:14, color:'var(--fg-muted)', fontSize:12 }}>메모 작업대 열기</a>
        </Drawer>}

        {taskView && (
          <ProjectTaskFilters
            projects={brandProjects}
            filters={taskFilters}
            counts={taskExecution.counts}
            partial={taskPartial || taskReadFailed || syncState === 'error'}
            disabled={pendingTaskIds.size > 0}
            onChange={setTaskFilters}
            onReset={resetTaskFilters}
          />
        )}
        {(view === 'backlog' || (taskView && !canWriteTasks)) && (
          <ProjectExecutionBacklog
            model={taskExecution} projects={allProjects} sourceState={syncState}
            partial={taskPartial} taskReadFailed={taskReadFailed} canWrite={canWriteTasks}
            pendingIds={pendingTaskIds} onEdit={editTodo}
            onCreate={status => createTodo(null, status)} onChangeTasks={applyTaskChanges}
            onRetry={() => loadLedger()} onReset={resetTaskFilters}
            selectionKey={`${workspace || 'all'}:${brand}:${JSON.stringify(taskFilters)}:${normalizedQuery}`}
          />
        )}

        {(view === 'tree' || view === 'table') && (
          <div
            className="hub-projects-main-grid"
            data-detail-open={openDetail ? 'true' : 'false'}
            style={{ display: 'grid', gridTemplateColumns: openDetail ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)', flex: 1, overflow: 'hidden' }}
          >
            {view === 'tree' && <ProjectPortfolioWorkspace
              projects={visibleProjects}
              portfolioProjects={projects}
              terminalProjects={terminalProjects}
              todosByProject={todosByProject}
              brandByKey={brandByKey}
              brands={brands}
              selectedProjectId={selectedProjectId}
              openDetailId={openDetail}
              keyboardSelectedId={kbSelection.selectedId}
              sourceState={syncState}
              readError={readError}
              failedSources={[...(ledger.failedSources || []), ...(ledger.partialSources || [])]}
              projectCorePartial={projectReadPartial}
              activeFilter={summaryFilter}
              onFilterChange={setSummaryFilter}
              query={projectQuery}
              onQueryChange={setProjectQuery}
              searchInputRef={searchInputRef}
              onOpenProject={openProjectDetail}
              onManageDelivery={setDeliveryProject}
              onCreateProject={() => createProject()}
              onCreateContent={createContentProject}
              onCreateTodo={createTodo}
              onEditTodo={editTodo}
              onToggleTodo={toggleTodo}
              pendingTodoIds={pendingTaskIds}
              showTerminal={showTerminal}
              onToggleTerminal={() => setShowTerminal(value => !value)}
              onReopenProject={(project) => setProjectStatus(project, 'active')}
              onReload={() => loadLedger({ initial: true })}
              onSwitchView={setView}
              updates={ledger.updates || []}
              createSurface={projectDraft?.isNew ? (
                <ProjectCreateInline
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
                  onClose={() => setProjectDraft(null)}
                />
              ) : null}
            />}
            {view === 'table' && (
            <div className="scroll-y" style={{ padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {summaryFilter ? (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 'var(--r-sm)',
                        background: 'var(--surface-3)', border: '1px solid var(--moon-300)',
                        fontSize: 11.5, color: 'var(--fg)',
                      }}>
                        <span style={{ color: 'var(--fg-faint)' }}>필터:</span>
                        <strong>{SUMMARY_FILTER_LABELS[summaryFilter] || summaryFilter}</strong>
                        <span className="mono" style={{ color: 'var(--moon-300)' }}>{visibleProjects.length}개</span>
                        <button
                          type="button"
                          onClick={() => setSummaryFilter(null)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-faint)', padding: '0 2px', fontSize: 13 }}
                          aria-label="필터 해제"
                        >
                          ✕
                        </button>
                      </div>
                    ) : null}
                    {normalizedQuery ? (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 'var(--r-sm)',
                        background: 'var(--surface-3)', border: '1px solid var(--line-strong)',
                        fontSize: 11.5, color: 'var(--fg)',
                      }}>
                        <span style={{ color: 'var(--fg-faint)' }}>검색:</span>
                        <span>"{projectQuery.trim()}"</span>
                        <button
                          type="button"
                          onClick={() => setProjectQuery('')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-faint)', padding: '0 2px', fontSize: 13 }}
                          aria-label="검색어 지우기"
                        >
                          ✕
                        </button>
                      </div>
                    ) : null}
                    <Button
                      variant={showSummaryTable ? "outline" : "ghost"}
                      size="xs"
                      onClick={() => setShowSummaryTable(v => !v)}
                    >
                      <Iconed name="search" size={12} /> {showSummaryTable ? "요약 지표 닫기" : "요약 필터 지표"}
                    </Button>
                  </div>
                  {(summaryFilter || normalizedQuery) && (
                    <button
                      type="button"
                      onClick={() => { setProjectQuery(''); setSummaryFilter(null); }}
                      style={{ fontSize: 11.5, color: 'var(--moon-300)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    >
                      전체 필터 초기화
                    </button>
                  )}
                </div>
                {showSummaryTable && (
                  <ProjectPortfolioSummary
                    projects={projects}
                    sourceState={syncState}
                    projectCorePartial={projectReadPartial}
                    activeKey={summaryFilter}
                    onSelectCell={setSummaryFilter}
                  />
                )}
                {/* 로딩 중 본문이 비어 있던 자리 — 행 높이(68px)로 레이아웃을 예고한다(§11). preview/error엔 안 쓴다. */}
                {syncState === 'loading' && projects.length === 0 && (
                  <div style={{ padding: '12px 20px' }}><Skeleton lines={4} height={56} gap={12} label="프로젝트 원장 확인 중" /></div>
                )}
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
                {/* 검색·필터 0건 — §8.1: 빈 검색 결과에는 "지우기" CTA 필수. */}
                {!['error', 'loading'].includes(syncState) && projects.length > 0
                  && (summaryFilter || normalizedQuery) && visibleProjects.length === 0 && (
                  <Card>
                    <EmptyState
                      icon="search"
                      title="조건에 맞는 프로젝트가 없습니다"
                      description="검색어나 요약 필터를 지우면 전체 목록이 돌아옵니다."
                      action={
                        <Button variant="outline" size="sm" onClick={() => { setProjectQuery(''); setSummaryFilter(null); }}>
                          검색·필터 지우기
                        </Button>
                      }
                    />
                  </Card>
                )}
                {(() => {
                  // 전체 브랜드 뷰는 브랜드별 아코디언(목록 전체 접기), 특정 브랜드 뷰는 상태별 그룹.
                  // 섹션 계산은 훅 레벨 listSections — j/k 커서와 같은 가시 순서를 공유(23차).
                  return listSections.map(section => {
                    const items = section.items;
                    const collapsed = section.kind === 'brand' && Boolean(brandSectionsCollapsed[section.id]);
                    // 그룹 헤더 롤업 (monday 문법) — 접힌 채로도 훑을 수 있게 진행·위험 수를
                    // 상시 표기. 붉은 집계 카운트는 §5.3 red-budget이 허용하는 섹션 헤더 위치.
                    const rollupWindow = section.kind === 'brand' ? portfolioWindow() : null;
                    const rollupActive = rollupWindow
                      ? items.filter(p => classifyProjectPortfolio(p, rollupWindow).active).length : 0;
                    const rollupRisk = rollupWindow
                      ? items.filter(p => classifyProjectPortfolio(p, rollupWindow).blockedOrOverdue).length : 0;
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
                        <BrandMark brand={section.brand} size={18} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.brand.name}</span>
                        {rollupActive > 0 && (
                          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>진행 {rollupActive}</span>
                        )}
                        {rollupRisk > 0 && (
                          <span className="mono" style={{ fontSize: 10.5, color: 'var(--danger)' }}>막힘·지연 {rollupRisk}</span>
                        )}
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
                          <span>관리</span>
                        </div>
                        {items.map((p, pi) => {
                          const isOpen = expanded.has(p.id);
                          const pTodos = todosByProject.get(p.id) || [];
                          const pBrand = brandByKey.get(p.brand) || brands[0] || EMPTY_ALL_BRAND;
                          const isSel = openDetail === p.id;
                          const dueTime = p.dueAt ? new Date(p.dueAt).getTime() : Number.NaN;
                          const pDDay = computeDDay(p.dueAt);
                          const terminal = isTerminalProject(p);
                          const overdue = !terminal && Number.isFinite(dueTime) && dueTime < new Date().setHours(0, 0, 0, 0);
                          const blocked = String(p.statusKey || '').toLowerCase() === 'blocked' || p.status === 'Blocked';
                          const nextAction = p.displayNextAction || p.projectNextAction || (p.updateEvidencePartial ? '업데이트 기록 미확인' : '다음 행동 미정');
                          return (
                            <React.Fragment key={p.id}>
                              <div
                                className="hub-project-row"
                                data-selected={isSel ? 'true' : 'false'}
                                data-terminal={terminal ? 'true' : 'false'}
                                data-kb-row={p.id}
                                // j/k 키보드 커서 — §5.3 충돌 우선순위상 선택은 Moonstone 외곽 outline.
                                style={kbSelection.selectedId === p.id ? { outline: '1px solid var(--moon-300)', outlineOffset: -1 } : undefined}
                              >
                                <div className="hub-project-row__controls">
                                  <button
                                    type="button"
                                    className="hub-project-expand"
                                    aria-label={`${p.name} 하위 항목 ${isOpen ? '접기' : '펼치기'}`}
                                    aria-expanded={isOpen}
                                    onClick={() => toggleExpand(p.id)}
                                  >
                                  <span style={{ display: 'inline-block', transition: 'transform var(--dur-hover) var(--ease-hub)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10.5 }}>▶</span>
                                  </button>
                                  {/* 완료 조건과 결과물을 검증한 뒤 저장해야 완료·보관으로 이동한다. */}
                                  <Checkbox
                                    checked={terminal}
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
                                    <BrandMark brand={pBrand} size={18} />
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
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                      <span className="mono">{p.due || '기한 없음'}</span>
                                      {pDDay && (
                                        <span className={`hub-project-dday-badge hub-project-dday-badge--${pDDay.tone}`}>
                                          {pDDay.text}
                                        </span>
                                      )}
                                    </div>
                                    {(blocked || overdue) && <span className="hub-project-risk-label">{blocked ? '막힘' : '기한 지남'}</span>}
                                    {!blocked && !overdue && <span className="hub-project-no-risk">위험 신호 없음</span>}
                                  </div>
                                </button>
                                <ProjectProgressGauge
                                  progress={p.displayProgress}
                                  compact
                                  ariaLabel={`${p.name} 진척`}
                                />
                                <div className="hub-project-secondary-state">
                                  <ProjectStatusBadge status={p.status} />
                                  <span><Dot tone={prioTone[p.priority]} size={5} />{{ low: '낮음', medium: '보통', high: '높음', critical: '긴급' }[p.priority] || '보통'}</span>
                                </div>
                                <div className="hub-project-row-actions" aria-label={`${p.name} 관리`}>
                                  <IconButton icon="pencil" size={30} iconSize={16} tooltip={`${p.name} 편집`} onClick={() => editProject(p)} />
                                  <IconButton icon="trash" size={30} iconSize={16} className="hub-project-delete-action" tooltip={`${p.name} 삭제`} onClick={() => requestProjectDelete(p)} />
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
                                        <span title={`우선순위 ${t.priority || 'medium'}`} style={{ display: 'inline-flex' }}>
                                          <Dot tone={prioTone[t.priority]} size={4} />
                                        </span>
                                        <span>{t.title}</span>
                                      </div>
                                      <button className="hub-task-checklist-open hub-row" aria-label={`${t.title} 체크리스트 편집`} onClick={() => editTodo(t)} disabled={pendingTaskIds.has(t.id)}>
                                        <TaskChecklistGauge task={t} emptyLabel="체크리스트 추가" />
                                      </button>
                                      <span className="hub-project-subtask__assignee">{t.assignee}</span>
                                      <span className="mono hub-project-subtask__due">{t.due || '기한 없음'}</span>
                                    </div>
                                  ))}
                                  {inlineAddingProjectId === p.id ? (
                                    <div
                                      className="hub-project-subtask-inline-add"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 12px',
                                        background: 'var(--surface-2)',
                                        borderTop: '1px solid var(--line-soft)',
                                      }}
                                    >
                                      <span style={{ fontSize: 13, color: 'var(--fg-faint)', marginLeft: 4 }}>↳</span>
                                      <input
                                        type="text"
                                        autoFocus
                                        placeholder="하위 아이템 제목 입력 후 Enter..."
                                        value={inlineTaskTitle}
                                        onChange={(e) => setInlineTaskTitle(e.target.value)}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            await handleQuickAddSubtask(p.id);
                                          } else if (e.key === 'Escape') {
                                            setInlineAddingProjectId(null);
                                            setInlineTaskTitle('');
                                          }
                                        }}
                                        style={{
                                          flex: 1,
                                          minWidth: 0,
                                          padding: '5px 8px',
                                          fontSize: 12.5,
                                          background: 'var(--surface)',
                                          border: '1px solid var(--line-soft)',
                                          borderRadius: 'var(--r-sm)',
                                          color: 'var(--fg)',
                                          outline: 'none',
                                        }}
                                      />
                                      <Button
                                        variant="primary"
                                        size="xs"
                                        disabled={inlineSubmitting || !inlineTaskTitle.trim()}
                                        onClick={() => handleQuickAddSubtask(p.id)}
                                      >
                                        {inlineSubmitting ? '추가 중…' : '추가'}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => {
                                          const currentTitle = inlineTaskTitle;
                                          setInlineAddingProjectId(null);
                                          setInlineTaskTitle('');
                                          createTodo(p.id);
                                          if (currentTitle.trim()) {
                                            setTaskDraft(prev => prev ? { ...prev, title: currentTitle.trim() } : prev);
                                          }
                                        }}
                                        title="기한, 우선순위, 담당자, 체크리스트 상세 설정"
                                      >
                                        상세 입력
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => {
                                          setInlineAddingProjectId(null);
                                          setInlineTaskTitle('');
                                        }}
                                      >
                                        취소
                                      </Button>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px' }}>
                                      <button
                                        type="button"
                                        className="hub-project-subtasks__add"
                                        onClick={() => {
                                          setInlineAddingProjectId(p.id);
                                          setInlineTaskTitle('');
                                        }}
                                      >
                                        ＋ 하위 아이템 바로 추가
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => createTodo(p.id)}
                                        style={{
                                          fontSize: 11.5,
                                          color: 'var(--fg-faint)',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '4px 6px',
                                          borderRadius: 'var(--r-sm)',
                                        }}
                                        className="hub-row"
                                        title="우측 패널에서 상세 옵션과 함께 하위 아이템 추가"
                                      >
                                        상세 추가(사이드 탭) ↗
                                      </button>
                                    </div>
                                  )}
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
                          const pBrand = brandByKey.get(p.brand) || brands[0] || EMPTY_ALL_BRAND;
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
                              <BrandMark brand={pBrand} size={16} />
                              <button
                                type="button"
                                className="hub-row"
                                onClick={() => openProjectDetail(p.id)}
                                style={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', margin: '-2px -4px', borderRadius: 'var(--r-sm)' }}
                              >
                                <span style={{ fontSize: 13, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                <span style={{ fontSize: 11, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{pBrand.name}</span>
                              </button>
                              <ProjectStatusBadge status={p.status} />
                              <IconButton icon="pencil" size={30} iconSize={16} tooltip={`${p.name} 편집`} onClick={() => editProject(p)} />
                              <Button variant="ghost" size="sm" onClick={() => setProjectStatus(p, 'active')}>다시 열기</Button>
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
            )}

            {openDetail && (() => {
              const p = projectById.get(openDetail);
              if (!p) return null;
              const pBrand = brandByKey.get(p.brand) || brands[0] || EMPTY_ALL_BRAND;
              const pTodos = todosByProject.get(p.id) || [];
              const pUpdates = (ledger.updates || []).filter(u => u.projectId === p.id).slice(0, 5);
              const pDecisions = (ledger.decisions || []).filter(d => d.projectId === p.id).slice(0, 4);
              const pNotes = (ledger.notes || []).filter(n => n.projectId === p.id);
              const pChecks = (ledger.checks || []).filter(c => c.projectId === p.id).slice(0, 4);
              const pContent = p.brandId ? contentItems.filter(c => c.brandId === p.brandId).slice(0, 5) : [];
              const detailFailedSources = ledger.selection?.projectId === p.id
                ? ledger.selection.failedSources
                : ledger.failedSources;
              return (
                <div
                  ref={detailSheetRef}
                  className="hub-project-detail-sheet"
                  aria-hidden={contextMemo ? true : undefined}
                  inert={contextMemo ? true : undefined}
                  role={mobileDetail ? 'dialog' : 'region'}
                  aria-modal={mobileDetail ? 'true' : undefined}
                  aria-label={`${p.name} 프로젝트 상세`}
                >
                  <button type="button" tabIndex={-1} className="hub-project-detail-sheet__backdrop" aria-label="프로젝트 상세 닫기" onClick={closeProjectDetail} />
                  <ProjectDetailPanel
                    key={p.id}
                    project={p}
                    container={pBrand}
                    todos={pTodos}
                    updates={pUpdates}
                    decisions={pDecisions}
                    notes={pNotes}
                    notesPartial={(ledger.selection?.projectId === p.id ? ledger.selection.partialSources : ledger.partialSources)?.includes('notes') === true}
                    checks={pChecks}
                    content={pContent}
                    syncState={syncState}
                    failedSources={detailFailedSources}
                    updateTone={updateTone}
                    checkTone={checkTone}
                    contentTone={contentTone}
                    orderPending={orderPending}
                    orderResult={orderResult}
                    pendingTodoIds={pendingTaskIds}
                    onClose={closeProjectDetail}
                    onMemo={(contexts) => setContextMemo({ contexts })}
                    onOpenMemo={(noteId) => setContextMemo({ noteId, contexts: [] })}
                    onCustomerSaved={async (saved, selected) => {
                      projectsLedgerCache = null;
                      setLedger(current => ({ ...current, projects: current.projects.map(project => project.id === p.id ? {
                        ...project, updatedAt: saved?.updated_at || project.updatedAt,
                        entityRef: selected ? { type: selected.type === 'account' ? 'customer_account' : 'lead', id: selected.id } : null,
                        entityLabel: selected?.label || null,
                      } : project) }));
                      await loadLedger();
                    }}
                    onEdit={editProject}
                    onEditTodo={editTodo}
                    taskPartial={taskPartial}
                    onToggleTodo={toggleTodo}
                    onCreateTodo={createTodo}
                    onOpen={(project) => {
                      const params = writeTaskFilters(searchParamsRef.current, { projectId: project.id, lens: 'open', priority: '', sort: 'due' });
                      params.delete('project');
                      params.set('view', 'backlog');
                      setProjectQuery('');
                      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
                    }}
                    onSendOrder={sendProjectOrder}
                    onConsultCouncil={(project) => setCouncilWidgetProject(project)}
                    onManageDelivery={setDeliveryProject}
                    onComplete={completeProject}
                    onArchive={archiveProject}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {view === 'todos' && canWriteTasks && (
          <ProjectTodosView
            items={taskExecution.items}
            projectById={projectById}
            brands={brands}
            brandByKey={brandByKey}
            pendingTaskIds={pendingTaskIds}
            prioTone={prioTone}
            onToggleTodo={toggleTodo}
            onEditTodo={editTodo}
            onCreateTodo={createTodoForSection}
            onResetFilters={resetTaskFilters}
          />
        )}

        {view === 'board' && canWriteTasks && (
          <ProjectBoardView
            visibleColumns={visibleColumns}
            todos={todos}
            drag={drag}
            pendingTaskIds={pendingTaskIds}
            selectedId={kbSelection.selectedId}
            prioTone={prioTone}
            onDragChange={setDrag}
            onMoveCard={moveCard}
            onCreateCard={createBoardCard}
            onOpenTask={setMemoTaskId}
            onOpenProject={openProjectDetail}
          />
        )}

        {view === 'timeline' && (
          <ProjectTimelineView
            projects={projects}
            timeline={projectTimeline}
            searchParams={searchParams}
            pathname={pathname}
            selectedProjectId={selectedProjectId}
            brands={brands}
            brandByKey={brandByKey}
            onCreateProject={() => createProject()}
          />
        )}
      </div>

      {contextMemo && <ContextMemoDrawer contexts={contextMemo.contexts} noteId={contextMemo.noteId} onClose={() => setContextMemo(null)} onSaved={() => setOrderResult({ tone: 'ok', label: '메모를 저장했어요' })} />}
      {deliveryProject && <ProjectDeliveryEditor key={deliveryProject.id} project={deliveryProject} onClose={() => setDeliveryProject(null)} onSave={persistDelivery} />}

      {projectDraft?.isNew && !containerDraft && view !== 'tree' && (
        <ProjectCreateDrawer
          draft={projectDraft}
          areas={ledger.areas}
          brands={brands}
          failedSources={ledger.failedSources}
          onChange={(key, value) => setProjectDraft(current => ({ ...current, [key]: value }))}
          onSave={persistProjectCreate}
          onRetryWithNewClientId={retryProjectCreateWithNewId}
          onOpenConflictProject={openConflictProject}
          onRetryAreas={() => loadLedger({ initial: true })}
          // setProjectCreateContext는 19차에 상태째 제거됐는데 이 호출만 살아남아 생성
          // 드로어를 닫을 때마다 ReferenceError를 던졌다(23차 브라우저 실측에서 발견).
          onClose={() => setProjectDraft(null)}
        />
      )}

      {deleteProjectTarget && (
        <Drawer
          title="프로젝트 삭제"
          presentation="compact"
          onClose={() => { if (!deleteProjectPending) setDeleteProjectTarget(null); }}
          footer={(
            <>
              <Button autoFocus variant="ghost" size="sm" disabled={deleteProjectPending} onClick={() => setDeleteProjectTarget(null)}>취소</Button>
              <Button variant="danger" size="sm" disabled={deleteProjectPending} onClick={confirmProjectDelete}>{deleteProjectPending ? '삭제 중…' : '삭제'}</Button>
            </>
          )}
        >
          <div className="hub-project-delete-summary">
            <span className="hub-project-delete-summary__icon"><Iconed name="archive" size={20} /></span>
            <div><span className="hub-project-delete-summary__label">삭제할 프로젝트</span><strong>{deleteProjectTarget.name}</strong></div>
          </div>
          <p className="hub-project-delete-description">활성 목록에서 제외하고 보관합니다.<br />연결된 할 일·메모·기록은 그대로 유지됩니다.</p>
          <div className="hub-project-delete-recovery"><Iconed name="archive" size={14} /><span>완료·보관 → 다시 열기로 복원할 수 있습니다.</span></div>
          {deleteProjectError && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{deleteProjectError}</p>}
        </Drawer>
      )}

      {projectDraft && !projectDraft.isNew && (
        <EditDrawer
          title="프로젝트 편집"
          subtitle="목표·분류·연결을 설정하세요. 일정은 계획·검증에서 관리합니다."
          record={projectDraft}
          fields={[
            { key: 'title', label: '프로젝트명', placeholder: '프로젝트 이름' },
            {
              key: 'areaId', label: '업무 분류', type: 'select',
              options: [
                ...(!ledger.areas.some(area => area.id === projectDraft.areaId) ? [{ value: projectDraft.areaId || '', label: '현재 분류 유지' }] : []),
                ...ledger.areas.map(area => ({ value: area.id, label: projectAreaLabel(area) })),
              ],
            },
            {
              key: 'brandId',
              label: '브랜드·컨테이너',
              type: 'select',
              options: [
                { value: '', label: '연결 없음' },
                ...brands.filter(item => item.key !== 'all').map(item => ({ value: item.id, label: item.name })),
              ],
            },
            { key: 'summary', label: '목표 결과', type: 'textarea', placeholder: '완료됐을 때 어떤 상태가 되어야 하나요?' },
            {
              key: 'entityKey', label: '관련 리드·고객', type: 'select',
              options: [
                { value: '', label: '연결 없음' },
                ...(projectDraft.entityKey && !ledger.projectEntities.some(entity => entity.key === projectDraft.entityKey)
                  ? [{ value: projectDraft.entityKey, label: '현재 연결 유지' }] : []),
                ...ledger.projectEntities.map(entity => ({ value: entity.key, label: entity.label })),
              ],
            },
            {
              key: 'status',
              label: '상태',
              type: 'select',
              row: 'project-state',
              options: [
                { value: 'draft', label: '계획' },
                { value: 'active', label: '진행' },
                { value: 'blocked', label: '막힘' },
                ...(projectDraft.status === 'completed' ? [{ value: 'completed', label: '완료' }] : []),
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
            ...(!projectEditSource?.delivery ? [{ key: 'dueAt', label: '기한', inputType: 'date' }] : []),
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
        subtitle={containerDraft?.isNew === false ? '이름·분류·소속을 변경한다 (key는 유지)' : 'KA·딜 또는 일반 컨테이너를 분류와 함께 만든다 · 브랜드는 브랜드 탭에서'}
        record={containerDraft}
        fields={[
          { key: 'name', label: '이름', placeholder: '예: 우리학원 KA · 신규 브랜드' },
          {
            key: 'category',
            row: 'container-class',
            label: '분류',
            type: 'select',
            // 브랜드 소유 분류는 새로 고를 수 없지만, 이미 그 분류인 컨테이너를
            // 편집할 때 select가 값을 잃고 조용히 재분류하면 안 되므로 되살린다.
            options: containerDraft?.category === BRAND_OWNED_CATEGORY
              ? [{ value: BRAND_OWNED_CATEGORY, label: 'SNS 채널 (브랜드 탭)' }, ...CONTAINER_CATEGORY_OPTIONS]
              : CONTAINER_CATEGORY_OPTIONS,
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

      <ProjectTaskDetailDrawer
        draft={taskDraft} editing={Boolean(taskEditSource)} projects={allProjects}
        onChange={(key, value) => setTaskDraft(current => ({ ...current, [key]: value }))}
        onSave={persistTask} onContinue={() => createTodo(null, 'todo', { projectId: taskDraft?.projectId || '' })} onDelete={taskEditSource ? deleteTask : undefined}
        onClose={() => { setTaskDraft(null); setTaskEditSource(null); setTaskChecklistConflict(null); }}
        checklistConflict={taskChecklistConflict}
        onUseCurrentChecklist={() => { setTaskDraft(current => ({ ...current, checklist: taskChecklistConflict })); setTaskChecklistConflict(null); }}
        onKeepDraftChecklist={() => setTaskChecklistConflict(null)}
      />

      <FloatingMentorWidget
        isOpen={Boolean(councilWidgetProject)}
        onClose={() => setCouncilWidgetProject(null)}
        contextType="project"
        contextTitle={councilWidgetProject?.name || councilWidgetProject?.title || "프로젝트"}
        contextData={{
          id: councilWidgetProject?.id,
          title: councilWidgetProject?.name || councilWidgetProject?.title,
          status: councilWidgetProject?.status,
          desc: councilWidgetProject?.displaySummary || councilWidgetProject?.summary || councilWidgetProject?.desc,
          todos: councilWidgetProject ? (ledger.todos || []).filter(t => t.projectId === councilWidgetProject.id) : [],
          updates: councilWidgetProject ? (ledger.updates || []).filter(u => u.projectId === councilWidgetProject.id) : [],
        }}
        // 위젯이 건네는 건 제목이다 — 2번째 인자는 initialStatus라, 제목을 거기에 넣으면
        // TASK_STATUSES에 없어 'todo'로 떨어지고 제목은 조용히 버려졌다(드로어가 빈 제목으로
        // 열림). seed로 넘겨 AI가 제안한 문장을 그대로 초안에 채운다.
        onCreateTask={(title) => {
          if (councilWidgetProject?.id) {
            createTodo(councilWidgetProject.id, 'todo', { title: String(title || '').trim() });
          }
        }}
      />
    </div>
  );
}

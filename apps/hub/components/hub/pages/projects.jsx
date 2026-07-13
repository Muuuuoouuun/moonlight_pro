"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar, Checkbox, EditDrawer, EmptyState, SyncBadge } from "../hub-primitives";
import { createDurableTaskClient } from "@/lib/durable-task-client";
import {
  allowedTaskStatuses,
  applyAuthoritativeTask,
  beginComposerOperation,
  createProjectReadState,
  formatTaskDueDate,
  localDateMidnightIso,
  reconcileProjectReadState,
  resolveConflictTask,
  settleComposerOperation,
  taskToDraft,
} from "@/lib/project-task-state";
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

const EMPTY_COLUMNS = [
  { key: 'backlog', label: 'Backlog', cards: [] },
  { key: 'today', label: 'Today', cards: [] },
  { key: 'doing', label: 'In Progress', cards: [] },
  { key: 'review', label: 'Review', cards: [] },
  { key: 'done', label: 'Done', cards: [] },
];

const TASK_STATUS_LABELS = {
  inbox: '수신함',
  todo: '할 일',
  doing: '진행 중',
  blocked: '막힘',
  done: '완료',
};

const TASK_EDIT_FIELDS = [
  { key: 'title', label: '제목' },
  { key: 'status', label: '상태', type: 'select', options: (record) => allowedTaskStatuses(record.baseStatus).map((value) => ({ value, label: TASK_STATUS_LABELS[value] })) },
  { key: 'priority', label: '우선순위', type: 'select', options: [
    { value: 'critical', label: '매우 높음' },
    { value: 'high', label: '높음' },
    { value: 'medium', label: '보통' },
    { value: 'low', label: '낮음' },
  ] },
  { key: 'dueDate', label: '기한', inputType: 'date' },
  { key: 'nextAction', label: '다음 행동', placeholder: '다음으로 할 일을 적으세요' },
];

function taskFailureMessage(result, fallback) {
  if (result?.requiresUnlock || result?.httpStatus === 401) {
    return '쓰기 잠금이 필요합니다. 이 화면에서 잠금을 해제하면 같은 작업을 다시 시도합니다.';
  }
  return result?.error || result?.message || fallback;
}

function ProjectLedgerSkeleton() {
  return (
    <div className="project-ledger-skeleton" role="status" aria-label="프로젝트와 할 일 원장을 불러오는 중">
      <div className="project-ledger-skeleton__row" />
      <div className="project-ledger-skeleton__row" />
    </div>
  );
}

function isDurableSuccess(result) {
  return result?.httpStatus >= 200
    && result.httpStatus < 300
    && ['saved', 'duplicate'].includes(result.status);
}

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

export function Projects({ workspace }) {
  const ws = getWorkspace(workspace);
  const [brand, setBrand] = React.useState('all');
  const [view, setView] = React.useState('tree');
  const [ledger, setLedger] = React.useState({
    source: 'preview',
    brands: [EMPTY_ALL_BRAND],
    projects: [],
    updates: [],
    decisions: [],
    notes: [],
    checks: [],
    columns: EMPTY_COLUMNS,
  });
  const [todos, setTodos] = React.useState([]);
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [openDetail, setOpenDetail] = React.useState(null);
  const [brandMenuOpen, setBrandMenuOpen] = React.useState(false);
  const [sidebarHidden, setSidebarHidden] = React.useState(false);
  const [syncState, setSyncState] = React.useState('loading');
  const [ledgerError, setLedgerError] = React.useState(null);
  const [taskSource, setTaskSource] = React.useState('loading');
  const [taskError, setTaskError] = React.useState(null);
  const [taskTimezone, setTaskTimezone] = React.useState('Asia/Seoul');
  const [hasLedgerSnapshot, setHasLedgerSnapshot] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const brandMenuRef = React.useRef(null);
  const mountedRef = React.useRef(true);
  const loadGenerationRef = React.useRef(0);
  const hasLedgerSnapshotRef = React.useRef(false);
  const hasTaskSnapshotRef = React.useRef(false);
  const readStateRef = React.useRef(createProjectReadState());
  const client = React.useMemo(() => createDurableTaskClient(), []);
  const [pendingTaskIds, setPendingTaskIds] = React.useState(() => new Set());
  const [persistedTaskIds, setPersistedTaskIds] = React.useState(() => new Set());
  const [taskResults, setTaskResults] = React.useState({});
  const [taskComposer, setTaskComposer] = React.useState({ projectId: null, title: '', state: 'idle', error: '' });
  const composerOperationRef = React.useRef(null);
  const [taskDraft, setTaskDraft] = React.useState(null);
  const [drawerPersisted, setDrawerPersisted] = React.useState(false);
  const [taskAnnouncement, setTaskAnnouncement] = React.useState('');
  const [requiresUnlock, setRequiresUnlock] = React.useState(false);
  const [unlockSecret, setUnlockSecret] = React.useState('');
  const [unlockPending, setUnlockPending] = React.useState(false);
  const [unlockError, setUnlockError] = React.useState('');
  const pendingUnlockRetryRef = React.useRef(null);
  const [orderPendingId, setOrderPendingId] = React.useState(null);
  const [orderResults, setOrderResults] = React.useState({}); // projectId → { tone: 'ok'|'err', label }

  const formatTime = (d) => {
    try {
      return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    } catch {
      return d.toISOString().slice(11, 19);
    }
  };

  async function sendProjectOrder(project) {
    if (!project || orderPendingId) return;
    setOrderPendingId(project.id);
    setOrderResults((results) => ({ ...results, [project.id]: null }));
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

      if (response.ok && data?.status === 'saved') {
        setOrderResults((results) => ({ ...results, [project.id]: { tone: 'ok', label: `↗ ${formatTime(new Date())}` } }));
      } else {
        setOrderResults((results) => ({ ...results, [project.id]: { tone: 'err', label: data.error || data.message || data.reason || `실패 ${response.status}` } }));
      }
    } catch (error) {
      setOrderResults((results) => ({ ...results, [project.id]: { tone: 'err', label: error instanceof Error ? error.message : String(error) } }));
    } finally {
      setOrderPendingId((pendingId) => (pendingId === project.id ? null : pendingId));
    }
  }

  const rawBrands = ledger.brands?.length ? ledger.brands : [EMPTY_ALL_BRAND];
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
  const cols = Array.isArray(ledger.columns) && ledger.columns.length ? ledger.columns : EMPTY_COLUMNS;
  const showLedgerSurface = syncState === 'live' || hasLedgerSnapshot;

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadLedger = React.useCallback(async ({ showLoading = false } = {}) => {
    const generation = ++loadGenerationRef.current;
    if (showLoading && !hasLedgerSnapshotRef.current) {
      setSyncState('loading');
    }
    if (showLoading && !hasTaskSnapshotRef.current) {
      setTaskSource('loading');
    }
    setLedgerError(null);

    try {
      const response = await fetch('/api/hub/projects', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!mountedRef.current || generation !== loadGenerationRef.current) return { ok: false, reason: 'stale' };

      if (!response.ok || !data || data.status === 'error') {
        const message = data?.error || data?.message || `프로젝트 원장 요청 실패 (${response.status})`;
        const failedRead = reconcileProjectReadState(readStateRef.current, { type: 'failure', message });
        readStateRef.current = failedRead;
        setSyncState(failedRead.syncState);
        setLedgerError(failedRead.ledgerError);
        setTaskSource(failedRead.taskSource);
        setTaskError('할 일 원장을 다시 읽지 못했습니다. 기존에 불러온 할 일을 유지합니다.');
        setTodos(previousTodos => previousTodos);
        return { ok: false, reason: 'project-read', message };
      }

      const previousRead = readStateRef.current;
      const nextRead = reconcileProjectReadState(previousRead, {
        type: 'success',
        data: { ...data, ledger: data },
      });
      readStateRef.current = nextRead;
      const nextTaskSource = data.taskSource || 'preview';
      const preservePreviewTasks = data.source !== 'supabase' && previousRead.hasTaskSnapshot;
      setTaskSource(nextRead.taskSource);
      setTaskTimezone(nextRead.taskTimezone);
      if (nextTaskSource === 'error' || preservePreviewTasks) {
        setTaskError(preservePreviewTasks
          ? '할 일 원장이 미리보기로 응답해 기존에 불러온 할 일을 유지합니다.'
          : '할 일 원장을 다시 읽지 못했습니다. 기존에 불러온 할 일을 유지합니다.');
        setTodos(previousTodos => previousTodos);
      } else if (['live', 'empty'].includes(nextTaskSource)) {
        setTaskError(null);
        setTodos(Array.isArray(data.todos) ? data.todos : []);
        hasTaskSnapshotRef.current = true;
      } else if (!hasTaskSnapshotRef.current) {
        setTaskError(null);
        setTodos(Array.isArray(data.todos) ? data.todos : []);
      } else {
        setTaskError('할 일 원장이 미리보기로 응답해 기존에 불러온 할 일을 유지합니다.');
        setTodos(previousTodos => previousTodos);
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
          columns: Array.isArray(data.columns) && data.columns.length ? data.columns : EMPTY_COLUMNS,
        });
        setExpanded((previous) => previous.size ? previous : new Set(liveProjects.slice(0, 2).map((project) => project.id)));
        setHasLedgerSnapshot(true);
        setSyncState('live');
        setLedgerError(null);
      } else {
        if (!hasLedgerSnapshotRef.current) {
          setLedger({
            source: 'preview', brands: [EMPTY_ALL_BRAND], projects: [], updates: [], decisions: [],
            notes: [], checks: [], columns: EMPTY_COLUMNS,
          });
          setExpanded(new Set());
          setOpenDetail(null);
        }
        setSyncState('preview');
        setLedgerError(hasLedgerSnapshotRef.current ? '미리보기 응답 대신 마지막으로 확인한 프로젝트를 유지합니다.' : null);
      }

      hasLedgerSnapshotRef.current = nextRead.hasLedgerSnapshot;
      hasTaskSnapshotRef.current = nextRead.hasTaskSnapshot;

      return { ok: data.source === 'supabase' && ['live', 'empty'].includes(nextTaskSource), data };
    } catch (error) {
      if (!mountedRef.current || generation !== loadGenerationRef.current) return { ok: false, reason: 'stale' };
      const message = error instanceof Error ? error.message : String(error);
      const failedRead = reconcileProjectReadState(readStateRef.current, { type: 'failure', message });
      readStateRef.current = failedRead;
      setSyncState(failedRead.syncState);
      setLedgerError(failedRead.ledgerError);
      setTaskSource(failedRead.taskSource);
      setTaskError('할 일 원장을 다시 읽지 못했습니다. 기존에 불러온 할 일을 유지합니다.');
      setTodos(previousTodos => previousTodos);
      return { ok: false, reason: 'network', message };
    }
  }, []);

  React.useEffect(() => {
    loadLedger({ showLoading: true });
  }, [loadLedger, refreshToken]);

  React.useEffect(() => {
    if (!brands.some(b => b.key === brand)) {
      setBrand(wsDefaultBrand);
    }
  }, [brand, brands, wsDefaultBrand]);

  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const statusTone = { 'In progress': 'info', Review: 'warning', Planning: 'moon', Backlog: 'neutral', Blocked: 'danger', Done: 'success' };
  const prioTone = { critical: 'danger', high: 'danger', med: 'warning', medium: 'warning', low: 'neutral' };
  const updateTone = { reported: 'neutral', active: 'info', blocked: 'danger', done: 'success' };
  const checkTone = { pending: 'neutral', done: 'success', skipped: 'warning', blocked: 'danger' };

  const offerSessionUnlock = (result, retry) => {
    if (!result?.requiresUnlock && result?.httpStatus !== 401) return false;
    pendingUnlockRetryRef.current = retry;
    setRequiresUnlock(true);
    setUnlockError('');
    return true;
  };

  const applyCurrentTask = (currentTask) => {
    readStateRef.current = {
      ...readStateRef.current,
      todos: applyAuthoritativeTask(readStateRef.current.todos, currentTask),
      hasTaskSnapshot: true,
    };
    setTodos((previous) => applyAuthoritativeTask(previous, currentTask));
  };

  const submitSessionUnlock = async (event) => {
    event.preventDefault();
    if (!unlockSecret || unlockPending) return;
    setUnlockPending(true);
    setUnlockError('');
    const retry = pendingUnlockRetryRef.current;
    const result = await client.unlockSession({
      secret: unlockSecret,
      onSecretConsumed: () => setUnlockSecret(''),
    });
    setUnlockPending(false);
    if (!result.unlocked) {
      setUnlockError('잠금을 해제하지 못했습니다. secret을 확인해 주세요.');
      return;
    }
    pendingUnlockRetryRef.current = null;
    setRequiresUnlock(false);
    setTaskAnnouncement('쓰기 잠금을 해제했습니다. 같은 작업을 다시 시도합니다.');
    await retry?.();
  };

  const openTaskComposer = (projectId) => {
    setExpanded((previous) => new Set([...previous, projectId]));
    setTaskComposer({ projectId, title: '', state: 'idle', error: '' });
  };

  const refetchPersistedComposer = async (operation) => {
    setTaskComposer((current) => settleComposerOperation(current, operation, { state: 'refreshing', error: '' }));
    const refreshed = await loadLedger();
    if (refreshed.ok && ['live', 'empty'].includes(refreshed.data?.taskSource)) {
      setTaskComposer((current) => settleComposerOperation(current, operation, {
        projectId: null, title: '', state: 'idle', error: '', operationId: null,
      }));
      if (composerOperationRef.current?.operationId === operation.operationId) composerOperationRef.current = null;
      return;
    }
    setTaskComposer((current) => settleComposerOperation(current, operation, {
      state: 'persisted', error: '저장은 완료됐지만 목록을 확인하지 못했습니다. 다시 확인하세요.',
    }));
  };

  const persistProjectTask = async (composerInput) => {
    const title = composerInput.title.trim();
    if (!title) {
      setTaskComposer((current) => ({ ...current, error: '할 일 제목을 입력하세요.' }));
      return;
    }

    const { state: savingComposer, operation } = beginComposerOperation(composerInput, {
      operationId: globalThis.crypto?.randomUUID?.() || `task-${Date.now()}`,
    });
    composerOperationRef.current = operation;
    setTaskComposer(savingComposer);
    const result = await client.createTask({
      title: operation.title,
      projectId: operation.projectId,
      status: 'todo',
    });

    if (isDurableSuccess(result)) {
      setTaskAnnouncement(`${operation.title} 할 일을 저장했습니다.`);
      setTaskComposer((current) => settleComposerOperation(current, operation, { state: 'persisted', error: '' }));
      await refetchPersistedComposer(operation);
      return;
    }

    const retryComposer = { ...composerInput, title: operation.title, projectId: operation.projectId, state: 'error' };
    offerSessionUnlock(result, () => persistProjectTask(retryComposer));
    setTaskComposer((current) => settleComposerOperation(current, operation, {
      state: 'error',
      error: taskFailureMessage(result, '할 일을 저장하지 못했습니다. 입력을 유지했으니 다시 시도하세요.'),
    }));
  };

  const createProjectTask = async (event) => {
    event?.preventDefault?.();
    if (taskComposer.state === 'persisted' && composerOperationRef.current) {
      await refetchPersistedComposer(composerOperationRef.current);
      return;
    }
    await persistProjectTask(taskComposer);
  };

  const completeTask = async (t) => {
    if (!t?.id || !t.updatedAt || pendingTaskIds.has(t.id) || t.done) return;
    setPendingTaskIds((previous) => new Set([...previous, t.id]));
    setTaskResults((previous) => ({ ...previous, [t.id]: null }));
    try {
      if (persistedTaskIds.has(t.id)) {
        const refreshed = await loadLedger();
        if (refreshed.ok) {
          setPersistedTaskIds((previous) => {
            const next = new Set(previous);
            next.delete(t.id);
            return next;
          });
        } else {
          setTaskResults((previous) => ({ ...previous, [t.id]: '완료는 저장됐지만 목록을 다시 읽지 못했습니다. 새로고침하세요.' }));
        }
        return;
      }

      const result = await client.updateTask({
        id: t.id,
        expectedUpdatedAt: t.updatedAt,
        patch: { status: 'done' },
      });

      if (isDurableSuccess(result)) {
        setTaskAnnouncement(`${t.title} 할 일을 완료했습니다.`);
        setPersistedTaskIds((previous) => new Set([...previous, t.id]));
        const refreshed = await loadLedger();
        if (refreshed.ok) {
          setPersistedTaskIds((previous) => {
            const next = new Set(previous);
            next.delete(t.id);
            return next;
          });
        } else {
          setTaskResults((previous) => ({ ...previous, [t.id]: '완료는 저장됐지만 목록을 다시 읽지 못했습니다. 새로고침하세요.' }));
        }
      } else if (result.status === 'conflict') {
        const currentTask = resolveConflictTask(result);
        if (currentTask) {
          applyCurrentTask(currentTask);
          if (currentTask.status === 'done') {
            setTaskAnnouncement(`${t.title} 할 일은 다른 곳에서 이미 완료됐습니다.`);
          }
          setTaskResults((previous) => ({
            ...previous,
            [t.id]: currentTask.status === 'done'
              ? '다른 곳에서 이미 완료된 최신 상태를 반영했습니다.'
              : '다른 곳에서 변경된 최신 상태를 반영했습니다. 다시 확인하세요.',
          }));
          await loadLedger();
        } else {
          const refreshed = await loadLedger();
          setTaskResults((previous) => ({
            ...previous,
            [t.id]: refreshed.ok
              ? '다른 곳에서 변경됐습니다. 최신 값을 불러왔으니 다시 확인하세요.'
              : '다른 곳에서 변경됐지만 최신 값을 다시 읽지 못했습니다. 목록을 다시 확인하세요.',
          }));
        }
      } else {
        offerSessionUnlock(result, () => completeTask(t));
        setTaskResults((previous) => ({
          ...previous,
          [t.id]: taskFailureMessage(result, '완료 상태를 저장하지 못했습니다. 다시 시도하세요.'),
        }));
      }
    } finally {
      setPendingTaskIds((previous) => {
        const next = new Set(previous);
        next.delete(t.id);
        return next;
      });
    }
  };

  const openTaskEditor = (t) => {
    setDrawerPersisted(false);
    setTaskDraft(taskToDraft(t, taskTimezone));
  };

  const saveTaskDraft = async () => {
    if (!taskDraft?.title?.trim()) return { ok: false, message: '제목을 입력하세요.' };
    if (drawerPersisted) {
      const refreshed = await loadLedger();
      return refreshed.ok && ['live', 'empty'].includes(refreshed.data?.taskSource)
        ? { ok: true, status: 'saved' }
        : { ok: false, message: '저장은 완료됐지만 최신 목록을 확인하지 못했습니다. 다시 확인하세요.' };
    }

    const duePatch = !taskDraft.dueDate
      ? { dueAt: null, duePrecision: 'none' }
      : taskDraft.duePrecision === 'timed'
        && taskDraft.dueAt
        && formatTaskDueDate(taskDraft, taskTimezone) === taskDraft.dueDate
        ? { dueAt: taskDraft.dueAt, duePrecision: 'timed' }
        : { dueAt: localDateMidnightIso(taskDraft.dueDate, taskTimezone), duePrecision: 'date' };
    const result = await client.updateTask({
      id: taskDraft.id,
      expectedUpdatedAt: taskDraft.updatedAt,
      patch: {
        title: taskDraft.title.trim(),
        status: taskDraft.status,
        priority: taskDraft.priority,
        nextAction: taskDraft.nextAction.trim() || null,
        ...duePatch,
      },
    });

    if (isDurableSuccess(result)) {
      setTaskAnnouncement(`${taskDraft.title.trim()} 할 일 변경사항을 저장했습니다.`);
      setDrawerPersisted(true);
      const refreshed = await loadLedger();
      if (refreshed.ok && ['live', 'empty'].includes(refreshed.data?.taskSource)) {
        setDrawerPersisted(false);
        return { ok: true, status: result.status };
      }
      return { ok: false, message: '저장은 완료됐지만 최신 목록을 확인하지 못했습니다. 다시 확인하세요.' };
    }

    if (result.status === 'conflict') {
      const currentTask = resolveConflictTask(result);
      if (currentTask) {
        applyCurrentTask(currentTask);
        if (currentTask.status === 'done') {
          setTaskDraft(null);
          setTaskAnnouncement(`${taskDraft.title} 할 일은 다른 곳에서 이미 완료되어 편집기를 닫았습니다.`);
          await loadLedger();
          return { ok: true, status: 'conflict-resolved' };
        }
        setTaskDraft(taskToDraft(currentTask, taskTimezone));
        await loadLedger();
        return { ok: false, status: 'conflict', message: '다른 곳에서 변경됐습니다. 최신 값으로 교체했으니 다시 검토하세요.' };
      }
      const refreshed = await loadLedger();
      const latest = refreshed.data?.todos?.find((todo) => todo.id === taskDraft.id);
      if (latest) {
        const latestDraft = taskToDraft(latest, taskTimezone);
        setTaskDraft(latestDraft);
        return { ok: false, status: 'conflict', message: '다른 곳에서 변경됐습니다. 최신 값으로 교체했으니 다시 검토하세요.' };
      }
      return { ok: false, status: 'conflict', message: '다른 곳에서 변경됐지만 최신 값을 불러오지 못했습니다. 목록을 다시 확인하세요.' };
    }

    offerSessionUnlock(result, async () => {
      const retried = await saveTaskDraft();
      if (retried?.ok) {
        setTaskDraft(null);
        setDrawerPersisted(false);
      }
    });
    return {
      ok: false,
      message: taskFailureMessage(result, '할 일을 저장하지 못했습니다. 입력을 유지했으니 다시 시도하세요.'),
    };
  };

  React.useEffect(() => {
    const close = (e) => { if (brandMenuRef.current && !brandMenuRef.current.contains(e.target)) setBrandMenuOpen(false); };
    if (brandMenuOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [brandMenuOpen]);

  const brandGroups = React.useMemo(() => {
    const real = brands.filter(b => b.key !== 'all');
    return [
      { key: 'classin', label: '업무 · 클래스인', items: real.filter(b => b.orgScope === 'classin') },
      { key: 'personal', label: '개인', items: real.filter(b => b.orgScope !== 'classin') },
    ];
  }, [brands]);

  const renderBrandSidebarRow = (b) => {
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
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-faint)' }}>Brands</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>브랜드 포맷 · {Math.max(0, brands.length - 1)}개</div>
          </div>
          <IconButton icon="chevronL" size={24} iconSize={13} onClick={() => setSidebarHidden(true)} tooltip="접기" />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {brands.filter(b => b.key === 'all').map(renderBrandSidebarRow)}
          {brandGroups.map(group => group.items.length === 0 ? null : (
            <div key={group.key}>
              <div style={{ padding: '10px 10px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>
                {group.label}
              </div>
              {group.items.map(renderBrandSidebarRow)}
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
              <span style={{ fontSize: 16, position: 'relative' }}>
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
                    {group.items.map(renderBrandMenuRow)}
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
              {showLedgerSurface ? `${projects.length} projects · ${brandTodos.filter(t => !t.done).length} open todos · ${currentBrand.desc}` : '실제 프로젝트 원장 상태를 확인합니다.'}
              <SyncBadge state={syncState} />
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
          <Button variant="secondary" size="sm" icon="lock" disabled title="프로젝트 생성·삭제는 읽기 전용입니다.">프로젝트 읽기 전용</Button>
        </div>

        <div className="visually-hidden" aria-live="polite" aria-atomic="true">{taskAnnouncement}</div>

        {requiresUnlock && (
          <form className="project-session-unlock" onSubmit={submitSessionUnlock} aria-busy={unlockPending}>
            <div>
              <strong>쓰기 잠금 해제</strong>
              <span>현재 화면과 입력을 유지한 채, 실패한 작업을 같은 재시도 키로 다시 실행합니다.</span>
            </div>
            <label className="visually-hidden" htmlFor="project-write-secret">Hub write secret</label>
            <input
              id="project-write-secret"
              type="password"
              value={unlockSecret}
              onChange={(event) => setUnlockSecret(event.target.value)}
              disabled={unlockPending}
              autoComplete="current-password"
              placeholder="Hub write secret"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={unlockPending || !unlockSecret}>
              {unlockPending ? '확인 중…' : '잠금 해제 후 재시도'}
            </Button>
            {unlockError && <span className="project-session-unlock__error" role="alert">{unlockError}</span>}
          </form>
        )}

        {showLedgerSurface && syncState !== 'live' && (
          <div className="project-task-source-alert" role="alert">
            <div>
              <strong>{syncState === 'error' ? '프로젝트 원장을 다시 읽지 못했습니다.' : '프로젝트 원장이 미리보기로 응답했습니다.'}</strong>
              <span>{ledgerError || '마지막으로 확인한 프로젝트와 할 일을 그대로 유지합니다.'}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadLedger()}>다시 시도</Button>
          </div>
        )}

        {showLedgerSurface && (taskSource === 'error' || taskSource === 'preview') && (
          <div className="project-task-source-alert" role="alert">
            <div>
              <strong>{taskSource === 'error' ? '할 일 원장을 확인하지 못했습니다.' : '할 일 원장 연결이 필요합니다.'}</strong>
              <span>{taskError || (todos.length ? '기존에 불러온 할 일을 유지합니다.' : '가짜 할 일 없이 빈 상태로 표시합니다.')}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadLedger()}>다시 확인</Button>
          </div>
        )}

        {!showLedgerSurface && (
          <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              {syncState === 'loading' ? <ProjectLedgerSkeleton /> : <Card>
                <EmptyState
                  icon={syncState === 'error' ? 'signal' : syncState === 'loading' ? 'work' : 'projects'}
                  title={syncState === 'error' ? '프로젝트 원장을 불러오지 못했습니다' : syncState === 'loading' ? '프로젝트 원장 확인 중' : '프로젝트 원장 연결 필요'}
                  description={syncState === 'error' ? ledgerError || '실패한 읽기를 샘플 프로젝트로 대체하지 않았습니다.' : syncState === 'loading' ? '실제 프로젝트와 할 일을 확인하고 있습니다.' : 'Supabase 프로젝트 원장을 연결하면 실제 프로젝트와 할 일이 표시됩니다.'}
                  action={syncState === 'error' ? <Button variant="outline" size="sm" onClick={() => setRefreshToken((value) => value + 1)}>다시 시도</Button> : undefined}
                />
              </Card>}
            </div>
          </div>
        )}

        {showLedgerSurface && view === 'tree' && (
          <div className="hub-projects-main-grid" style={{ display: 'grid', gridTemplateColumns: openDetail ? '1fr 360px' : '1fr', flex: 1, overflow: 'hidden' }}>
            <div className="scroll-y" style={{ padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                {projects.length === 0 && (
                  <Card>
                    <EmptyState
                      icon="projects"
                      title="프로젝트 원장이 비어 있습니다"
                      description="Supabase 연결은 live 상태입니다. 쓰기 API 또는 외부 project webhook으로 저장된 프로젝트만 이 목록에 표시됩니다."
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
                        <div className="hub-project-table-head" style={{
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
                              <div
                                className="hub-project-row"
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.target !== e.currentTarget) return;
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setOpenDetail(p.id === openDetail ? null : p.id);
                                  }
                                }}
                                style={{
                                display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center', gap: 8,
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
                                <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid var(--line-soft)', background: 'var(--surface-2)' }} />
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
                                <div className="hub-project-task-group" style={{ background: 'var(--surface-2)', borderBottom: pi < groupProjects.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                                  <div className="hub-project-task-head" style={{
                                    display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                    padding: '6px 14px 6px 44px', gap: 8, alignItems: 'center',
                                    fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em',
                                    borderBottom: '1px solid var(--line-soft)',
                                  }}>
                                    <span /><span /><span>하위 아이템</span><span style={{ textAlign: 'center' }}>Own</span><span>기한</span><span>상태</span>
                                  </div>
                                  {pTodos.length === 0 && taskComposer.projectId !== p.id && (
                                    <div className="project-task-empty">
                                      <span>이 프로젝트에 연결된 할 일이 없습니다.</span>
                                      <Button className="project-task-control" variant="outline" size="sm" onClick={() => openTaskComposer(p.id)}>+ Task</Button>
                                    </div>
                                  )}
                                  {pTodos.map((t, ti) => (
                                    <div key={t.id} className="hub-project-task-row hub-project-task-row--tree" aria-busy={pendingTaskIds.has(t.id)} style={{
                                      display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                      padding: '8px 14px 8px 44px', alignItems: 'center', gap: 8,
                                      borderBottom: ti < pTodos.length - 1 ? '1px solid var(--line-soft)' : 'none',
                                      opacity: t.done ? 0.55 : 1,
                                    }}>
                                      <span />
                                      <Checkbox
                                        checked={t.done}
                                        label={`${t.title} 완료`}
                                        aria-busy={pendingTaskIds.has(t.id)}
                                        disabled={pendingTaskIds.has(t.id) || taskSource === 'error' || t.done}
                                        onChange={() => completeTask(t)}
                                      />
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Dot tone={prioTone[t.priority]} size={4} />
                                        <button className="project-task-title" type="button" onClick={() => openTaskEditor(t)}>{t.title}</button>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <Avatar name={t.assignee} size={18} tone={t.assignee === 'Me' ? 'moon' : t.assignee === 'Council' ? 'info' : 'neutral'} />
                                      </div>
                                      <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{t.due}</span>
                                      <Badge tone={t.done ? 'success' : 'neutral'} size="xs">{t.done ? '완료' : '열림'}</Badge>
                                      {taskResults[t.id] && <div className="project-task-row-error" role="alert">{taskResults[t.id]}</div>}
                                    </div>
                                  ))}
                                  {taskComposer.projectId === p.id ? (
                                    <form className="project-task-composer" onSubmit={createProjectTask}>
                                      <label htmlFor={`project-task-${p.id}`}>새 할 일</label>
                                      <input
                                        id={`project-task-${p.id}`}
                                        value={taskComposer.title}
                                        onChange={(event) => setTaskComposer((current) => ({ ...current, title: event.target.value, error: '' }))}
                                        disabled={taskComposer.state === 'saving' || taskComposer.state === 'refreshing'}
                                        autoFocus
                                        placeholder="할 일 제목"
                                      />
                                      <Button className="project-task-control" type="submit" variant="primary" size="sm" disabled={taskComposer.state === 'saving' || taskComposer.state === 'refreshing'}>
                                        {taskComposer.state === 'persisted' ? '목록 다시 확인' : taskComposer.state === 'saving' || taskComposer.state === 'refreshing' ? '확인 중…' : '추가'}
                                      </Button>
                                      <Button className="project-task-control" type="button" variant="ghost" size="sm" disabled={taskComposer.state === 'saving' || taskComposer.state === 'refreshing'} onClick={() => setTaskComposer({ projectId: null, title: '', state: 'idle', error: '' })}>취소</Button>
                                      {taskComposer.error && <div className="project-task-composer__error" role="alert">{taskComposer.error}</div>}
                                    </form>
                                  ) : pTodos.length > 0 ? (
                                    <div className="project-task-footer">
                                      <Button className="project-task-control" variant="ghost" size="sm" onClick={() => openTaskComposer(p.id)}>+ Task</Button>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                        <div className="hub-project-readonly-footer" style={{ width: '100%', padding: '10px 14px', fontSize: 11.5, color: 'var(--fg-faint)', borderTop: '1px solid var(--line-soft)' }}>프로젝트 생성·삭제는 읽기 전용 · {group.label}</div>
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
              const projectOrderResult = orderResults[p.id] || null;
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
                        <Button className="project-task-control" variant="ghost" size="sm" onClick={() => openTaskComposer(p.id)}>+ Task</Button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pTodos.map(t => (
                          <div key={t.id} className="hub-project-task-row hub-project-task-row--detail" aria-busy={pendingTaskIds.has(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)' }}>
                            <Checkbox
                              checked={t.done}
                              label={`${t.title} 완료`}
                              aria-busy={pendingTaskIds.has(t.id)}
                              disabled={pendingTaskIds.has(t.id) || taskSource === 'error' || t.done}
                              onChange={() => completeTask(t)}
                            />
                            <button className="project-task-title" type="button" onClick={() => openTaskEditor(t)}>{t.title}</button>
                            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{t.due}</span>
                            {taskResults[t.id] && <span className="project-task-row-error" role="alert">{taskResults[t.id]}</span>}
                          </div>
                        ))}
                        {pTodos.length === 0 && <div style={{ padding: '6px 8px', fontSize: 11.5, color: 'var(--fg-faint)' }}>연결된 할 일이 없습니다. + Task로 첫 항목을 만드세요.</div>}
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
                    <Button
                      variant="outline"
                      size="sm"
                      icon="orders"
                      onClick={() => sendProjectOrder(p)}
                      disabled={Boolean(orderPendingId)}
                    >
                      {orderPendingId === p.id ? 'Sending…' : '주문 보내기'}
                    </Button>
                    {projectOrderResult && orderPendingId !== p.id && (
                      <span
                        role={projectOrderResult.tone === 'err' ? 'alert' : 'status'}
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          color: projectOrderResult.tone === 'ok' ? 'var(--success)' : 'var(--danger)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {projectOrderResult.label}
                      </span>
                    )}
                  </div>
                </aside>
              );
            })()}
          </div>
        )}

        {showLedgerSurface && view === 'todos' && (
          <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
            <div style={{ maxWidth: 880, margin: '0 auto' }}>
              {brandTodos.length === 0 && (
                <Card>
                  <EmptyState
                    icon="orders"
                    title="열린 할 일이 없습니다"
                    description="Supabase tasks 원장에 표시할 항목이 없습니다. 쓰기 연결 전에는 로컬 할 일을 만들지 않습니다."
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
                          <div key={t.id} className="hub-project-task-row hub-project-task-row--todo" aria-busy={pendingTaskIds.has(t.id)} style={{
                            display: 'grid', gridTemplateColumns: '22px 1fr 140px 100px 80px',
                            padding: '10px 14px', alignItems: 'center', gap: 10,
                            borderBottom: i < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                            opacity: t.done ? 0.5 : 1,
                          }}>
                            <Checkbox
                              checked={t.done}
                              label={`${t.title} 완료`}
                              aria-busy={pendingTaskIds.has(t.id)}
                              disabled={pendingTaskIds.has(t.id) || taskSource === 'error' || t.done}
                              onChange={() => completeTask(t)}
                            />
                            <div style={{ minWidth: 0 }}>
                              <button className="project-task-title" type="button" onClick={() => openTaskEditor(t)}>{t.title}</button>
                              <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>
                                {pBrand.glyph} {pBrand.name} · {proj?.name}
                              </div>
                            </div>
                            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{t.assignee}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Dot tone={prioTone[t.priority]} />{t.priority}
                            </span>
                            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', textAlign: 'right' }}>{t.due}</span>
                            {taskResults[t.id] && <div className="project-task-row-error" role="alert">{taskResults[t.id]}</div>}
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

        {showLedgerSurface && view === 'board' && (
            <div className="hub-scroll-x" style={{ display: 'flex', gap: 'var(--gap)', overflowX: 'auto', flex: 1, padding: 'var(--section-gap)' }}>
            {cols.map(col => (
              <div key={col.key} style={{
                  width: 280, flexShrink: 0,
                  background: 'var(--surface)', border: '1px solid var(--line-soft)',
                  borderRadius: 'var(--r-lg)',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '1px 6px', background: 'var(--surface-3)', borderRadius: 4 }}>{col.cards.length}</span>
                  <div style={{ flex: 1 }} />
                  <Badge tone="neutral" size="xs">읽기 전용</Badge>
                </div>
                <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {col.cards.length === 0 && (
                    <div style={{ padding: '18px 8px', fontSize: 11.5, color: 'var(--fg-faint)', textAlign: 'center' }}>카드 없음</div>
                  )}
                  {col.cards.map(c => (
                    <div key={c.id} style={{
                        background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                        borderRadius: 'var(--r-sm)', padding: 'var(--pad-y) var(--pad-x)',
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
      <EditDrawer
        title="할 일 편집"
        subtitle={taskDraft?.projectName || '프로젝트 할 일'}
        record={taskDraft}
        fields={TASK_EDIT_FIELDS}
        onChange={(key, value) => setTaskDraft((current) => current ? { ...current, [key]: value } : current)}
        onClose={() => {
          setTaskDraft(null);
          setDrawerPersisted(false);
        }}
        onSave={saveTaskDraft}
      />
    </div>
  );
}

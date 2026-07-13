export const DEFAULT_TASK_TIMEZONE = 'Asia/Seoul';

const EMPTY_LEDGER = Object.freeze({
  focusProjects: [],
  otherProjects: [],
  projectCounts: { focus: 0, total: 0 },
  today: { items: [] },
  alerts: [],
});

const TASK_TRANSITIONS = Object.freeze({
  inbox: ['todo', 'done'],
  todo: ['doing', 'blocked', 'done'],
  doing: ['todo', 'blocked', 'done'],
  blocked: ['todo', 'doing', 'done'],
  done: ['todo'],
});

export function resolveTaskTimezone(candidate) {
  const timezone = typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : DEFAULT_TASK_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TASK_TIMEZONE;
  }
}

function zonedParts(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTaskTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function localDateMidnightIso(dateKey, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return null;

  const intended = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0);
  const intendedDate = new Date(intended);
  if (
    intendedDate.getUTCFullYear() !== Number(match[1])
    || intendedDate.getUTCMonth() !== Number(match[2]) - 1
    || intendedDate.getUTCDate() !== Number(match[3])
  ) return null;

  const resolvedTimezone = resolveTaskTimezone(timezone);
  let candidate = intended;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = zonedParts(new Date(candidate), resolvedTimezone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const adjustment = intended - representedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const finalParts = zonedParts(new Date(candidate), resolvedTimezone);
  if (
    finalParts.year !== Number(match[1])
    || finalParts.month !== Number(match[2])
    || finalParts.day !== Number(match[3])
    || finalParts.hour !== 0
    || finalParts.minute !== 0
    || finalParts.second !== 0
  ) return null;

  return new Date(candidate).toISOString();
}

export function formatTaskDueDate(task, timezone) {
  const raw = task?.dueAt || task?.due_at;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const parts = zonedParts(date, timezone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function allowedTaskStatuses(status) {
  const current = typeof status === 'string' ? status : 'todo';
  return [current, ...(TASK_TRANSITIONS[current] || [])].filter(
    (value, index, values) => values.indexOf(value) === index,
  );
}

export function taskToDraft(task, timezone) {
  const status = task?.status || 'todo';
  return {
    ...task,
    title: task?.title || '',
    status,
    baseStatus: status,
    priority: task?.priorityKey || task?.priority || 'medium',
    dueDate: formatTaskDueDate(task, timezone),
    nextAction: task?.nextAction || task?.next_action || '',
  };
}

export function createProjectReadState() {
  return {
    ledger: EMPTY_LEDGER,
    todos: [],
    syncState: 'loading',
    ledgerError: '',
    taskSource: 'loading',
    taskError: '',
    taskTimezone: DEFAULT_TASK_TIMEZONE,
    hasLedgerSnapshot: false,
    hasTaskSnapshot: false,
  };
}

export function reconcileProjectReadState(previous, event) {
  if (event?.type === 'failure') {
    const message = event.message || '데이터를 불러오지 못했습니다.';
    return {
      ...previous,
      syncState: 'error',
      ledgerError: message,
      taskSource: 'error',
      taskError: message,
    };
  }

  const data = event?.data || {};
  const isLiveLedger = data.source === 'supabase';
  const preservePreviewSnapshot = !isLiveLedger && previous.hasTaskSnapshot;
  const nextTaskSource = preservePreviewSnapshot
    ? 'preview'
    : data.taskSource || (isLiveLedger ? 'live' : 'preview');
  const isLiveTasks = nextTaskSource === 'live' || nextTaskSource === 'empty';

  return {
    ...previous,
    ledger: isLiveLedger ? (data.ledger || EMPTY_LEDGER) : previous.ledger,
    todos: isLiveTasks ? (Array.isArray(data.todos) ? data.todos : []) : previous.todos,
    syncState: isLiveLedger ? 'live' : 'preview',
    ledgerError: isLiveLedger ? '' : (data.error || 'Supabase 연결 전 미리보기 상태입니다.'),
    taskSource: nextTaskSource,
    taskError: isLiveTasks ? '' : (data.taskError || data.error || '할 일 원장을 불러오지 못했습니다.'),
    taskTimezone: resolveTaskTimezone(data.taskTimezone || previous.taskTimezone),
    hasLedgerSnapshot: previous.hasLedgerSnapshot || isLiveLedger,
    hasTaskSnapshot: previous.hasTaskSnapshot || isLiveTasks,
  };
}

export function beginComposerOperation(composer, { operationId }) {
  const operation = {
    operationId,
    projectId: composer.projectId,
    title: composer.title,
  };
  return {
    operation,
    state: { ...composer, state: 'saving', error: '', operationId },
  };
}

export function settleComposerOperation(current, operation, patch) {
  if (
    !operation
    || current.operationId !== operation.operationId
    || current.projectId !== operation.projectId
  ) return current;
  return { ...current, ...patch };
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;
  return {
    ...task,
    id: task.id,
    projectId: task.projectId ?? task.project_id ?? null,
    dueAt: task.dueAt ?? task.due_at ?? null,
    nextAction: task.nextAction ?? task.next_action ?? null,
    updatedAt: task.updatedAt ?? task.updated_at ?? null,
  };
}

export function resolveConflictTask(result) {
  return normalizeTask(result?.currentTask || result?.current_task);
}

export function applyAuthoritativeTask(todos, currentTask) {
  const current = normalizeTask(currentTask);
  if (!current?.id) return todos;
  if (current.status === 'done') return todos.filter((task) => task.id !== current.id);
  return todos.map((task) => task.id === current.id ? { ...task, ...current } : task);
}

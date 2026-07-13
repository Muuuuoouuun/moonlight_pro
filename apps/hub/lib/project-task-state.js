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

function zonedDateKey(value, timezone) {
  const parts = zonedParts(value, timezone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
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
    finalParts.year === Number(match[1])
    && finalParts.month === Number(match[2])
    && finalParts.day === Number(match[3])
    && finalParts.hour === 0
    && finalParts.minute === 0
    && finalParts.second === 0
  ) {
    return new Date(candidate).toISOString();
  }

  // Some zones advance their clocks at local midnight, so 00:00 never exists.
  // Find the earliest real instant that still belongs to the requested local date.
  const targetDateKey = `${match[1]}-${match[2]}-${match[3]}`;
  const step = 15 * 60 * 1000;
  const scanStart = intended - (18 * 60 * 60 * 1000);
  const scanEnd = intended + (36 * 60 * 60 * 1000);
  for (let cursor = scanStart; cursor <= scanEnd; cursor += step) {
    const cursorDateKey = zonedDateKey(new Date(cursor), resolvedTimezone);
    if (cursorDateKey !== targetDateKey) continue;

    let lower = cursor - step;
    let upper = cursor;
    while (upper - lower > 1) {
      const midpoint = Math.floor((lower + upper) / 2);
      const midpointDateKey = zonedDateKey(new Date(midpoint), resolvedTimezone);
      if (midpointDateKey === targetDateKey) upper = midpoint;
      else lower = midpoint;
    }
    return new Date(upper).toISOString();
  }

  // A Gregorian date can be valid yet absent from an IANA timezone after a date-line
  // jump. Returning a neighboring date would violate the date-only round-trip contract.
  return null;
}

export function formatTaskDueDate(task, timezone) {
  const raw = task?.dueAt || task?.due_at;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const parts = zonedParts(date, timezone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function buildTaskDuePatch(task, timezone) {
  if (!task?.dueDate) return { dueAt: null, duePrecision: 'none' };
  if (
    task.duePrecision === 'timed'
    && task.dueAt
    && formatTaskDueDate(task, timezone) === task.dueDate
  ) {
    return { dueAt: task.dueAt, duePrecision: 'timed' };
  }
  const dueAt = localDateMidnightIso(task.dueDate, timezone);
  return dueAt ? { dueAt, duePrecision: 'date' } : null;
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
    status: composer.status || 'todo',
    priority: composer.priority ?? null,
    dueDate: composer.dueDate ?? null,
    nextAction: composer.nextAction ?? null,
  };
  return {
    operation,
    state: { ...composer, state: 'saving', error: '', operationId },
  };
}

export function isComposerOperationCurrent(composer, operation) {
  return Boolean(
    composer
    && operation
    && composer.operationId === operation.operationId
    && composer.projectId === operation.projectId,
  );
}

export function isTaskOperationCurrent(task, identity) {
  if (!task || !identity) return false;
  const taskUpdatedAt = task.updatedAt ?? task.updated_at ?? null;
  return task.id === identity.taskId && taskUpdatedAt === identity.expectedUpdatedAt;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function taskProjectId(task) {
  const nestedProjectId = task?.project && typeof task.project === 'object'
    ? task.project?.id
    : null;
  return task?.projectId
    ?? task?.project_id
    ?? nestedProjectId
    ?? (typeof task?.project === 'string' ? task.project : null);
}

export function writableTaskFingerprint(task, kind) {
  return stableSerialize({
    kind,
    operationId: task?.operationId ?? null,
    taskId: task?.id ?? null,
    expectedUpdatedAt: task?.updatedAt ?? task?.updated_at ?? null,
    projectId: taskProjectId(task),
    title: task?.title ?? '',
    status: task?.status ?? (kind === 'composer' ? 'todo' : null),
    priority: task?.priority ?? task?.priorityKey ?? null,
    dueDate: task?.dueDate ?? task?.dueAt ?? task?.due_at ?? null,
    nextAction: task?.nextAction ?? task?.next_action ?? null,
  });
}

export function bindUnlockRetry({ kind, operation, task, retry }) {
  if (typeof retry !== 'function') return null;
  if (kind === 'composer' && operation) {
    return {
      kind,
      operation: {
        operationId: operation.operationId,
        projectId: operation.projectId,
      },
      fingerprint: writableTaskFingerprint(operation, kind),
      retry,
    };
  }
  if ((kind === 'editor' || kind === 'complete') && task?.id) {
    return {
      kind,
      identity: {
        taskId: task.id,
        expectedUpdatedAt: task.updatedAt ?? task.updated_at ?? null,
      },
      fingerprint: writableTaskFingerprint(task, kind),
      retry,
    };
  }
  return null;
}

export function isUnlockRetryCurrent(binding, context) {
  if (!binding) return false;
  if (binding.kind === 'composer') {
    return isComposerOperationCurrent(context?.composer, binding.operation)
      && writableTaskFingerprint(context?.composer, binding.kind) === binding.fingerprint;
  }
  if (binding.kind === 'editor') {
    return isTaskOperationCurrent(context?.editor, binding.identity)
      && writableTaskFingerprint(context?.editor, binding.kind) === binding.fingerprint
      && context.editor?.status !== 'done';
  }
  if (binding.kind === 'complete') {
    const task = context?.todos?.find((candidate) => candidate.id === binding.identity.taskId);
    return isTaskOperationCurrent(task, binding.identity)
      && writableTaskFingerprint(task, binding.kind) === binding.fingerprint
      && !task?.done
      && task?.status !== 'done';
  }
  return false;
}

export function guardUnlockRetry(binding, context) {
  const allowed = isUnlockRetryCurrent(binding, context);
  return {
    allowed,
    status: allowed ? 'ready' : 'stale',
    run: allowed ? binding.retry : async () => undefined,
  };
}

export function settleComposerOperation(current, operation, patch) {
  if (!isComposerOperationCurrent(current, operation)) return current;
  return { ...current, ...patch };
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;
  const nestedProject = task.project && typeof task.project === 'object' ? task.project : null;
  const projectId = taskProjectId(task);
  const normalized = {
    ...task,
    id: task.id,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt ?? task.due_at ?? null,
    duePrecision: task.duePrecision ?? task.due_precision ?? null,
    nextAction: task.nextAction ?? task.next_action ?? null,
    updatedAt: task.updatedAt ?? task.updated_at ?? null,
  };
  if (projectId !== null && projectId !== undefined) {
    normalized.projectId = projectId;
    normalized.project = typeof task.project === 'string' ? task.project : projectId;
  } else {
    delete normalized.projectId;
    delete normalized.project;
  }
  const projectName = task.projectName ?? task.project_name ?? nestedProject?.name;
  if (projectName !== null && projectName !== undefined) normalized.projectName = projectName;
  return normalized;
}

export function resolveConflictTask(result) {
  return normalizeTask(result?.task || result?.currentTask || result?.current_task);
}

export function applyAuthoritativeTask(todos, currentTask) {
  const current = normalizeTask(currentTask);
  if (!current?.id) return todos;
  if (current.status === 'done') return todos.filter((task) => task.id !== current.id);
  return todos.map((task) => task.id === current.id ? normalizeTask({ ...task, ...current }) : task);
}

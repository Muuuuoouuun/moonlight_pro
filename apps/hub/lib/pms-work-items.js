import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from './pms-ui.js';
import { readTaskChecklist } from './task-checklist.js';

export const TASK_EXECUTION_LENSES = [
  { key: 'open', label: '미완료' },
  { key: 'inbox', label: '백로그' },
  { key: 'doing', label: '진행 중' },
  { key: 'blocked', label: '막힘' },
  { key: 'overdue', label: '기한 지남' },
  { key: 'undated', label: '기한 없음' },
  { key: 'done', label: '완료' },
];
const priorities = new Set(TASK_PRIORITY_OPTIONS.map(option => option.value));
const lenses = new Set(TASK_EXECUTION_LENSES.map(option => option.key));
const sorts = new Set(['due', 'priority', 'updated']);
const priorityRank = { critical: 0, high: 1, medium: 2, med: 2, low: 3 };
const seoulDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function taskDay(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : seoulDate.format(date);
}

export function taskProjectId(task) {
  return task.project ?? task.projectId ?? '';
}

export function readTaskFilters(params) {
  return {
    projectId: params.get('taskProject') || '',
    priority: priorities.has(params.get('taskPriority')) ? params.get('taskPriority') : '',
    lens: lenses.has(params.get('taskLens')) ? params.get('taskLens') : 'open',
    sort: sorts.has(params.get('taskSort')) ? params.get('taskSort') : 'due',
  };
}

export function writeTaskFilters(searchParams, filters) {
  const params = new URLSearchParams(searchParams.toString());
  for (const [field, key, defaultValue] of [['projectId', 'taskProject', ''], ['priority', 'taskPriority', ''], ['lens', 'taskLens', 'open'], ['sort', 'taskSort', 'due']]) {
    if (!filters[field] || filters[field] === defaultValue) params.delete(key);
    else params.set(key, filters[field]);
  }
  return params;
}

export function buildTaskExecutionModel(tasks = [], projects = [], { projectId = '', priority = '', lens = 'open', sort = 'due', query = '', now = new Date() } = {}) {
  const projectById = new Map(projects.map(project => [project.id, project]));
  const today = taskDay(now);
  const needle = query.trim().toLocaleLowerCase();
  const counts = Object.fromEntries(TASK_EXECUTION_LENSES.map(option => [option.key, 0]));
  const items = [];
  for (const task of tasks) {
    const taskProject = taskProjectId(task);
    if (projectId && (projectId === 'none' ? Boolean(taskProject) : taskProject !== projectId)) continue;
    if (priority && (task.priorityRaw || task.priority) !== priority) continue;
    if (needle && !`${task.title || ''} ${task.description || ''} ${task.nextAction || ''} ${projectById.get(taskProject)?.name || ''} ${task.id}`.toLocaleLowerCase().includes(needle)) continue;
    const done = task.status ? task.status === 'done' : Boolean(task.done);
    const dueDay = taskDay(task.dueAt);
    const matches = {
      open: !done,
      inbox: !done && task.status === 'inbox',
      doing: !done && task.status === 'doing',
      blocked: !done && task.status === 'blocked',
      overdue: !done && Boolean(dueDay && today && dueDay < today),
      undated: !done && !dueDay,
      done,
    };
    for (const key of Object.keys(counts)) if (matches[key]) counts[key] += 1;
    if (matches[lenses.has(lens) ? lens : 'open']) items.push(task);
  }
  const rank = task => priorityRank[task.priorityRaw || task.priority] ?? 2;
  const due = task => taskDay(task.dueAt) || '9999-12-31';
  items.sort((a, b) => {
    if (sort === 'priority') return rank(a) - rank(b) || due(a).localeCompare(due(b));
    if (sort === 'updated') return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    return due(a).localeCompare(due(b)) || rank(a) - rank(b);
  });
  return {
    items,
    counts,
    groups: TASK_STATUS_OPTIONS.map(option => ({
      key: option.value,
      label: option.value === 'inbox' ? '백로그 · 수집한 일' : option.value === 'blocked' ? '막힘 · 다음 행동 확인' : option.label,
      items: items.filter(task => (task.status || (task.done ? 'done' : 'inbox')) === option.value),
    })).filter(group => group.items.length),
  };
}

// Write echoes carry database columns. Keep every projection in step before the
// background ledger read so a project move cannot remain in the old checklist.
export function mergeSavedTask(previous = {}, saved = {}, projects = []) {
  const result = { ...previous, id: saved.id || previous.id };
  if ('meta' in saved || 'checklist' in saved) result.checklist = readTaskChecklist(saved);
  for (const field of ['title', 'description', 'status']) if (field in saved) result[field] = saved[field] ?? '';
  if ('status' in saved) result.done = saved.status === 'done';
  if ('priority' in saved) {
    result.priorityRaw = saved.priority;
    result.priority = saved.priority === 'critical' ? 'high' : saved.priority === 'medium' ? 'med' : saved.priority;
  }
  if ('next_action' in saved || 'nextAction' in saved) result.nextAction = saved.next_action ?? saved.nextAction ?? '';
  if ('updated_at' in saved || 'updatedAt' in saved) result.updatedAt = saved.updated_at ?? saved.updatedAt;
  if ('due_at' in saved || 'dueAt' in saved) {
    result.dueAt = saved.due_at ?? saved.dueAt ?? '';
    result.due = taskDay(result.dueAt)?.slice(5).replace('-', '.') || '기한 없음';
  }
  if ('project_id' in saved || 'projectId' in saved) {
    result.project = saved.project_id ?? saved.projectId ?? '';
    result.projectId = result.project;
    const project = projects.find(item => item.id === result.project);
    result.brand = project?.brand || 'all';
    result.workspace = project?.workspace;
  }
  return result;
}

export async function saveTaskChanges(tasks, patch, { fetchImpl = fetch, onResult } = {}) {
  const result = { saved: [], failed: [] };
  const unique = new Map(tasks.map(task => [task.id, task]));
  for (const task of unique.values()) {
    let receipt;
    try {
      const response = await fetchImpl('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...patch, id: task.id, ...(task.updatedAt ? { expectedUpdatedAt: task.updatedAt } : {}) }),
      });
      const data = await response.json();
      if (response.ok && data.status === 'saved' && data.task?.id === task.id) {
        receipt = { id: task.id, task: data.task };
        result.saved.push(receipt);
      } else {
        receipt = {
          id: task.id,
          status: data.status || 'error',
          current: data.status === 'conflict' ? data.task : null,
          message: data.status === 'conflict'
            ? '다른 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 적용하세요.'
            : data.status === 'preview'
              ? '저장소가 연결되지 않아 변경을 저장하지 않았습니다.'
              : '변경을 저장하지 못했습니다. 연결을 확인하고 다시 시도하세요.',
        };
        result.failed.push(receipt);
      }
    } catch {
      receipt = { id: task.id, status: 'error', message: '연결을 확인하고 다시 시도하세요. 변경은 확인되지 않았습니다.' };
      result.failed.push(receipt);
    }
    onResult?.(receipt);
  }
  return result;
}

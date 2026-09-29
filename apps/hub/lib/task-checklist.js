import { isCanonicalUuid } from './uuid.js';

export const PROJECT_ITEM_OPTIONS = [
  { value: 'task', label: '일반 작업' },
  { value: 'subproject', label: '작업 묶음' },
  { value: 'milestone', label: '마일스톤' },
];
export function projectItemType(task = {}) {
  const value = task.itemType ?? task.meta?.item_type;
  return PROJECT_ITEM_OPTIONS.some(option => option.value === value) ? value : 'task';
}
export function validChecklistDate(value) {
  if (!value) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const TASK_CHECKLIST_LIMIT = 50;

export function readTaskChecklist(task = {}) {
  const items = task.checklist ?? task.meta?.checklist;
  return Array.isArray(items) ? items.map(item => ({
    id: item?.id || '',
    title: typeof item?.title === 'string' ? item.title : '',
    done: item?.done === true,
    note: typeof item?.note === 'string' ? item.note : '',
    ...(item?.dueAt ? { dueAt: item.dueAt } : {}),
  })) : [];
}

export function validateTaskChecklist(items) {
  if (!Array.isArray(items) || items.length > TASK_CHECKLIST_LIMIT) return `체크리스트는 최대 ${TASK_CHECKLIST_LIMIT}개까지 만들 수 있습니다.`;
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !isCanonicalUuid(item.id) || ids.has(item.id.toLowerCase())) return '체크리스트 항목을 다시 확인하세요.';
    if (typeof item.title !== 'string' || !item.title.trim()) return `${index + 1}번째 체크리스트 항목의 이름을 입력하세요.`;
    if (item.note !== undefined && typeof item.note !== 'string') return '체크리스트 세부 메모를 확인하세요.';
    if (item.title.length > 200 || (item.note || '').length > 500) return '항목 이름은 200자, 세부 메모는 500자까지 입력할 수 있습니다.';
    if (!validChecklistDate(item.dueAt)) return `${index + 1}번째 항목의 날짜를 확인하세요.`;
    if (typeof item.done !== 'boolean') return '체크리스트 완료 여부를 확인하세요.';
    ids.add(item.id.toLowerCase());
  }
  return '';
}

export function buildTaskChecklistProgress(task = {}) {
  const items = readTaskChecklist(task);
  const done = items.filter(item => item.done).length;
  return { value: items.length ? Math.round(done / items.length * 100) : null, done, total: items.length, source: 'checklist', label: '체크리스트' };
}

export function hasChecklistConflict(base, local, current) {
  const original = JSON.stringify(readTaskChecklist(base));
  const draft = JSON.stringify(readTaskChecklist(local));
  const latest = JSON.stringify(readTaskChecklist(current));
  return original !== draft && original !== latest && draft !== latest;
}

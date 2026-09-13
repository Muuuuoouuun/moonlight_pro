import { isCanonicalUuid } from './uuid.js';

export const TASK_CHECKLIST_LIMIT = 50;

export function readTaskChecklist(task = {}) {
  const items = task.checklist ?? task.meta?.checklist;
  return Array.isArray(items) ? items.map(item => ({
    id: item?.id || '',
    title: typeof item?.title === 'string' ? item.title : '',
    done: item?.done === true,
    note: typeof item?.note === 'string' ? item.note : '',
  })) : [];
}

export function validateTaskChecklist(items) {
  if (!Array.isArray(items) || items.length > TASK_CHECKLIST_LIMIT) return `체크리스트는 최대 ${TASK_CHECKLIST_LIMIT}개까지 만들 수 있습니다.`;
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!isCanonicalUuid(item.id) || ids.has(item.id)) return '체크리스트 항목을 다시 확인하세요.';
    if (!item.title?.trim()) return `${index + 1}번째 체크리스트 항목의 이름을 입력하세요.`;
    if (item.title.length > 200 || (item.note || '').length > 500) return '항목 이름은 200자, 세부 메모는 500자까지 입력할 수 있습니다.';
    if (typeof item.done !== 'boolean') return '체크리스트 완료 여부를 확인하세요.';
    ids.add(item.id);
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

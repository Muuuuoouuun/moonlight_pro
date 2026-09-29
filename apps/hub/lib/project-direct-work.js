import { isCanonicalUuid } from './uuid.js';
import { projectItemType, readTaskChecklist, validateTaskChecklist } from './task-checklist.js';
import { saveTaskChanges } from './pms-work-items.js';

const failure = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });

// The caller owns the draft ID. Retain the first payload after an uncertain response:
// retrying one intention must never create another row or move it to another project.
export function createProjectTaskWriter({ fetchImpl = (...args) => fetch(...args) } = {}) {
  const intentions = new Map();
  const pending = new Map();
  return function write(input = {}) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const itemType = input.itemType || 'task';
    if (!isCanonicalUuid(input.id) || !isCanonicalUuid(input.projectId)) {
      return Promise.resolve(failure('invalid-input', '프로젝트와 새 할 일 정보를 다시 확인하세요.'));
    }
    if (!title || title.length > 300 || !['task', 'subproject', 'milestone'].includes(itemType)) {
      return Promise.resolve(failure('invalid-input', '할 일 제목을 300자 이내로 입력하세요.'));
    }
    const payload = { id: input.id, title, projectId: input.projectId, itemType,
      status: 'todo', priority: 'medium', dueAt: null, description: '', nextAction: '', checklist: [], source: 'hub-projects' };
    const signature = JSON.stringify(payload);
    if (intentions.has(input.id) && intentions.get(input.id) !== signature) {
      return Promise.resolve(failure('conflict', '이전 저장 결과를 확인하려면 처음 입력한 내용으로 다시 시도하세요.'));
    }
    if (pending.has(input.id)) return pending.get(input.id);
    intentions.set(input.id, signature);
    const request = Promise.resolve().then(async () => {
      try {
        const response = await fetchImpl('/api/hub/tasks', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: signature,
        });
        const data = await response.json();
        const task = data.task;
        if (response.ok && ['saved', 'duplicate'].includes(data.status)
          && task?.id === payload.id && task.title === title
          && (task.project_id ?? task.projectId ?? task.project) === payload.projectId
          && projectItemType(task) === itemType) {
          return { ok: true, status: data.status, task };
        }
        return failure(['preview', 'conflict', 'invalid-input'].includes(data.status) ? data.status : 'error',
          data.status === 'preview' ? '저장소가 연결되지 않아 저장하지 않았습니다.'
            : data.status === 'conflict' ? '같은 항목이 다른 내용으로 저장돼 있습니다. 최신 내용을 확인하세요.'
              : data.status === 'invalid-input' ? '입력한 내용이나 프로젝트 연결을 확인한 뒤 다시 작성하세요. 저장되지 않았습니다.'
              : '저장 결과를 확인하지 못했습니다. 입력을 유지했으니 다시 시도하세요.');
      } catch {
        return failure('error', '저장 결과를 확인하지 못했습니다. 입력을 유지했으니 다시 시도하세요.');
      } finally {
        pending.delete(input.id);
      }
    });
    pending.set(input.id, request);
    return request;
  };
}

function sameCapturedCheck(existing, item) {
  return existing.title === item.title && existing.done === false
    && !existing.note && !existing.dueAt;
}

// Append against the observed version. A stale write may be an acknowledgement lost
// after a successful append; only the same ID with the same captured content is a replay.
export async function appendProjectChecklistItem(task, input, { saveChanges = saveTaskChanges } = {}) {
  const item = { id: input?.id, title: typeof input?.title === 'string' ? input.title.trim() : '', done: false, note: '' };
  const checks = readTaskChecklist(task);
  const existing = checks.find(check => check.id === item.id);
  if (existing) {
    return sameCapturedCheck(existing, item)
      ? { ok: true, status: 'saved', task, replayed: true }
      : failure('conflict', '같은 세부 항목이 다른 내용으로 저장돼 있습니다. 최신 내용을 확인하세요.', { task });
  }
  const checklist = [...checks, item];
  const error = validateTaskChecklist(checklist);
  if (error) return failure('invalid-input', error);
  if (!task?.id || !task.updatedAt) return failure('error', '할 일의 최신 기록을 읽은 뒤 다시 시도하세요.');
  const result = await saveChanges([task], { checklist });
  const saved = result.saved.find(receipt => receipt.id === task.id)?.task;
  if (saved) return { ok: true, status: 'saved', task: saved };
  const failed = result.failed.find(receipt => receipt.id === task.id);
  const current = failed?.current;
  const persisted = current && readTaskChecklist(current).find(check => check.id === item.id);
  if (persisted && sameCapturedCheck(persisted, item)) {
    return { ok: true, status: 'saved', task: current, replayed: true };
  }
  return failure(failed?.status || 'error', failed?.message || '세부 항목을 저장하지 못했습니다. 입력을 유지했으니 다시 시도하세요.', { task: current });
}

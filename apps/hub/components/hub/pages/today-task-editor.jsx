"use client";
import React from 'react';
import { EditDrawer, useToast } from '../hub-primitives';
import { useUndoableAction } from '../use-undoable-action';
import { TASK_PRIORITY_OPTIONS } from '@/lib/pms-ui';
import { dateKeyInZone } from '@/lib/task-today';

export function todayTaskDraft(task) {
  return { ...task, title: task.title || '', dueAt: dateKeyInZone(task.dueAt) || '',
    priority: task.priorityRaw || (task.priority === 'med' ? 'medium' : task.priority || 'medium'), description: task.description || '', nextAction: task.nextAction || '',
    _original: task };
}

// Only the fields touched here are written. In particular, opening a date input
// must not turn an existing timed task into an all-day task.
export function todayTaskEditPatch(draft) {
  const original = todayTaskDraft(draft._original);
  const patch = {};
  for (const key of ['title', 'dueAt', 'priority', 'description', 'nextAction']) {
    const value = key === 'title' ? draft.title.trim() : draft[key];
    if (value !== original[key]) patch[key] = key === 'dueAt' ? value || null : value;
  }
  if (Object.keys(patch).length && draft._original.updatedAt) patch.expectedUpdatedAt = draft._original.updatedAt;
  return patch;
}

export function TodayTaskEditor({ draft, onChange, onClose, actions, onPendingChange }) {
  const toast = useToast();
  const { schedule, cancel } = useUndoableAction();
  const pending = React.useRef(new Map());
  const noticeIds = React.useRef(new Set());
  // Our previous undo/result notice can cover a mobile drawer's footer while
  // hovered or focused. Once the user opens this editor, its fields own feedback.
  React.useEffect(() => {
    if (!draft?.id) return;
    noticeIds.current.forEach(id => toast.dismiss?.(id));
    noticeIds.current.clear();
  }, [draft?.id, toast]);
  function notify(kind, message, options) {
    const id = toast[kind](message, options);
    if (id) noticeIds.current.add(id);
  }
  function publishPending() { onPendingChange([...pending.current.keys()]); }
  function undo(task) {
    if (!cancel(`delete:${task.id}`)) return;
    pending.current.delete(task.id); publishPending();
    notify('info', `삭제를 취소했습니다 · ${task.title}`);
  }
  async function save() {
    if (!draft?.title?.trim()) return { ok: false, status: 'invalid-input', message: '할 일 제목을 입력하세요. 입력한 내용은 유지했습니다.' };
    const patch = todayTaskEditPatch(draft);
    for (const [key, label, limit] of [['title', '제목', 300], ['description', '메모', 4000], ['nextAction', '다음 행동', 1000]]) {
      if (typeof patch[key] === 'string' && patch[key].trim().length > limit) {
        return { ok: false, status: 'invalid-input', message: `${label}은 ${limit}자까지 저장할 수 있습니다. 입력은 유지했으니 줄인 뒤 다시 저장하세요.` };
      }
    }
    if (!Object.keys(patch).length) return { ok: true, status: 'saved' };
    const result = await actions.run(draft._original, patch);
    if (result.ok) notify('success', '할 일을 수정했습니다.');
    return result;
  }
  function remove() {
    if (!draft?.id || pending.current.has(draft.id)) return { ok: false, status: 'pending' };
    const task = draft._original;
    pending.current.set(task.id, task); publishPending();
    notify('info', `삭제 예정 · ${task.title}`, { action: { label: '되돌리기', onClick: () => undo(task) } });
    schedule(`delete:${task.id}`, async () => {
      try {
        const result = await actions.remove(task);
        if (result.ok) notify('success', `할 일을 삭제했습니다 · ${task.title}`);
        else notify('error', `삭제를 확인하지 못했습니다 · ${task.title} — ${result.message} 목록을 확인한 뒤 편집에서 다시 시도하세요.`);
      } finally { pending.current.delete(task.id); publishPending(); }
    });
    return { ok: true, status: 'deferred' };
  }
  return <EditDrawer title="할 일 편집" subtitle="집중에서 빼면 대기 목록으로 돌아갑니다. 삭제는 할 일 자체를 지웁니다."
    record={draft} width="min(460px, 94vw)" onChange={onChange} onClose={onClose} onSave={save} onDelete={remove}
    fields={[
      { key: 'title', label: '제목', maxLength: 300 },
      { key: 'priority', label: '우선순위', type: 'select', options: TASK_PRIORITY_OPTIONS },
      { key: 'dueAt', label: '기한', inputType: 'date' },
      { key: 'nextAction', label: '다음 행동', optional: true, maxLength: 1000 },
      { key: 'description', label: '메모', type: 'textarea', optional: true, maxLength: 4000 },
    ]} />;
}

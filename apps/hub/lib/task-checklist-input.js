import { TASK_CHECKLIST_LIMIT } from './task-checklist.js';

const unused = item => !item.title?.trim() && !item.note?.trim() && !item.done && !item.dueAt;

// Empty capture rows are UI affordances, not records. Never drop a note or completion.
export function checklistForSave(items = []) {
  return items.filter(item => !unused(item));
}

export function checklistEnterAction(items, id, event, disabled = false) {
  if (disabled || event.key !== 'Enter' || event.isComposing || event.keyCode === 229
    || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const index = items.findIndex(item => item.id === id);
  if (index < 0 || !items[index].title?.trim()) return null;
  if (items[index + 1] && unused(items[index + 1])) return { focusId: items[index + 1].id };
  return items.length < TASK_CHECKLIST_LIMIT ? { insertAt: index + 1 } : null;
}

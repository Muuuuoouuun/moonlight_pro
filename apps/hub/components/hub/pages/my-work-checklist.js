import { readTaskChecklist, validateTaskChecklist } from '@/lib/task-checklist';
import { isCanonicalUuid } from '@/lib/uuid.js';

export function buildMyWorkChecklistToggle(item, checklistId) {
  const checklist = item?.checklist;
  if (item?.lane !== 'task' || !isCanonicalUuid(item.entityId)
    || typeof item.updatedAt !== 'string' || !item.updatedAt
    || !isCanonicalUuid(checklistId) || validateTaskChecklist(checklist) ||
    !checklist.some((step) => step.id === checklistId)) return null;
  return {
    id: item.entityId,
    expectedUpdatedAt: item.updatedAt,
    checklist: checklist.map((step) => step.id === checklistId ? { ...step, done: !step.done } : { ...step }),
  };
}

export function readMyWorkChecklistReceipt(response, data, command) {
  if (!response?.ok || data?.status !== 'saved' || data?.task?.id !== command?.id
    || typeof data.task.updated_at !== 'string' || !data.task.updated_at
    || !Array.isArray(data.task.meta?.checklist)) return null;
  const checklist = readTaskChecklist(data.task);
  if (validateTaskChecklist(checklist) || JSON.stringify(checklist) !== JSON.stringify(command.checklist)) return null;
  return { checklist, updatedAt: data.task.updated_at };
}

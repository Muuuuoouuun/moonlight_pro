import { projectItemType, readTaskChecklist } from './task-checklist.js';

const seoulDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});

function dayKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : seoulDay.format(date);
}

function dayDistance(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function selectUrgentProjectItems(tasks = [], now = new Date()) {
  const today = dayKey(now);
  if (!today) return [];
  return tasks.flatMap(task => {
    if (task.done || task.status === 'done' || !['subproject', 'milestone'].includes(projectItemType(task))) return [];
    const nextCheck = readTaskChecklist(task)
      .filter(item => !item.done)
      .sort((a, b) => (dayKey(a.dueAt) || '9999-12-31').localeCompare(dayKey(b.dueAt) || '9999-12-31'))[0] || null;
    const dueKeys = [dayKey(task.dueAt), dayKey(nextCheck?.dueAt)].filter(Boolean).sort();
    const dueKey = dueKeys[0] || '';
    const days = dueKey ? dayDistance(today, dueKey) : null;
    const blocked = task.status === 'blocked';
    if (!blocked && (days === null || days > 7)) return [];
    const rank = days !== null && days < 0 ? 0 : days === 0 ? 1 : blocked ? 2 : 3;
    const reason = days !== null && days < 0 ? `${Math.abs(days)}일 지남`
      : days === 0 ? '오늘' : blocked ? '막힘' : `${days}일 남음`;
    return [{ taskId: task.id, checkId: nextCheck?.id || null, title: task.title,
      checkTitle: nextCheck?.title || '', dueKey, rank, reason, blocked }];
  }).sort((a, b) => a.rank - b.rank || (a.dueKey || '9999-12-31').localeCompare(b.dueKey || '9999-12-31') || a.title.localeCompare(b.title));
}

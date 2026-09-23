const seoulDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});

function monthKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : seoulDay.format(date).slice(0, 7);
}

export function buildCurrentMonthProjectPreview(projects = [], now = new Date()) {
  const month = monthKey(now);
  const unique = [...new Map(projects.filter(project => project?.id).map(project => [project.id, project])).values()];
  const completed = unique.filter(project => project.statusKey === 'completed' && monthKey(project.completedAt) === month);
  const ongoing = unique.filter(project => ['active', 'blocked'].includes(project.statusKey));
  const undatedCompleted = unique.filter(project => project.statusKey === 'completed' && !monthKey(project.completedAt));
  const linkedCustomers = new Set([...completed, ...ongoing].map(project => project.entityRef)
    .filter(ref => ref?.id && ['lead', 'customer_account'].includes(ref.type))
    .map(ref => `${ref.type}:${ref.id}`));
  return {
    month,
    completed,
    ongoing,
    blocked: ongoing.filter(project => project.statusKey === 'blocked'),
    undatedCompleted,
    linkedCustomerCount: linkedCustomers.size,
  };
}

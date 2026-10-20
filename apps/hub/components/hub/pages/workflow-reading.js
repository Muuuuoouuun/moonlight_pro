// Presentation only. A start time never proves that a meeting ended or was completed.
export function todayAgendaRows(items = [], now = new Date()) {
  const clock = new Date(now).getTime();
  const rows = (Array.isArray(items) ? items : []).map((event, index) => {
    const at = event.allDay ? null : Date.parse(event.whenAt || '');
    return { event, index, at: Number.isFinite(at) ? at : null };
  }).sort((a, b) => {
    if (Boolean(a.event.allDay) !== Boolean(b.event.allDay)) return a.event.allDay ? -1 : 1;
    if (a.at === null || b.at === null) return a.at === b.at ? a.index - b.index : a.at === null ? 1 : -1;
    return a.at - b.at || String(a.event.id || '').localeCompare(String(b.event.id || '')) || a.index - b.index;
  });
  const next = rows.find(row => row.at !== null && row.at >= clock);
  return rows.map(row => ({
    ...row,
    label: row.event.allDay ? '종일' : row.at === null ? '시각 확인 필요' : row === next ? '다음 시작' : row.at < clock ? '시작 시각 지남' : '예정',
    next: row === next,
  }));
}

// A compact timeline stays near now, not the first three starts of the day.
// Keep one all-day context, the latest started item and the next start when
// available. A past start is context only: no end time or completion is inferred.
export function collapsedTodayAgendaRows(rows = [], limit = 3) {
  if (rows.length <= limit) return rows;
  const timed = rows.filter(row => row.at !== null);
  const nextIndex = timed.findIndex(row => row.next);
  const selected = new Set();
  const add = row => { if (row && selected.size < limit) selected.add(row); };
  add(timed[nextIndex]);
  add(nextIndex >= 0 ? timed[nextIndex - 1] : timed.at(-1));
  add(rows.find(row => row.event.allDay));
  const remainder = nextIndex >= 0
    ? [...timed.slice(nextIndex + 1), ...timed.slice(0, nextIndex).reverse()]
    : [...timed].reverse();
  [...remainder, ...rows].forEach(add);
  return rows.filter(row => selected.has(row));
}

// Preserve the existing check-in scope. Missing evidence comes before measured
// values; measured zero is a real value and must not be treated as missing.
export function recordFirstRows(rows = [], limit = 3) {
  return rows.filter(row => row.manual && row.objective.status === 'active')
    .map((row, index) => ({ row, index }))
    .sort((a, b) => Number(b.row.needsEvidence) - Number(a.row.needsEvidence) || a.index - b.index)
    .slice(0, limit)
    .map(item => item.row);
}

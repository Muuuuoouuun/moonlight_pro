import { shiftDateKey, toZonedDateKey } from './rhythm-calendar.js';
import { isHealthIndicator } from './goal-concepts.js';

// Calendar presets are explicit user choices, never inferred business targets.
export function goalPeriodPreset(preset, now = new Date(), timezone = 'Asia/Seoul') {
  const today = toZonedDateKey(now, timezone);
  const [year, month] = today.split('-').map(Number);
  if (preset === 'week') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const periodStart = shiftDateKey(today, -((weekday + 6) % 7));
    return { periodStart, periodEnd: shiftDateKey(periodStart, 6) };
  }
  const startMonth = preset === 'month' ? month : preset === 'quarter' ? Math.floor((month - 1) / 3) * 3 + 1 : null;
  if (startMonth === null) return null;
  const end = new Date(Date.UTC(year, startMonth - 1 + (preset === 'quarter' ? 3 : 1), 0));
  return { periodStart: `${year}-${String(startMonth).padStart(2, '0')}-01`, periodEnd: end.toISOString().slice(0, 10) };
}

export function goalCheckRows(model, { status = 'active', search = '', filter = 'all' } = {}) {
  const needle = search.trim().toLocaleLowerCase();
  const objectives = new Map(model.objectives.filter(item => status === 'all' || item.status === status).map(item => [item.id, item]));
  return model.metrics.flatMap(metric => {
    const objective = objectives.get(metric.objectiveId);
    if (!objective || metric.status === 'archived' || metric.archivedAt) return [];
    if (needle && !`${objective.title} ${metric.name} ${objective.description || ''}`.toLocaleLowerCase().includes(needle)) return [];
    const manual = metric.sourceKey === 'manual';
    const needsEvidence = metric.measurement?.coverage !== 'complete' || !Number.isFinite(metric.measurement?.value);
    if (filter === 'manual' && !manual || filter === 'unmeasured' && !needsEvidence) return [];
    return [{ objective, metric, manual, needsEvidence }];
  });
}

// KPI 이름 검색은 목표 제목에 먼저 거르지 않는다. 선택한 소속의 model과 목표 상태를 그대로 보존한다.
export function goalKpiRows(model, options = {}) {
  return goalCheckRows(model, options).filter(row => isHealthIndicator(row.metric));
}

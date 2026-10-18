import { goalSectionState } from './goal-client.js';
import { isKeyResult, keyResultPace, keyResultProgress, keyResultTone, objectivePeriod } from './goal-concepts.js';

const DAY = 86400000;
const dateFormats = new Map();
const dateKey = (value, timezone) => {
  if (!Number.isFinite(Date.parse(value))) return null;
  if (!dateFormats.has(timezone)) dateFormats.set(timezone, new Intl.DateTimeFormat('en-CA', { timeZone: timezone }));
  return dateFormats.get(timezone).format(new Date(value));
};
const isoDay = value => new Date(value).toISOString().slice(0, 10);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

// This is a view of the existing ledger, never a second score or a conversion funnel.
export function goalDashboardSnapshot(model, objectives, today, now = `${today}T12:00:00+09:00`) {
  const objectiveById = new Map(objectives.map(objective => [objective.id, objective]));
  const metrics = model.metrics.filter(metric => objectiveById.has(metric.objectiveId) && metric.status !== 'archived' && !metric.archivedAt);
  const metricById = new Map(metrics.map(metric => [metric.id, metric]));
  const observations = model.observations.filter(observation => {
    const metric = metricById.get(observation.metricId);
    return metric && dateKey(observation.observedAt, 'Asia/Seoul') <= today && Number.isFinite(Date.parse(observation.observedAt));
  });
  const keyResults = metrics.filter(isKeyResult).map(metric => {
    const objective = objectiveById.get(metric.objectiveId);
    const localToday = dateKey(now, objective.timezone || 'Asia/Seoul');
    const period = objectivePeriod(objective, localToday);
    const pace = keyResultPace(metric, objective, observations.filter(item => item.metricId === metric.id), localToday);
    return { metric, objective, period, progress: keyResultProgress(metric), tone: period.phase === 'running' ? keyResultTone(metric, pace, period) : 'wait' };
  });
  const measured = keyResults.filter(row => row.progress !== null);
  const progress = mean(measured.map(row => row.progress));
  // A time marker is comparable only when all measured KRs are in a running period.
  const expected = measured.length && measured.every(row => row.period.phase === 'running')
    ? mean(measured.map(row => row.period.elapsed * 100)) : null;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const monday = todayMs - ((new Date(todayMs).getUTCDay() + 6) % 7) * DAY;
  const observationState = goalSectionState(model, 'operating_observations');
  const weeks = Array.from({ length: 7 }, (_, index) => {
    const start = isoDay(monday - (6 - index) * 7 * DAY);
    const end = isoDay(monday - (6 - index) * 7 * DAY + 6 * DAY);
    const entries = observations.filter(item => {
      const key = dateKey(item.observedAt, 'Asia/Seoul');
      return key >= start && key <= end;
    });
    const complete = entries.filter(item => item.coverage === 'complete' && Number.isFinite(item.value)).length;
    return { start, end, complete, pending: entries.length - complete, current: index === 6, known: observationState === 'live' || entries.length > 0 };
  });
  return {
    keyResults, progress, expected, measured: measured.length, unmeasured: keyResults.length - measured.length,
    observationState, weeks,
    recent: observations.toSorted((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 5)
      .map(observation => ({ observation, metric: metricById.get(observation.metricId), objective: objectiveById.get(metricById.get(observation.metricId).objectiveId) })),
  };
}

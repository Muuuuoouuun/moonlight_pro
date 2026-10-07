// 현황은 본체의 OKR·KPI 규칙을 그대로 읽는다. 모르는 값을 0으로 채우지 않는다.
import { goalSectionState } from './goal-client.js';
import { keyResultPace, kpiHealth, kpiSummary, milestoneSummary, objectivePeriod, objectiveScore, splitObjectiveMetrics, weeklyCells } from './goal-concepts.js';

export function goalSummary(model, today) {
  const active = model.objectives.filter(objective => objective.status === 'active');
  const observations = new Map();
  for (const observation of model.observations) {
    const rows = observations.get(observation.metricId) || [];
    rows.push(observation);
    observations.set(observation.metricId, rows);
  }
  const summaries = active.map(objective => {
    const { keyResults, healthIndicators } = splitObjectiveMetrics(model.metrics, objective.id);
    const objectiveDay = today || new Intl.DateTimeFormat('en-CA', { timeZone: objective.timezone || 'Asia/Seoul' }).format(new Date());
    const period = objectivePeriod(objective, objectiveDay);
    const drivers = keyResults.filter(metric => metric.role === 'driver').slice(0, 2).map(metric => {
      const rows = observations.get(metric.id) || [];
      const pace = keyResultPace(metric, objective, rows, objectiveDay);
      return { metric, pace, cells: pace?.weeklyPace && metric.sourceKey === 'manual' ? weeklyCells(metric, objective, rows, objectiveDay) : [] };
    });
    return { objective, today: objectiveDay, period, score: objectiveScore(keyResults), drivers, healthIndicators,
      milestone: milestoneSummary(model.links.filter(link => link.objectiveId === objective.id), objectiveDay).next };
  });
  return {
    activeCount: active.length,
    objectiveState: goalSectionState(model, 'operating_objectives'),
    objectives: summaries.slice(0, 2),
    kpis: kpiSummary(summaries.flatMap(summary => summary.healthIndicators.map(metric => ({ health: kpiHealth(metric) })))),
    metricState: goalSectionState(model, 'operating_metrics'),
    linkState: goalSectionState(model, 'operating_goal_links'),
  };
}

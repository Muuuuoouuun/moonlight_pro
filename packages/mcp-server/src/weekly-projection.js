// Keep operational numbers and their meaning even when the Hub's goal history grows.
// Goal/history navigation uses get_goals; this is one bounded weekly read, not a history page.
const bytes = value => Buffer.byteLength(JSON.stringify(value));
function text(value, limit = 160) {
  if (typeof value !== 'string') return undefined;
  let selected = value.slice(0, limit);
  while (bytes(selected) > limit) selected = selected.slice(0, -Math.max(1, Math.ceil((bytes(selected) - limit) / 6)));
  return selected;
}
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
// Every stat the Hub weekly report returns, including the Action KPI fields (today's three, memos,
// review days, deal stage moves). apps/hub/lib/repositories/weekly-report.test.mjs fails if the Hub
// adds a stat this list drops.
const STAT_KEYS = ['doneTasks', 'publishes', 'contacts', 'personalDeals', 'focusPicked', 'focusDone', 'focusRate', 'focusDays', 'memos', 'reviewDays',
  'newDeals', 'movedDeals', 'modifiedOpenDeals', 'wonDeals', 'wonAmount'];
const DEFINITION_KEYS = ['contacts', 'doneTasks', 'publishes', 'focusRate', 'memos', 'reviewDays', 'movedDeals', 'modifiedOpenDeals', 'wonDeals', 'wonAmount', 'scorecard'];
function evidence(value) {
  const out = {};
  for (const key of ['type', 'table', 'id', 'periodStart', 'periodEnd', 'scope', 'asOf']) if (typeof value[key] === 'string') out[key] = text(value[key], 80);
  if (typeof value.label === 'string') out.label = text(value.label);
  if (typeof value.href === 'string') out.href = text(value.href, 350);
  if (typeof value.count === 'number') out.count = finite(value.count);
  out.detailsTruncated = Object.entries(value).some(([key, entry]) => out[key] !== entry);
  return out;
}
export function projectWeeklyPayload(payload) {
  const out = { truncated: true };
  for (const key of ['status', 'source', 'scope', 'timezone', 'periodStart', 'periodEnd', 'since', 'until', 'asOf']) if (typeof payload[key] === 'string') out[key] = text(payload[key], 80);
  for (const key of ['configured', 'partial']) if (typeof payload[key] === 'boolean') out[key] = payload[key];
  if (typeof payload.windowDays === 'number') out.windowDays = finite(payload.windowDays);
  out.failedSources = (payload.failedSources || []).slice(0, 12).map(value => text(value, 80));
  out.stats = payload.stats == null ? null : Object.fromEntries(STAT_KEYS.filter(key => key in payload.stats).map(key => [key, finite(payload.stats[key])]));
  out.definitions = Object.fromEntries(DEFINITION_KEYS.filter(key => typeof payload.definitions?.[key] === 'string').map(key => [key, text(payload.definitions[key], 240)]));
  out.definitionsTruncated = DEFINITION_KEYS.some(key => typeof payload.definitions?.[key] === 'string' && out.definitions[key] !== payload.definitions[key]);
  const measurements = Array.isArray(payload.measurements) ? payload.measurements : [];
  out.measurements = measurements.slice(0, 4).map(item => {
    const all = Array.isArray(item.evidence) ? item.evidence : [];
    const aggregate = all.find(entry => entry.type === 'query');
    const selected = [...all.filter(entry => entry.type !== 'query').slice(0, 2), ...(aggregate ? [aggregate] : [])];
    return {
      sourceKey: text(item.sourceKey, 80), value: finite(item.value), coverage: text(item.coverage, 30),
      reason: text(item.reason, 100), periodStart: text(item.periodStart, 40), periodEnd: text(item.periodEnd, 40), observedAt: text(item.observedAt, 40),
      definitionNote: text(item.definitionNote, 240), evidence: selected.map(evidence),
      evidenceTruncated: selected.length < all.length || selected.some(entry => evidence(entry).detailsTruncated),
    };
  });
  out.measurementsTruncated = measurements.length > out.measurements.length;
  out.goals = {
    status: text(payload.goals?.status, 30) || 'unmeasured',
    objectivesReturned: Array.isArray(payload.goals?.objectives) ? payload.goals.objectives.length : null,
    metricsReturned: Array.isArray(payload.goals?.metrics) ? payload.goals.metrics.length : null,
    detailTool: 'get_goals', detailQuery: {scope: out.scope}, historyOmitted: true,
  };
  out.highlights = (payload.highlights || []).slice(0, 3).map(item => ({kind: text(item.kind, 40), label: text(item.label)}));
  out.hint = 'Weekly statistics and source definitions are preserved. Evidence is bounded; use Hub for full source rows and get_goals for paged goals and latest measurements.';
  // Prefer removing optional row examples; retain the aggregate query receipt and null truth.
  while (bytes(out) > 16384) {
    const item = out.measurements.find(value => value.evidence.some(entry => entry.type !== 'query'));
    if (!item) break;
    item.evidence.splice(item.evidence.findIndex(entry => entry.type !== 'query'), 1); item.evidenceTruncated = true;
  }
  if (bytes(out) > 16384) {
    for (const item of out.measurements) {
      delete item.definitionNote;
      for (const entry of item.evidence) { delete entry.label; delete entry.href; entry.detailsTruncated = true; }
      item.evidenceTruncated = true;
    }
  }
  return out;
}

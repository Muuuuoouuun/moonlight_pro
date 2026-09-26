// Execution policy is independent of the historical DB `active` flag. Removing a
// scheduler does not rewrite that flag or erase its old run receipts.
const RETIRED = {
  'followup-autopilot': 'Guru 후속 초안 자동 생성',
  'content-flywheel': '콘텐츠 초안 자동 생성',
  'chief-of-staff': '아침 브리핑 자동 생성',
};
const OPERATIONAL = {
  'recompute-scores': '우선순위 점수 재계산',
  'inquiries-sync': '문의 동기화',
  'github-sync': 'GitHub 동기화',
};

export function resolveAutomationPolicy(automation = {}, trigger = null, fallbackKey = null) {
  const key = automation.meta?.key || fallbackKey || null;
  const retired = Object.hasOwn(RETIRED, key);
  const operational = Object.hasOwn(OPERATIONAL, key)
    || ['schedule', 'webhook', 'event'].includes(trigger?.trigger_type);
  return {
    key,
    name: automation.name || RETIRED[key] || OPERATIONAL[key] || key || 'System',
    statusKey: retired ? 'disabled' : automation.status || 'unknown',
    executionMode: retired ? 'retired' : operational ? 'operational' : 'requested',
  };
}

// One open incident per active operational flow in the last 24 hours. Pending or
// ignored executions do not prove recovery. Use the complete fetched window,
// before slicing the visible history; never discard the historical receipts.
function resultTime(run) {
  const finished = run.finishedAt ? new Date(run.finishedAt).getTime() : NaN;
  return Number.isFinite(finished) ? finished : new Date(run.startedAt).getTime();
}

export function getActionableAutomationFailures(runs = [], { now = new Date() } = {}) {
  const end = new Date(now).getTime();
  const start = end - 24 * 60 * 60 * 1000;
  const settled = runs.filter((run) => {
    const at = resultTime(run);
    return run.executionMode === 'operational' && run.automationStatus === 'active'
      && (run.automationKey || run.automationId)
      && ['failure', 'success'].includes(run.statusKey)
      && Number.isFinite(at) && at >= start && at <= end;
  }).sort((a, b) => resultTime(b) - resultTime(a));
  const groups = new Map();
  for (const run of settled) {
    const key = run.automationId || run.automationKey;
    if (!groups.has(key)) groups.set(key, { latest: run, failureCount: 0, recovered: false });
    const group = groups.get(key);
    if (run.statusKey === 'success') group.recovered = true;
    else if (!group.recovered) group.failureCount += 1;
  }
  return [...groups.values()]
    .filter(({ latest }) => latest.statusKey === 'failure')
    .map(({ latest, failureCount }) => ({ ...latest, failureCount }));
}

// OKR과 KPI를 같은 "지표"로 뭉개지 않기 위한 순수 규칙 (2026-09-29).
//
// 저장소는 목표(objective) 아래 지표(metric)의 role 셋(outcome·driver·guardrail)만 안다. 스키마를 바꾸지
// 않고 role로 개념을 가른다:
//   · KR(핵심 결과)  = outcome·driver + 약속선(target)이 있는 것 — 이 기간 안에 그 선까지 움직여야 한다.
//                      현재 점수(0~0.7)와 바닥 달성률(0~100%)을 구분하고 기간이 끝나면 닫힌다.
//   · 참고 지표      = outcome·driver인데 약속선이 없는 것 — "기록만" 하는 값. 목표가 없으니 KR이 아니고 점수도 없다.
//   · KPI(건강 지표) = guardrail     — 지켜볼 건강선. 현재 모델은 목표 기간에 붙고, "선 안/선 밖"으로 읽는다.
// 점수는 등록된 약속선(target) 대비 진척이다. 천장(도전값)은 저장하지 않는다.

export const GOAL_CONCEPT_BY_ROLE = {
  outcome: { concept: 'kr', label: '결과 KR', hint: '이 기간에 이루려는 변화' },
  driver: { concept: 'kr', label: '선행 KR', hint: '결과를 움직이는 행동' },
  guardrail: { concept: 'kpi', label: 'KPI', hint: '계속 지켜볼 선' },
};

export function goalConcept(metric) {
  return (GOAL_CONCEPT_BY_ROLE[metric?.role] || GOAL_CONCEPT_BY_ROLE.outcome).concept;
}
export const isHealthIndicator = metric => goalConcept(metric) === 'kpi';
// 방향에 맞는 약속선이 등록돼 있는가. 범위형은 최솟값·최댓값이 모두 있어야 한다.
export const hasTarget = metric => metric?.direction === 'range' ? Number.isFinite(metric.targetMin) && Number.isFinite(metric.targetMax) : Number.isFinite(metric?.target);
export const isKeyResult = metric => goalConcept(metric) === 'kr' && hasTarget(metric);
export const isReferenceMetric = metric => goalConcept(metric) === 'kr' && !hasTarget(metric);

const activeMetric = metric => metric.status !== 'archived' && !metric.archivedAt;

// 채점은 약속(바닥) + 도전(천장) 이중선이다(개인 사업 OKR v3 §4, 2026-09-30 운영자 확정 Q1).
//   바닥 미만 0.7 × 실제/바닥 · 바닥~천장 0.7→1.0 · 천장 이상 1.0
// 저장된 목표값(target)은 바닥이다. 천장은 아직 저장하지 않으므로(마이그레이션 0053 전) 점수는 0.7에서 멈춘다.
export const FLOOR_SCORE = 0.7;

// KR 점수 0~0.7. 바닥 달성이면 0.7, 진척률이 산정되면 0.7 × 진척, 아니면 null(점수 낼 근거 없음).
export function keyResultScore(metric) {
  const progress = metric?.progress;
  if (!progress || isHealthIndicator(metric) || !['achieved', 'in_progress'].includes(progress.state) || (metric.measurement && metric.measurement.coverage !== 'complete')) return null;
  if (progress.state === 'achieved' || progress.achieved === true) return FLOOR_SCORE;
  if (Number.isFinite(progress.value)) return FLOOR_SCORE * Math.max(0, Math.min(100, progress.value)) / 100;
  return null;
}
export const reachedFloor = metric => metric?.progress?.state === 'achieved' || metric?.progress?.achieved === true;

// 목표 점수 = 점수가 나온 KR의 평균. 측정 못 한 KR을 0점으로 세지 않고 몇 개가 비었는지 따로 말한다.
export function objectiveScore(keyResults) {
  const scores = keyResults.map(keyResultScore).filter(value => value !== null);
  return {
    score: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    scored: scores.length,
    unscored: keyResults.length - scores.length,
  };
}

const DAY = 86400000;
const dayNumber = key => {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const value = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === key ? value / DAY : NaN;
};

// 기간 경과율(0~1)과 남은 일수. 시작일·종료일을 모두 포함한다.
export function objectivePeriod(objective, todayKey) {
  const start = dayNumber(objective.periodStart), end = dayNumber(objective.periodEnd), today = dayNumber(todayKey);
  if (![start, end, today].every(Number.isFinite) || end < start) return { phase: 'unknown', elapsed: null, daysLeft: null };
  const total = end - start + 1;
  if (today < start) return { phase: 'upcoming', elapsed: 0, daysLeft: end - today + 1 };
  if (today > end) return { phase: 'ended', elapsed: 1, daysLeft: 0 };
  return { phase: 'running', elapsed: (today - start + 1) / total, daysLeft: end - today };
}

// 바닥 페이스라면 지금 있어야 할 점수 = 0.7 × 기간 경과율. 기간 경과율(0~1)과 바로 비교하면
// 천장 페이스가 기준이 돼 늘 늦어 보인다.
export const floorPaceScore = period => period?.phase === 'running' ? FLOOR_SCORE * period.elapsed : null;

// 점수와 바닥 페이스를 나란히 놓는 한마디. 색이 아니라 글로만 말한다. 허용폭은 바닥의 10%.
export function objectivePace(score, period) {
  const expected = floorPaceScore(period);
  if (score === null || expected === null) return null;
  const gap = score - expected;
  const tolerance = FLOOR_SCORE * 0.1;
  return gap >= tolerance ? '바닥 페이스보다 앞섬' : gap <= -tolerance ? '바닥 페이스보다 늦음' : '바닥 페이스와 비슷함';
}

// KPI 건강 상태 — 점수가 아니라 선 안/밖.
//   inside=선 안, outside=선 밖, partial=일부 근거, unmeasured=아직 못 잼, unset=선 미설정
export function kpiHealth(metric) {
  if (metric?.measurement?.coverage === 'partial') return 'partial';
  if (metric?.measurement && (metric.measurement.coverage !== 'complete' || !Number.isFinite(metric.measurement.value))) return 'unmeasured';
  const state = metric?.progress?.state;
  if (state === 'achieved' || metric?.progress?.achieved === true) return 'inside';
  if (state === 'in_progress' && metric?.progress?.achieved === false) return 'outside';
  if (state === 'partial') return 'partial';
  if (state === 'target_unset') return 'unset';
  return 'unmeasured';
}

export const KPI_HEALTH_LABEL = { inside: '선 안', outside: '선 밖', partial: '일부 근거', unmeasured: '미측정', unset: '선 미설정' };
const HEALTH_ORDER = { outside: 0, unmeasured: 1, partial: 2, unset: 3, inside: 4 };

// 본체·상세·현황은 같은 의미로 읽는다. 점수 0.35와 바닥 달성률 50%는 다른 척도다.
export function goalMetricReading(metric) {
  if (isHealthIndicator(metric)) return { concept: 'kpi', label: `KPI · ${KPI_HEALTH_LABEL[kpiHealth(metric)]}`, score: null, achievementPercent: null };
  if (!hasTarget(metric)) return { concept: 'reference', label: '참고값 · 점수 없음', score: null, achievementPercent: null };
  const score = keyResultScore(metric);
  const achievementPercent = score === null ? null : Number.isFinite(metric.progress?.value) ? Math.max(0, Math.min(100, metric.progress.value)) : reachedFloor(metric) ? 100 : null;
  const label = metric.measurement?.coverage === 'partial' || metric.progress?.state === 'partial' ? 'KR · 일부 근거 · 점수 보류' : score === null ? 'KR · 점수 전' : reachedFloor(metric) ? 'KR · 바닥 달성' : 'KR · 진행 중';
  return { concept: 'kr', label, score, achievementPercent };
}

export function kpiThresholdLabel(metric) {
  const unit = metric.unit ? ` ${metric.unit}` : '';
  if (metric.direction === 'range') return `${metric.targetMin ?? '—'}–${metric.targetMax ?? '—'}${unit} 안`;
  if (metric.direction === 'decrease') return `${metric.target ?? '—'}${unit} 이하`;
  return `${metric.target ?? '—'}${unit} 이상`;
}

// 선 밖 → 미측정 → 일부 → 선 안 순. 같은 상태 안에서는 입력 순서를 지킨다.
export function sortKpis(rows) {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => HEALTH_ORDER[a.row.health] - HEALTH_ORDER[b.row.health] || a.index - b.index).map(item => item.row);
}

export function kpiSummary(rows) {
  const count = health => rows.filter(row => row.health === health).length;
  return { total: rows.length, inside: count('inside'), outside: count('outside'), unmeasured: rows.filter(row => ['unmeasured', 'partial', 'unset'].includes(row.health)).length };
}

// 추이 — 확인 완료(complete)이고 숫자인 관측만 시간순으로. 최근 limit개.
export function kpiTrend(observations, limit = 8) {
  return observations
    .filter(item => item.coverage === 'complete' && Number.isFinite(item.value) && Number.isFinite(Date.parse(item.observedAt)))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
    .slice(-limit)
    .map(item => item.value);
}

// 마지막으로 잰 뒤 며칠. 관측이 없으면 null.
export function daysSinceObservation(observations, todayKey) {
  const times = observations.map(item => Date.parse(item.observedAt)).filter(Number.isFinite);
  if (!times.length) return null;
  const last = new Date(Math.max(...times)).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  return Math.max(0, Math.round(dayNumber(todayKey) - dayNumber(last)));
}

// 자동 observedAt은 원천 발생 시각이 아닌 집계 조회 시각이다. 수동 관측과 이름을 섞지 않는다.
export function metricFreshnessLabel(metric, todayKey, timezone = 'Asia/Seoul') {
  if (metric.measurement?.reason === 'invalid-observation-time') return '관측 시각 확인 필요';
  const time = Date.parse(metric.measurement?.observedAt);
  if (!Number.isFinite(time)) return metric.sourceKey === 'manual' ? '관측 시각 미확인' : '집계 조회 시각 미확인';
  const last = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(time));
  const days = Math.max(0, dayNumber(todayKey) - dayNumber(last));
  const when = days === 0 ? '오늘' : `${days}일 전`;
  return metric.sourceKey === 'manual' ? `${when} 관측` : `${when} 집계 조회 · 원천 최신일 미확인`;
}

// 차트의 이번 값은 숫자와 같은 measurement. 최근 확정 관측은 별도 눈금으로만 비교한다.
export function kpiBulletReading(metric, observations = []) {
  const measurement = metric.measurement;
  const now = ['complete', 'partial'].includes(measurement?.coverage) && Number.isFinite(measurement.value) ? measurement.value : null;
  const time = Date.parse(measurement?.observedAt);
  const previous = observations.filter(item => (!item.metricId || !metric.id || item.metricId === metric.id) && (!measurement?.periodStart || item.periodStart === measurement.periodStart) && (!measurement?.periodEnd || item.periodEnd === measurement.periodEnd) && item.coverage === 'complete' && Number.isFinite(item.value) && Number.isFinite(Date.parse(item.observedAt)) && Number.isFinite(time) && Date.parse(item.observedAt) < time)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] || null;
  return { now, partial: measurement?.coverage === 'partial', previous: previous?.value ?? null, previousAt: previous?.observedAt ?? null };
}

// 목표 한 장에 붙일 제안 한 줄 — OKR 기본 원칙에서 벗어난 것만, 최대 하나.
export function objectiveSuggestion(keyResults, healthIndicators) {
  const outcomes = keyResults.filter(metric => metric.role === 'outcome');
  if (!keyResults.length) return healthIndicators.length ? 'KR이 없습니다. 이 기간에 움직일 결과·행동 지표 1~5개를 정하세요.' : null;
  if (keyResults.length > 5) return 'KR이 5개를 넘으면 초점이 흐려집니다. 이번 기간에 꼭 볼 것만 남기세요.';
  if (!outcomes.length) return '행동 KR만 있습니다. 결과 KR이 없으면 행동이 성과로 이어졌는지 알 수 없습니다.';
  return null;
}

// 목표 하나의 지표를 KR / 참고 지표 / KPI로 가른다.
export function splitObjectiveMetrics(metrics, objectiveId) {
  const own = metrics.filter(metric => metric.objectiveId === objectiveId && activeMetric(metric));
  return { keyResults: own.filter(isKeyResult), references: own.filter(isReferenceMetric), healthIndicators: own.filter(isHealthIndicator) };
}

// ── 월 KR을 주 단위로 쪼개기 (2026-09-30) ─────────────────────────────────────
// 저장소에는 기간 목표(target) 하나뿐이다. 주간 기준선은 저장하지 않고 기간 경과율로 계산한다.
//   · 기대 진행선 = 기준값 + (목표 − 기준값) × 기간 경과율
//   · 7일 페이스 = (목표 − 기준값) × 7 ÷ 기간 일수 (올림하지 않는다)
//   · 주별 균등 몫 = (목표 − 기준값) × 그 주의 기간 안 일수 ÷ 기간 일수
//   · 주별 관측 차이 = 그 주의 마지막 확인값 − 주 시작 전 마지막 확인값
//     첫 주만 등록된 기준값을 쓴다. 그 밖에 경계 관측이 없으면 미측정이다.
// 늘리기(increase) KR만 대상이다 — 줄이기·범위형은 "지금쯤 얼마"가 뜻을 갖지 않는다.

const mondayOf = key => { const n = dayNumber(key); return n - (((n + 3) % 7 + 7) % 7); };
const observationDay = (iso, objective) => dayNumber(new Intl.DateTimeFormat('en-CA', { timeZone: objective.timezone || 'Asia/Seoul' }).format(new Date(iso)));

export function keyResultPace(metric, objective, observations, todayKey) {
  if (metric?.direction !== 'increase' || !Number.isFinite(metric.target)) return null;
  if (!Number.isFinite(metric.baseline)) return null;
  const baseline = metric.baseline;
  const span = metric.target - baseline;
  if (!(span > 0)) return null;
  const period = objectivePeriod(objective, todayKey);
  if (period.phase === 'unknown' || period.phase === 'ended') return null;
  const totalDays = dayNumber(objective.periodEnd) - dayNumber(objective.periodStart) + 1;
  const perWeek = span * 7 / totalDays;
  const weeklyPace = perWeek >= 1 ? perWeek : null;
  const expected = baseline + span * period.elapsed;
  const measured = metric.measurement?.coverage === 'complete' && Number.isFinite(metric.measurement?.value);
  const actual = measured ? metric.measurement.value : null;
  const gap = actual === null ? null : actual - expected;
  const tolerance = span * 0.1;
  // 주 1건도 안 되는 KR(월 결제 1건 등)은 중간에 늦음을 판정하면 소음이다 — 마지막 주에만 판정한다.
  const tooEarly = weeklyPace === null && period.phase === 'running' && period.daysLeft >= 7;
  const state = gap === null || tooEarly ? 'unknown' : gap < -tolerance ? 'behind' : gap > tolerance ? 'ahead' : 'on';
  const week = weeklyCells(metric, objective, observations, todayKey).find(cell => cell.phase === 'now');
  const weekDone = actual !== null && metric.sourceKey === 'manual' ? week?.done ?? null : null;
  return { phase: period.phase, weeklyPace, weekQuota: week?.quota ?? null, expected, actual, gap, weekDone, state, target: metric.target };
}

const fmt = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
export const formatPaceNumber = fmt;

// 기준선보다 가장 크게 늦은 KR 하나를 골라 한 줄로. 늦은 게 없으면 null.
export function paceSuggestion(rows) {
  const behind = rows.filter(row => row.pace?.state === 'behind').sort((a, b) => a.pace.gap / a.pace.target - b.pace.gap / b.pace.target)[0];
  if (!behind) return null;
  const unit = behind.metric.unit ? behind.metric.unit : '';
  return `${behind.metric.name}이(가) 관측 기준으로 균등 페이스보다 ${fmt(Math.abs(behind.pace.gap))}${unit} 늦습니다. 이 KR의 다음 행동을 확인하세요.`;
}

// ── 목업 ①·③·④ 구현 (2026-10-01) ─────────────────────────────────────────────
const keyOfDay = n => new Date(n * DAY).toISOString().slice(0, 10);
const shortDay = key => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
const periodObservations = (metric, objective, observations, todayKey) => observations.filter(item => {
  if (!Number.isFinite(Date.parse(item.observedAt)) || item.metricId && metric.id && item.metricId !== metric.id) return false;
  if (item.periodStart && item.periodStart !== objective.periodStart || item.periodEnd && item.periodEnd !== objective.periodEnd) return false;
  const day = observationDay(item.observedAt, objective);
  return day >= dayNumber(objective.periodStart) && day <= Math.min(dayNumber(objective.periodEnd), dayNumber(todayKey));
}).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || '')));
const completeValue = row => row?.coverage === 'complete' && Number.isFinite(row.value) ? row.value : null;
const uncertainHistory = metric => ['observation-history-incomplete', 'invalid-observation-time'].includes(metric.measurement?.reason);

// 목표 기간을 월요일 시작 주로 나눈다. 첫 주·마지막 주는 기간 안 날짜만 담는다.
export function periodWeeks(objective, todayKey) {
  const start = dayNumber(objective.periodStart), end = dayNumber(objective.periodEnd), today = dayNumber(todayKey);
  if (![start, end].every(Number.isFinite) || end < start) return [];
  const weeks = [];
  for (let s = start; s <= end;) {
    const e = Math.min(end, mondayOf(keyOfDay(s)) + 6);
    const phase = !Number.isFinite(today) ? 'future' : today > e ? 'past' : today >= s ? 'now' : 'future';
    weeks.push({ start: keyOfDay(s), end: keyOfDay(e), days: e - s + 1, phase, label: e - s < 6 && s === start ? `${shortDay(keyOfDay(s))}–${Number(keyOfDay(e).slice(8, 10))}` : shortDay(keyOfDay(s)) });
    s = e + 1;
  }
  return weeks;
}

// 누적 관측값을 주별 몫으로 바꾼다. 확인된 관측이 하나도 없으면 몫을 모른다(null) — 0으로 세지 않는다.
function valueBefore(rows, objective, dayNum, fallback = null) {
  const before = rows.filter(item => observationDay(item.observedAt, objective) < dayNum).at(-1);
  return before ? completeValue(before) : fallback;
}

export function weeklyCells(metric, objective, observations, todayKey) {
  const weeks = periodWeeks(objective, todayKey);
  const baseline = Number.isFinite(metric?.baseline) ? metric.baseline : null;
  const span = metric?.direction === 'increase' && Number.isFinite(metric.target) && baseline !== null ? metric.target - baseline : null;
  if (!(span > 0) || !weeks.length) return [];
  const rows = periodObservations(metric, objective, observations, todayKey);
  const totalDays = weeks.reduce((sum, week) => sum + week.days, 0);
  const today = dayNumber(todayKey);
  let allocated = 0;
  return weeks.map((week, index) => {
    const quota = index === weeks.length - 1 ? span - allocated : span * week.days / totalDays;
    allocated += quota;
    if (metric.sourceKey !== 'manual' || uncertainHistory(metric) || week.phase === 'future') return { ...week, quota, done: null };
    const endDay = Math.min(dayNumber(week.end), today) + 1;
    const startDay = dayNumber(week.start);
    const checked = rows.filter(item => observationDay(item.observedAt, objective) >= startDay && observationDay(item.observedAt, objective) < endDay).at(-1);
    const value = completeValue(checked);
    const before = valueBefore(rows, objective, startDay, startDay === dayNumber(objective.periodStart) ? baseline : null);
    return { ...week, quota, done: value === null || before === null ? null : value - before };
  });
}

// 0 유지형(줄이기 · 목표 0) — 신규 개발 0, 회사 고객 대상 개인 판매 0 같은 "하지 않을 것".
export const isZeroKeep = metric => metric?.direction === 'decrease' && metric?.target === 0;

// 0 유지형의 주별 상태. 그 주에 확인한 관측이 있어야 판정한다(없으면 unknown).
export function zeroKeepWeeks(metric, objective, observations, todayKey) {
  const rows = periodObservations(metric, objective, observations, todayKey);
  const today = dayNumber(todayKey);
  const cells = periodWeeks(objective, todayKey).map(week => {
    if (week.phase === 'future') return { ...week, state: 'future' };
    const s = dayNumber(week.start), e = Math.min(dayNumber(week.end), today);
    const own = rows.filter(item => { const d = observationDay(item.observedAt, objective); return d >= s && d <= e; });
    if (metric.sourceKey && metric.sourceKey !== 'manual' || uncertainHistory(metric) || completeValue(own.at(-1)) === null) return { ...week, state: week.phase === 'now' ? 'pending' : 'unknown' };
    return { ...week, state: own.some(item => completeValue(item) > 0) ? 'broken' : 'kept' };
  });
  let streak = 0;
  for (const cell of [...cells].reverse()) {
    if (cell.state === 'future' || cell.state === 'pending') continue;
    if (cell.state !== 'kept') break;
    streak += 1;
  }
  return { cells, streak };
}

// 범위·문턱형 KPI의 불릿 차트 눈금. % 단위는 0~100 고정, 나머지는 선과 값을 모두 담도록 여백을 둔다.
export function bulletScale(metric, values = []) {
  const numbers = values.filter(Number.isFinite);
  const lineLo = metric.direction === 'range' ? metric.targetMin : metric.target;
  const lineHi = metric.direction === 'range' ? metric.targetMax : metric.target;
  if (!Number.isFinite(lineLo) || !Number.isFinite(lineHi)) return null;
  let min, max;
  if (metric.unit === '%') { min = Math.min(0, lineLo, lineHi, ...numbers); max = Math.max(100, lineLo, lineHi, ...numbers); }
  else {
    const lo = Math.min(lineLo, ...numbers), hi = Math.max(lineHi, ...numbers);
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.25;
    min = lo - pad; max = hi + pad;
    if (lo >= 0 && min < 0) min = 0;
  }
  const band = metric.direction === 'range' ? [lineLo, lineHi] : metric.direction === 'decrease' ? [min, lineHi] : [lineLo, max];
  const at = value => Number.isFinite(value) ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : null;
  return { min, max, band: [at(band[0]), at(band[1])], at };
}

// 목표에 연결한 할 일 중 기한이 있는 것 — 다음 하나와 최근에 끝낸 둘.
export function milestoneSummary(links, todayKey) {
  const today = dayNumber(todayKey);
  const rows = (links || []).filter(link => link.entityType === 'tasks' && !link.stale && link.dueAt && Number.isFinite(Date.parse(link.dueAt)))
    .map(link => { const dueKey = new Date(link.dueAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); return { ...link, dueKey, daysLeft: dayNumber(dueKey) - today, done: link.taskStatus === 'done' }; });
  const open = rows.filter(row => !row.done).sort((a, b) => a.dueKey.localeCompare(b.dueKey));
  const done = rows.filter(row => row.done).sort((a, b) => b.dueKey.localeCompare(a.dueKey));
  return { next: open[0] || null, openCount: open.length, done: done.slice(0, 2), total: rows.length };
}

// ── 월말 채점 ─────────────────────────────────────────────────────────────
// 바닥 달성 여부: reached · missed · unknown(미측정·일부 근거·마감 값 없음)
export function floorStatus(metric) {
  const state = metric?.progress?.state;
  if (state === 'achieved' || metric?.progress?.achieved === true) return 'reached';
  if (state === 'in_progress' && metric?.progress?.achieved === false) return 'missed';
  return 'unknown';
}

export const VERDICTS = {
  repeat: { title: '반복', text: '같은 오퍼를 반복하고 약속선을 올린다' },
  redefine: { title: '정의 점검', text: '운이 좋았거나 행동 KR이 틀렸다 — 행동 정의를 다시 본다' },
  'change-one': { title: '하나만 바꾸기', text: '활동은 충분했다. 오퍼 · 가격 · 고객군 중 하나만 바꾼다' },
  volume: { title: '실행량', text: '오퍼는 두고 시간 배분부터 고친다' },
};

// 2×2 판정 — 결과 KR과 선행 KR의 바닥 달성만 본다(개인 사업 OKR v3 §7을 지표 이름 없이 일반화).
export function objectiveVerdict(keyResults) {
  const outcomes = keyResults.filter(metric => metric.role === 'outcome');
  const drivers = keyResults.filter(metric => metric.role === 'driver');
  if (!outcomes.length || !drivers.length) return { key: null, reason: 'needs-both' };
  const unknown = [...outcomes, ...drivers].filter(metric => floorStatus(metric) === 'unknown').length;
  if (unknown) return { key: null, reason: 'unmeasured', unknown };
  const result = outcomes.every(metric => floorStatus(metric) === 'reached');
  const action = drivers.every(metric => floorStatus(metric) === 'reached');
  return { key: result ? (action ? 'repeat' : 'redefine') : (action ? 'change-one' : 'volume'), result, action };
}

// 다음 기간 초안 — 달 단위 목표면 다음 달 전체, 아니면 같은 길이. 제목의 "N월"만 바꾼다.
export function nextPeriodDraft(objective) {
  const start = dayNumber(objective.periodStart), end = dayNumber(objective.periodEnd);
  if (![start, end].every(Number.isFinite)) return null;
  const startKey = objective.periodStart, endKey = objective.periodEnd;
  const monthly = startKey.endsWith('-01') && keyOfDay(end + 1).endsWith('-01');
  let nextStart = keyOfDay(end + 1), nextEnd;
  if (monthly) {
    const [y, m] = nextStart.split('-').map(Number);
    nextEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  } else nextEnd = keyOfDay(end + 1 + (end - start));
  const nextMonth = Number(nextStart.slice(5, 7));
  const title = monthly ? objective.title.replace(/^(\s*)\d{1,2}월/, `$1${nextMonth}월`) : objective.title;
  return { title, periodStart: nextStart, periodEnd: nextEnd, monthly };
}

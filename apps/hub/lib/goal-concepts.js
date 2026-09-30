// OKR과 KPI를 같은 "지표"로 뭉개지 않기 위한 순수 규칙 (2026-09-29).
//
// 저장소는 목표(objective) 아래 지표(metric)의 role 셋(outcome·driver·guardrail)만 안다. 스키마를 바꾸지
// 않고 role로 개념을 가른다:
//   · KR(핵심 결과)  = outcome·driver + 약속선(target)이 있는 것 — 이 기간 안에 그 선까지 움직여야 한다.
//                      점수(0~1)로 읽고 기간이 끝나면 닫힌다.
//   · 참고 지표      = outcome·driver인데 약속선이 없는 것 — "기록만" 하는 값. 목표가 없으니 KR이 아니고 점수도 없다.
//   · KPI(건강 지표) = guardrail     — 기간과 상관없이 계속 지켜볼 선. 점수가 아니라 "선 안/선 밖"과 추이로 읽는다.
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
  if (!progress) return null;
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
const dayNumber = key => Date.parse(`${key}T00:00:00Z`) / DAY;

// 기간 경과율(0~1)과 남은 일수. 시작일·종료일을 모두 포함한다.
export function objectivePeriod(objective, todayKey) {
  const start = dayNumber(objective.periodStart), end = dayNumber(objective.periodEnd), today = dayNumber(todayKey);
  if (![start, end, today].every(Number.isFinite)) return { phase: 'unknown', elapsed: null, daysLeft: null };
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
  const state = metric?.progress?.state;
  if (state === 'achieved' || metric?.progress?.achieved === true) return 'inside';
  if (state === 'in_progress' && metric?.progress?.achieved === false) return 'outside';
  if (state === 'partial') return 'partial';
  if (state === 'target_unset') return 'unset';
  return 'unmeasured';
}

export const KPI_HEALTH_LABEL = { inside: '선 안', outside: '선 밖', partial: '일부 근거', unmeasured: '미측정', unset: '선 미설정' };
const HEALTH_ORDER = { outside: 0, unmeasured: 1, partial: 2, unset: 3, inside: 4 };

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
//   · 주간 페이스 = (목표 − 기준값) ÷ 기간의 주 수  (1 미만이면 "기간 안 N"으로만 말한다)
//   · 이번 주 몫 = 지금 값 − 이번 주 월요일 이전 마지막 확인 관측값(없으면 기준값)
// 늘리기(increase) KR만 대상이다 — 줄이기·범위형은 "지금쯤 얼마"가 뜻을 갖지 않는다.

const mondayOf = key => { const n = dayNumber(key); return n - ((n + 3) % 7); };
const seoulDayNumber = iso => dayNumber(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));

export function keyResultPace(metric, objective, observations, todayKey) {
  if (metric?.direction !== 'increase' || !Number.isFinite(metric.target)) return null;
  const baseline = Number.isFinite(metric.baseline) ? metric.baseline : 0;
  const span = metric.target - baseline;
  if (!(span > 0)) return null;
  const period = objectivePeriod(objective, todayKey);
  if (period.phase === 'unknown' || period.phase === 'ended') return null;
  const weeks = (dayNumber(objective.periodEnd) - dayNumber(objective.periodStart) + 1) / 7;
  const perWeek = span / weeks;
  const weeklyPace = perWeek >= 1 ? Math.ceil(perWeek - 1e-9) : null;
  const expected = baseline + span * period.elapsed;
  const measured = metric.measurement?.coverage === 'complete' && Number.isFinite(metric.measurement?.value);
  const actual = measured ? metric.measurement.value : null;
  const gap = actual === null ? null : actual - expected;
  const tolerance = span * 0.1;
  // 주 1건도 안 되는 KR(월 결제 1건 등)은 중간에 늦음을 판정하면 소음이다 — 마지막 주에만 판정한다.
  const tooEarly = weeklyPace === null && period.phase === 'running' && period.daysLeft >= 7;
  const state = gap === null || tooEarly ? 'unknown' : gap < -tolerance ? 'behind' : gap > tolerance ? 'ahead' : 'on';
  let weekDone = null;
  if (actual !== null && period.phase === 'running') {
    const monday = mondayOf(todayKey);
    const before = observations
      .filter(item => item.coverage === 'complete' && Number.isFinite(item.value) && Number.isFinite(Date.parse(item.observedAt)) && seoulDayNumber(item.observedAt) < monday)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    weekDone = Math.max(0, actual - (before ? before.value : baseline));
  }
  return { phase: period.phase, weeklyPace, expected, actual, gap, weekDone, state, target: metric.target };
}

const fmt = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
export const formatPaceNumber = fmt;

// 기준선보다 가장 크게 늦은 KR 하나를 골라 한 줄로. 늦은 게 없으면 null.
export function paceSuggestion(rows) {
  const behind = rows.filter(row => row.pace?.state === 'behind').sort((a, b) => a.pace.gap / a.pace.target - b.pace.gap / b.pace.target)[0];
  if (!behind) return null;
  const unit = behind.metric.unit ? behind.metric.unit : '';
  return `${behind.metric.name}이(가) 기준선보다 ${fmt(Math.abs(behind.pace.gap))}${unit} 늦습니다. 이번 주 첫 판매 시간을 이 KR에 쓰세요.`;
}

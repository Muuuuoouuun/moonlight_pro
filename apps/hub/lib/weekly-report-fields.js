import { isCalendarDateKey, shiftDateKey } from './rhythm-calendar.js';

// 주간 리포트의 표시 계약 — 첫 화면 카드, 목표·성과의 주간 실측, Council 요약, Office 누락 라벨이
// 같은 필드 이름과 순서를 쓴다. 값은 repositories/weekly-report.js가 만들고 여기서는 읽기만 한다.
// null은 미측정이고 0과 다르다(카드의 "‘—’는 0이 아닌 미측정" 약속).
export const WEEKLY_STAT_FIELDS = {
  personal: [
    // 오늘 3개(Action KPI, 2026-09-20 §7.2) — 완료/선택. 고른 날이 없으면 측정된 0이다.
    { key: 'focus', label: '오늘 3개', unit: '개' },
    { key: 'doneTasks', label: '완료 할 일', unit: '건' },
    { key: 'contacts', label: '연락', unit: '건' },
    { key: 'memos', label: '메모', unit: '건' },
    { key: 'reviewDays', label: '리뷰 일수', unit: '일' },
    { key: 'publishes', label: '발행', unit: '건' },
    { key: 'personalDeals', label: '개인 딜', unit: '건' },
  ],
  company: [
    { key: 'contacts', label: '연락', unit: '건' },
    { key: 'newDeals', label: '신규 딜', unit: '건' },
    // 이동 딜 = 기간 중 기록된 단계 이동 수(crm_activities kind='deal'), 수정된 진행 딜과 다른 질문이다.
    { key: 'movedDeals', label: '이동 딜', unit: '건' },
    { key: 'modifiedOpenDeals', label: '수정된 진행 딜', unit: '건' },
    { key: 'wonDeals', label: '성사일 확인된 딜', unit: '건' },
  ],
};

const finite = value => typeof value === 'number' && Number.isFinite(value);

export function weeklyStatValue(field, stats) {
  const none = { text: null, rate: null, value: null };
  if (!field || !stats || typeof stats !== 'object') return none;
  if (field.key === 'focus') {
    if (!finite(stats.focusPicked)) return none;
    if (stats.focusPicked === 0) return { text: '0', rate: null, value: 0 };
    if (!finite(stats.focusDone)) return none;
    return { text: `${stats.focusDone}/${stats.focusPicked}`, rate: finite(stats.focusRate) ? stats.focusRate : null, value: stats.focusDone };
  }
  return finite(stats[field.key]) ? { text: String(stats[field.key]), rate: null, value: stats[field.key] } : none;
}

// failedSources 키(weekly-report.js)를 운영자가 읽는 이름으로. 모르는 키는 숨기지 않고 그대로 둔다.
export const WEEKLY_SOURCE_LABELS = {
  tasks_completed: '완료 할 일',
  contacts_recorded: '고객 연락',
  content_published: '발행',
  reviews_completed: '하루 리뷰',
  'tasks:focus': '오늘 3개',
  'journal_entries:note': '메모',
  'crm_activities:deal': '딜 단계 이동',
  deals: '딜 기록',
  'deal-win-timestamps': '성사일',
  goals: '목표·성과',
};

export function weeklySourceLabels(failedSources) {
  if (!Array.isArray(failedSources)) return [];
  return [...new Set(failedSources.filter(key => typeof key === 'string').map(key => WEEKLY_SOURCE_LABELS[key] || key))];
}

// 주간 실측의 비교 창 — 리포트 요일(Q119: 월요일 개인, 목요일 회사)에 맞춘 7일이다. 그래서 각
// 완료된 주는 그 요일 아침 카드가 보여준 창과 같다. 이번 주는 완료된 날이 하루라도 있을 때만
// 진행 중으로 붙인다(오늘은 아직 끝나지 않았으므로 세지 않는다).
const WEEK_START_DAY = { personal: 1, company: 4 };
const MAX_WEEKS = 8;

export function weeklyPeriods({ scope, today, count = 4 } = {}) {
  const startDay = WEEK_START_DAY[scope];
  if (startDay === undefined || !isCalendarDateKey(today) || !Number.isInteger(count) || count < 1) return [];
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const currentStart = shiftDateKey(today, -((weekday - startDay + 7) % 7));
  const rows = [];
  if (currentStart < today) {
    const periodEnd = shiftDateKey(today, -1);
    rows.push({ periodStart: currentStart, periodEnd, current: true, days: (Date.parse(periodEnd) - Date.parse(currentStart)) / 86400000 + 1 });
  }
  for (let week = 1; week <= Math.min(count, MAX_WEEKS); week += 1) {
    rows.push({ periodStart: shiftDateKey(currentStart, -7 * week), periodEnd: shiftDateKey(currentStart, -7 * week + 6), current: false, days: 7 });
  }
  return rows;
}

// GET /api/hub/weekly-report 쿼리. 기간을 주면 둘 다 날짜여야 한다 — 반쪽 기간을 기본 주로 바꿔
// 답하면 요청한 주와 다른 주의 숫자가 그 주의 실측처럼 보인다. 완료된 날인지·31일 이내인지는
// getWeeklyReport가 판정한다.
export function weeklyReportQuery(params) {
  const scope = params.get('scope') === 'company' ? 'company' : 'personal';
  const includeGoals = params.get('goals') !== '0';
  const periodStart = params.get('periodStart');
  const periodEnd = params.get('periodEnd');
  if (periodStart === null && periodEnd === null) return { scope, includeGoals };
  if (!isCalendarDateKey(periodStart) || !isCalendarDateKey(periodEnd)) return { error: 'invalid-weekly-period' };
  return { scope, periodStart, periodEnd, includeGoals };
}

// 주간 실측 표 모델 — 열은 주, 행은 필드. 주마다 따로 읽으므로 한 주의 실패·일부 미측정은 그 열에만
// 남고, 읽지 못한 칸은 숫자 대신 null이다(0으로 채우지 않는다). 전체 상태는 모든 주가 실패해야 error.
const DEFINITION_KEY = { focus: 'focusRate' };

function columnState(report) {
  if (!report) return 'loading';
  if (report.status === 'error' || report.source === 'error' || (report.status !== 'preview' && !report.stats)) return 'error';
  if (report.status === 'preview') return 'preview';
  return report.partial || report.status === 'partial' ? 'partial' : 'live';
}

export function weeklyActualsModel({ scope, periods = [], reports = [] } = {}) {
  const fields = WEEKLY_STAT_FIELDS[scope === 'company' ? 'company' : 'personal'];
  const columns = periods.map((period, index) => {
    const report = reports[index];
    const state = columnState(report);
    return { ...period, state, missing: state === 'partial' ? weeklySourceLabels(report.failedSources) : [], stats: ['live', 'partial'].includes(state) ? report.stats : null };
  });
  const definitions = reports.find(report => report?.definitions && typeof report.definitions === 'object')?.definitions || {};
  const rows = fields.map(field => ({
    key: field.key, label: field.label, unit: field.unit,
    definition: typeof definitions[DEFINITION_KEY[field.key] || field.key] === 'string' ? definitions[DEFINITION_KEY[field.key] || field.key] : null,
    cells: columns.map(column => weeklyStatValue(field, column.stats)),
  }));
  const states = columns.map(column => column.state);
  const state = !states.length ? 'error'
    : states.includes('loading') ? 'loading'
    : states.every(value => value === 'error') ? 'error'
    : states.every(value => value === 'preview') ? 'preview'
    : states.every(value => value === 'live') ? 'live' : 'partial';
  const missingGroups = [];
  for (const column of columns) {
    if (!column.missing.length) continue;
    const key = column.missing.join('\u0000');
    const group = missingGroups.find(entry => entry.labels.join('\u0000') === key);
    if (group) group.periods.push([column.periodStart, column.periodEnd]);
    else missingGroups.push({ labels: column.missing, periods: [[column.periodStart, column.periodEnd]] });
  }
  return { state, columns: columns.map(({ stats, ...column }) => column), rows, missingGroups };
}

// Office 주간 정리의 "자료 누락" 줄 — 같은 키를 "… 미측정"으로 읽는다.
export const WEEKLY_MISSING_LABELS = Object.fromEntries(Object.entries(WEEKLY_SOURCE_LABELS).map(([key, label]) => [key, `${label} 미측정`]));

// 확인할 것 — 목록에서 빠지는 조건(확인할 것 스펙 §4.4). 순수 함수.
//
// 원칙: 조용히 사라지는 길은 없다. 숨기는 것은 (1) 대상 쪽 보류, (2) 영수증의 보류, (3) 아직 열려 있는
// 연결 할 일, (4) 아직 시작 전인 잡아 둔 일뿐이다. 그 밖(연락 기록·날짜 다시·막힘 풀기·원고 진행)은
// 대상 기록이 바뀌어 규칙이 신호를 만들지 않는 것이 곧 사라짐이다. 모르는 것은 숨기지 않는다 —
// 할 일 상태를 읽지 못했으면 그 할 일은 열려 있다고 가정하지 않는다(카드가 남는 쪽이 안전하다).

import { CRM_SUBJECT_TYPES } from './catalog.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function activeRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && !row.undone_at && row.signal_key);
}

function latestByKey(rows) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.signal_key);
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) map.set(row.signal_key, row);
  }
  return map;
}

// 보류 경계는 넛지와 같다(lib/sales-os/crm-nudges.js `snoozedUntil > todayKey`): 저장값은 다시 볼 날이고
// 그날부터 다시 뜬다.
export function isSnoozedThrough(until, todayKey) {
  return DATE_ONLY.test(String(until || '')) && DATE_ONLY.test(String(todayKey || '')) && String(until) > String(todayKey);
}

/**
 * @param {Array} items     toCheckItem()을 거친 카드들(signalKey·subject 포함)
 * @param {object} context
 *   outcomes        signal_outcomes 행(최근 창) — undone_at이 있는 행은 무시한다
 *   nudgesBySubject Map("deal:<id>" → meta.nudges) — 고객·거래·리드 보류의 정본
 *   openTaskIds     Set — 읽어서 **열려 있다고 확인된** 할 일 id만
 *   todayKey        'YYYY-MM-DD'(KST)
 *   now             ms
 * @returns {{ visible: Array, suppressed: Array<{signalKey, reason}> }}
 */
export function applyCheckItemOutcomes(items, { outcomes = [], nudgesBySubject = new Map(), openTaskIds = new Set(), todayKey, now = Date.now() } = {}) {
  const rows = activeRows(outcomes);
  const byKey = new Map();
  for (const row of rows) {
    if (!byKey.has(row.signal_key)) byKey.set(row.signal_key, []);
    byKey.get(row.signal_key).push(row);
  }
  const latest = latestByKey(rows);
  const visible = [];
  const suppressed = [];

  for (const item of Array.isArray(items) ? items : []) {
    const key = item?.signalKey;
    if (!key) { visible.push(item); continue; }
    const keyRows = byKey.get(key) || [];
    const subject = item.subject || {};

    // (1) 대상 쪽 보류 — 넛지와 같은 저장.
    if (CRM_SUBJECT_TYPES.has(subject.type)) {
      const nudges = nudgesBySubject.get(`${subject.type}:${subject.id}`);
      if (isSnoozedThrough(nudges?.snoozedUntil, todayKey)) { suppressed.push({ signalKey: key, reason: 'snoozed' }); continue; }
    }

    // (2) 영수증의 보류.
    if (keyRows.some((row) => row.outcome === 'snoozed' && isSnoozedThrough(row.snoozed_until, todayKey))) {
      suppressed.push({ signalKey: key, reason: 'snoozed' });
      continue;
    }

    // (3) 연결 할 일이 열려 있음.
    const openTask = keyRows.find((row) => row.outcome === 'task_created' && row.record_ref?.table === 'tasks' && openTaskIds.has(row.record_ref.id));
    if (openTask) { suppressed.push({ signalKey: key, reason: 'task-open' }); continue; }

    // (4) 잡아 둔 일 — 시작 전이면 숨기고, 시작 뒤에는 표시를 단다.
    const schedule = keyRows
      .filter((row) => row.outcome === 'scheduled' && Number.isFinite(Date.parse(row.scheduled_start)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (schedule && Date.parse(schedule.scheduled_start) > now) { suppressed.push({ signalKey: key, reason: 'scheduled' }); continue; }

    const decorated = { ...item };
    if (schedule) {
      const end = Date.parse(schedule.scheduled_end);
      decorated.scheduled = {
        start: new Date(schedule.scheduled_start).toISOString(),
        end: Number.isFinite(end) ? new Date(end).toISOString() : null,
        state: Number.isFinite(end) && end < now ? 'passed' : 'now',
      };
    }
    const last = latest.get(key);
    if (last?.outcome === 'snoozed' && DATE_ONLY.test(String(last.snoozed_until || '')) && !isSnoozedThrough(last.snoozed_until, todayKey)) {
      decorated.returnedFromSnooze = { since: String(last.created_at || ''), until: last.snoozed_until };
    }
    visible.push(decorated);
  }

  return { visible, suppressed };
}

// 카드 차례(스펙 §7.1): 잡아 둔 시간이 된 카드 → 보류에서 돌아온 카드 → 긴급 → 나머지(들어온 순서).
export function orderCheckItems(items) {
  const rank = (item) => (item.scheduled ? 0 : item.returnedFromSnooze ? 1 : item.tone === 'danger' ? 2 : 3);
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

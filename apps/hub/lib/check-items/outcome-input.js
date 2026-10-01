// 확인할 것 — 끝내기 영수증 입력 검증(확인할 것 스펙 §8.2). 순수 함수: 저장 모양만 만든다.

import { OUTCOME_KINDS, SUBJECT_TYPES } from './catalog.js';
import { isCanonicalUuid } from '../uuid.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const SIGNAL_KEY = /^[a-z-]+:[^\s]{1,180}$/;
const RECORD_TABLES = new Set(['tasks', 'crm_activities', 'deals', 'leads', 'customer_accounts', 'decisions', 'projects', 'calendar']);
// 보류 최대 기간 — Q-CF1(2026-10-01 기본값 승인).
export const MAX_SNOOZE_DAYS = 30;

function dayDiff(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * @returns {{ ok: true, row: object } | { ok: false, reason: string }}
 */
export function buildSignalOutcomeWrite(input = {}, { todayKey } = {}) {
  const requestId = String(input.requestId || '');
  if (!isCanonicalUuid(requestId)) return { ok: false, reason: 'invalid-request-id' };

  const signalKey = String(input.signalKey || '').trim();
  if (!SIGNAL_KEY.test(signalKey)) return { ok: false, reason: 'invalid-signal-key' };

  const subjectType = String(input.subject?.type || '');
  if (!SUBJECT_TYPES.includes(subjectType)) return { ok: false, reason: 'invalid-subject' };
  const subjectId = input.subject?.id == null ? null : text(String(input.subject.id), 200) || null;

  const outcome = String(input.outcome || '');
  if (!OUTCOME_KINDS.includes(outcome)) return { ok: false, reason: 'invalid-outcome' };

  let recordRef = null;
  if (input.recordRef != null) {
    const table = String(input.recordRef.table || '');
    const id = input.recordRef.id == null ? null : text(String(input.recordRef.id), 200);
    if (!RECORD_TABLES.has(table)) return { ok: false, reason: 'invalid-record-ref' };
    recordRef = id ? { table, id } : { table };
  }
  // 할 일 영수증은 할 일 id가 있어야 억제(§4.4 규칙 3)가 그 할 일을 찾는다.
  if (outcome === 'task_created' && !(recordRef?.table === 'tasks' && isCanonicalUuid(recordRef.id))) {
    return { ok: false, reason: 'missing-task-ref' };
  }

  let snoozedUntil = null;
  if (outcome === 'snoozed') {
    snoozedUntil = String(input.snoozedUntil || '');
    if (!DATE_ONLY.test(snoozedUntil)) return { ok: false, reason: 'invalid-snoozed-until' };
    if (todayKey) {
      const days = dayDiff(todayKey, snoozedUntil);
      if (!(days >= 1)) return { ok: false, reason: 'snooze-not-future' };
      if (days > MAX_SNOOZE_DAYS) return { ok: false, reason: 'snooze-too-far' };
    }
  } else if (input.snoozedUntil != null && input.snoozedUntil !== '') {
    return { ok: false, reason: 'unexpected-snoozed-until' };
  }

  let scheduledStart = null;
  let scheduledEnd = null;
  if (outcome === 'scheduled') {
    const start = Date.parse(input.scheduledStart);
    const end = input.scheduledEnd == null ? NaN : Date.parse(input.scheduledEnd);
    if (!Number.isFinite(start)) return { ok: false, reason: 'invalid-scheduled-start' };
    if (input.scheduledEnd != null && !(Number.isFinite(end) && end > start)) return { ok: false, reason: 'invalid-scheduled-end' };
    scheduledStart = new Date(start).toISOString();
    scheduledEnd = Number.isFinite(end) ? new Date(end).toISOString() : null;
  }

  const calendarEventId = outcome === 'scheduled' ? text(input.calendarEventId, 300) || null : null;

  return {
    ok: true,
    row: {
      request_id: requestId.toLowerCase(),
      signal_key: signalKey,
      subject_type: subjectType,
      subject_id: subjectId,
      title: text(input.title, 300),
      outcome,
      record_ref: recordRef,
      snoozed_until: snoozedUntil,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      calendar_event_id: calendarEventId,
      note: text(input.note, 200),
    },
  };
}

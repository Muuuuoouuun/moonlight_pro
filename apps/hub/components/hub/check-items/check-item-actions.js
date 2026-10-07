// 확인할 것 — 카드의 끝내기 저장(확인할 것 스펙 §4). React 없음 — fetch를 주입받아 테스트한다.
//
// 모든 함수는 { ok, status, message, ... } 봉투를 돌려준다. ok는 서버가 saved/duplicate로 답했을 때만
// true다(DESIGN.md §8.1 Save envelope). preview는 저장되지 않았다는 뜻이라 끝낸 것으로 세지 않는다.

import { isCanonicalUuid } from '@/lib/uuid';
import { kstDayKey } from '@/lib/kst-day';
import { scheduleTitleFor } from '@/lib/check-items/catalog';

import { sendCheckWrite as send, taskAcknowledges, sameInstant, sameJson } from '@/lib/check-write-ack';
import { buildSignalOutcomeWrite } from '@/lib/check-items/outcome-input';

export function newRequestId() { return globalThis.crypto.randomUUID(); }

export const CHECK_CALENDAR_BLOCKED = '확인할 것의 구글 일정 생성은 중복 방지 검증 전까지 중단했습니다. Moonlight에만 시간을 잡을 수 있습니다.';

function receiptAcknowledges(receipt, body) {
  const checked = buildSignalOutcomeWrite(body);
  if (!checked.ok) return false;
  const r = checked.row;
  return isCanonicalUuid(receipt?.workspaceId) && !receipt?.undoneAt && receipt?.id === r.request_id && receipt.requestId === r.request_id
    && (!body.expectedWorkspaceId || receipt.workspaceId === body.expectedWorkspaceId)
    && receipt.signalKey === r.signal_key && sameJson(receipt.subject, { type: r.subject_type, id: r.subject_id })
    && receipt.title === r.title && receipt.outcome === r.outcome && sameJson(receipt.recordRef || null, r.record_ref)
    && (receipt.snoozedUntil || null) === r.snoozed_until && (receipt.note || '') === r.note
    && sameInstant(r.scheduled_start, receipt.scheduledStart) && sameInstant(r.scheduled_end, receipt.scheduledEnd)
    && (receipt.calendarEventId || null) === r.calendar_event_id;
}

function failure(status, fallback) {
  if (status === 'preview') return '저장소 연결이 필요합니다 — 저장되지 않아 끝낸 것으로 세지 않았습니다.';
  if (status === 'conflict') return '다른 곳에서 먼저 바뀌었습니다. 대상을 열어 확인해 주세요.';
  if (status === 'invalid-input') return '입력을 확인해 주세요.';
  if (status === 'unknown') return '저장 여부를 확인하지 못했습니다. 입력과 요청 ID를 유지하고 같은 요청으로 다시 확인하세요.';
  return fallback;
}

/** 영수증 한 줄. item은 toCheckItem() 카드. */
export async function postReceipt(fetchImpl, item, { outcome, recordRef = null, snoozedUntil = null, scheduledStart = null, scheduledEnd = null, calendarEventId = null, note = '', requestId, context = null } = {}) {
  const body = {
    requestId,
    ...(context ? { expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey } : {}),
    signalKey: item.signalKey,
    subject: { type: item.subject?.type, id: item.subject?.type === 'lead-group' ? null : item.subject?.id ?? null },
    title: item.subject?.name || item.title || '',
    outcome,
    recordRef,
    ...(snoozedUntil ? { snoozedUntil } : {}),
    ...(scheduledStart ? { scheduledStart, scheduledEnd, calendarEventId } : {}),
    note,
  };
  const checked = buildSignalOutcomeWrite(body);
  if (!checked.ok) return { ok: false, status: 'invalid-input', requestId, receipt: null, message: '같은 요청 ID와 입력을 확인해 주세요.' };
  const result = await send(fetchImpl, '/api/hub/signal-outcomes', 'POST', body, (data, submitted) => receiptAcknowledges(data.receipt, submitted));
  return {
    ok: result.ok,
    status: result.status,
    requestId,
    receipt: result.data?.receipt || null,
    message: result.ok ? '' : failure(result.status, '끝낸 기록을 남기지 못했습니다.'),
  };
}

/** 할 일로 만들기 — 할 일 id를 미리 만들어 재시도해도 두 개가 생기지 않게 한다(Engine 멱등 경로). */
export async function createTaskForItem(fetchImpl, item, { title, dueAt = '', taskId = newRequestId(), context = null } = {}) {
  const subject = item.subject || {};
  const body = {
    id: taskId,
    ...(context ? { expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey } : {}),
    title: String(title || item.taskTitle || item.title || '').trim(),
    source: 'check-items',
    ...(dueAt ? { dueAt } : {}),
    ...(subject.type === 'deal' ? { dealId: subject.id } : {}),
    ...(subject.type === 'project' ? { projectId: subject.id } : {}),
  };
  if (!body.title) return { ok: false, status: 'invalid-input', taskId, message: '할 일 제목을 적어 주세요.' };
  const result = await send(fetchImpl, '/api/hub/tasks', 'POST', body, (data, submitted) => taskAcknowledges(data.task, submitted));
  return {
    ok: result.ok,
    status: result.status,
    taskId,
    message: result.ok ? '' : failure(result.status, '할 일을 만들지 못했습니다.'),
  };
}

/** 날짜 다시 — 고객·거래·리드만(기존 오늘 연락 경로). */
export async function rescheduleItem(fetchImpl, item, { at } = {}) {
  const { type, id } = item.subject || {};
  if (!['deal', 'lead', 'account'].includes(type)) return { ok: false, status: 'invalid-input', message: '이 항목은 날짜를 다시 정할 수 없습니다.' };
  const result = await send(fetchImpl, '/api/hub/followups', 'POST', { action: 'reschedule', kind: type, id, at }, data => data.id === id && data.at === at && data.record?.id === id);
  return { ok: result.ok, status: result.status, message: result.ok ? '' : failure(result.status, '다음 연락일을 저장하지 못했습니다.') };
}

/** 고객·거래·리드의 보류는 대상 meta.nudges가 정본이다(넛지와 같은 저장, §4.3). */
export async function snoozeSubject(fetchImpl, item, { until } = {}) {
  const { type, id } = item.subject || {};
  if (!['deal', 'lead', 'account'].includes(type)) return { ok: true, status: 'skipped' };
  const result = await send(fetchImpl, '/api/hub/crm-nudges', 'POST', { subjectType: type, subjectId: id, action: 'snooze', until }, data => data.id === id && data.record?.id === id && data.record.meta?.nudges?.snoozedUntil === until);
  return { ok: result.ok, status: result.status, message: result.ok ? '' : failure(result.status, '보류를 저장하지 못했습니다.') };
}

export async function undoReceipt(fetchImpl, receipt) {
  const result = await send(fetchImpl, '/api/hub/signal-outcomes', 'PATCH', { id: receipt.id, action: 'undo' }, data => data.receipt?.id === receipt.id && data.receipt?.outcome === receipt.outcome && data.receipt?.undoneAt != null);
  if (!result.ok) return { ok: false, status: result.status, message: failure(result.status, '되돌리지 못했습니다.') };
  const { type, id } = receipt.subject || {};
  if (receipt.outcome === 'snoozed' && ['deal', 'lead', 'account'].includes(type)) {
    const resumed = await send(fetchImpl, '/api/hub/crm-nudges', 'POST', { subjectType: type, subjectId: id, action: 'resume' }, data => data.id === id && data.record?.id === id && !data.record.meta?.nudges?.snoozedUntil);
    if (!resumed.ok) return { ok: false, status: resumed.status, message: '영수증은 되돌렸지만 보류는 아직 걸려 있습니다. 다시 시도해 주세요.' };
  }
  return { ok: true, status: 'saved', message: '' };
}

// ── 시간 잡기(§4.7) ─────────────────────────────────────────────
// Provider creation needs a durable stable provider ID before it can be re-enabled.
// No compensation DELETE follows an uncertain receipt acknowledgement.
async function deleteCalendarBlock(fetchImpl, eventId) {
  if (!eventId) return { ok: true, status: 'skipped' };
  const result = await send(fetchImpl, '/api/calendar/google/event', 'DELETE', { eventId }, data => data.eventId === eventId);
  return { ok: result.ok, status: result.status };
}

export async function scheduleItem(fetchImpl, item, { slot, addToCalendar = false, requestId, context = null } = {}) {
  if (!slot?.start || !slot?.end) return { ok: false, status: 'invalid-input', message: '시간을 골라 주세요.' };
  if (addToCalendar) return { ok: false, status: 'blocked', calendarFailed: true, message: CHECK_CALENDAR_BLOCKED };
  const receipt = await postReceipt(fetchImpl, item, {
    requestId, context, outcome: 'scheduled', scheduledStart: slot.start, scheduledEnd: slot.end, calendarEventId: null,
  });
  return { ...receipt, eventId: null };
}

/** 잡아 둔 일 취소 — 영수증을 되돌리고 구글 일정을 지운다. */
export async function cancelScheduled(fetchImpl, block) {
  const undone = await send(fetchImpl, '/api/hub/signal-outcomes', 'PATCH', { id: block.id, action: 'undo' }, data => data.receipt?.id === block.id && data.receipt?.outcome === 'scheduled' && data.receipt?.undoneAt != null);
  if (!undone.ok) return { ok: false, status: undone.status, message: failure(undone.status, '취소하지 못했습니다.') };
  const removed = await deleteCalendarBlock(fetchImpl, block.calendarEventId);
  if (!removed.ok) return { ok: true, status: 'saved', message: 'Moonlight 취소는 확인했습니다. 구글 일정의 삭제 여부는 확인하지 못해 캘린더에서 확인이 필요합니다.' };
  return { ok: true, status: 'saved', message: '' };
}

/**
 * 잡아 둔 일의 다른 시간 — 같은 행을 고치고(정본), 구글 일정이 있으면 같은 eventId로 갱신한다.
 * 갱신이 실패하면 "Moonlight에서는 옮겼고 구글 일정은 그대로"라고 말한다(취소와 같은 순서·같은 말투).
 */
export async function moveScheduled(fetchImpl, block, { slot } = {}) {
  if (!slot?.start || !slot?.end) return { ok: false, status: 'invalid-input', message: '시간을 골라 주세요.' };
  const moved = await send(fetchImpl, '/api/hub/signal-outcomes', 'PATCH', { id: block.id, action: 'move', scheduledStart: slot.start, scheduledEnd: slot.end }, data => data.receipt?.id === block.id && data.receipt?.outcome === 'scheduled' && sameInstant(slot.start, data.receipt.scheduledStart) && sameInstant(slot.end, data.receipt.scheduledEnd));
  if (!moved.ok) return { ok: false, status: moved.status, message: failure(moved.status, '시간을 옮기지 못했습니다.') };
  if (!block.calendarEventId) return { ok: true, status: 'saved', message: '' };
  const updated = await send(fetchImpl, '/api/calendar/google/event', 'POST', {
    eventId: block.calendarEventId,
    title: scheduleTitleFor(block.subject?.type, block.title),
    startAt: slot.start,
    endAt: slot.end,
    description: 'Moonlight 확인할 것에서 잡은 시간',
    timeZone: 'Asia/Seoul',
  });
  // 갱신 경로는 status "updated"로 답한다 — 저장 봉투의 saved와 같은 뜻.
  const calendarOk = updated.status === 'updated' && updated.data?.event?.id === block.calendarEventId && sameInstant(slot.start, updated.data.event.start?.dateTime) && sameInstant(slot.end, updated.data.event.end?.dateTime);
  return { ok: true, status: 'saved', message: calendarOk ? '' : 'Moonlight 시간 변경은 확인했습니다. 구글 반영 여부는 확인하지 못해 캘린더에서 확인이 필요합니다.' };
}

// 고른 소요 시간은 종류별로 이 기기에 기억한다(§4.7, 편의 설정 — 사라져도 기본값으로 돌아갈 뿐).
const MINUTES_KEY = 'mlp.checkScheduleMinutes';
export function rememberedMinutes(subjectType, fallback) {
  try {
    const map = JSON.parse(globalThis.localStorage?.getItem(MINUTES_KEY) || '{}');
    const value = Number(map?.[subjectType]);
    return [15, 30, 45, 60].includes(value) ? value : fallback;
  } catch {
    if (status === 'unknown') return '저장 여부를 확인하지 못했습니다. 입력과 요청 ID를 유지하고 같은 요청으로 다시 확인하세요.';
  return fallback;
  }
}
export function rememberMinutes(subjectType, minutes) {
  try {
    const map = JSON.parse(globalThis.localStorage?.getItem(MINUTES_KEY) || '{}');
    globalThis.localStorage?.setItem(MINUTES_KEY, JSON.stringify({ ...map, [subjectType]: minutes }));
  } catch { /* 저장 불가 환경 — 기본값으로 돈다 */ }
}

function addDays(dayKey, days) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
export function formatDayLabel(dayKey) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${WEEKDAY[date.getUTCDay()]}`;
}

/** 보류 선택지 — 내일 · 모레 · 다음 주 월요일(§4.3). 날짜 고르기는 화면이 따로 준다. */
export function snoozePresets(now = Date.now()) {
  const today = kstDayKey(new Date(now));
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const toMonday = ((8 - weekday) % 7) || 7;
  const presets = [
    { key: 'tomorrow', label: '내일', until: addDays(today, 1) },
    { key: 'day-after', label: '모레', until: addDays(today, 2) },
    { key: 'next-monday', label: '다음 주 월요일', until: addDays(today, toMonday) },
  ];
  const seen = new Set();
  return presets.filter((preset) => (seen.has(preset.until) ? false : seen.add(preset.until)))
    .map((preset) => ({ ...preset, sub: formatDayLabel(preset.until) }));
}

export function todayKey(now = Date.now()) {
  return kstDayKey(new Date(now));
}

export function dayAfter(dayKey, days) {
  return addDays(dayKey, days);
}

/** 오늘 끝낸 것 한 줄의 "남긴 기록" 문구. */
export function receiptLine(receipt) {
  switch (receipt?.outcome) {
    case 'contact_logged': return '연락 기록 1건';
    case 'task_created': return '할 일 1건을 만들었습니다';
    case 'rescheduled': return '다음 연락일을 다시 정했습니다';
    case 'snoozed': return receipt.snoozedUntil ? `보류 · ${formatDayLabel(receipt.snoozedUntil)}에 다시` : '보류';
    case 'unblocked': return '막힘을 풀었습니다';
    case 'decision_logged': return '결정 1건';
    case 'scheduled': return '시간을 잡았습니다';
    default: return '기록 1건';
  }
}

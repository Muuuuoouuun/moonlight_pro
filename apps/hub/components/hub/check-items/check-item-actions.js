// 확인할 것 — 카드의 끝내기 저장(확인할 것 스펙 §4). React 없음 — fetch를 주입받아 테스트한다.
//
// 모든 함수는 { ok, status, message, ... } 봉투를 돌려준다. ok는 서버가 saved/duplicate로 답했을 때만
// true다(DESIGN.md §8.1 Save envelope). preview는 저장되지 않았다는 뜻이라 끝낸 것으로 세지 않는다.

import { kstDayKey } from '@/lib/kst-day';

const OK_STATUSES = new Set(['saved', 'duplicate']);

export function newRequestId() {
  return globalThis.crypto.randomUUID();
}

async function send(fetchImpl, url, method, body) {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    const status = String(data?.status || (response.ok ? 'saved' : 'error'));
    return { ok: response.ok && OK_STATUSES.has(status), status, data };
  } catch (error) {
    return { ok: false, status: 'error', data: { error: error instanceof Error ? error.message : String(error) } };
  }
}

function failure(status, fallback) {
  if (status === 'preview') return '저장소 연결이 필요합니다 — 저장되지 않아 끝낸 것으로 세지 않았습니다.';
  if (status === 'conflict') return '다른 곳에서 먼저 바뀌었습니다. 대상을 열어 확인해 주세요.';
  if (status === 'invalid-input') return '입력을 확인해 주세요.';
  return fallback;
}

/** 영수증 한 줄. item은 toCheckItem() 카드. */
export async function postReceipt(fetchImpl, item, { outcome, recordRef = null, snoozedUntil = null, note = '', requestId = newRequestId() } = {}) {
  const result = await send(fetchImpl, '/api/hub/signal-outcomes', 'POST', {
    requestId,
    signalKey: item.signalKey,
    subject: { type: item.subject?.type, id: item.subject?.type === 'lead-group' ? null : item.subject?.id ?? null },
    title: item.subject?.name || item.title || '',
    outcome,
    recordRef,
    ...(snoozedUntil ? { snoozedUntil } : {}),
    note,
  });
  return {
    ok: result.ok,
    status: result.status,
    requestId,
    receipt: result.data?.receipt || null,
    message: result.ok ? '' : failure(result.status, '끝낸 기록을 남기지 못했습니다.'),
  };
}

/** 할 일로 만들기 — 할 일 id를 미리 만들어 재시도해도 두 개가 생기지 않게 한다(Engine 멱등 경로). */
export async function createTaskForItem(fetchImpl, item, { title, dueAt = '', taskId = newRequestId() } = {}) {
  const subject = item.subject || {};
  const body = {
    id: taskId,
    title: String(title || item.taskTitle || item.title || '').trim(),
    source: 'check-items',
    ...(dueAt ? { dueAt } : {}),
    ...(subject.type === 'deal' ? { dealId: subject.id } : {}),
    ...(subject.type === 'project' ? { projectId: subject.id } : {}),
  };
  if (!body.title) return { ok: false, status: 'invalid-input', taskId, message: '할 일 제목을 적어 주세요.' };
  const result = await send(fetchImpl, '/api/hub/tasks', 'POST', body);
  return {
    ok: result.ok,
    status: result.status,
    taskId: result.data?.task?.id || taskId,
    message: result.ok ? '' : failure(result.status, '할 일을 만들지 못했습니다.'),
  };
}

/** 날짜 다시 — 고객·거래·리드만(기존 오늘 연락 경로). */
export async function rescheduleItem(fetchImpl, item, { at } = {}) {
  const { type, id } = item.subject || {};
  if (!['deal', 'lead', 'account'].includes(type)) return { ok: false, status: 'invalid-input', message: '이 항목은 날짜를 다시 정할 수 없습니다.' };
  const result = await send(fetchImpl, '/api/hub/followups', 'POST', { action: 'reschedule', kind: type, id, at });
  return { ok: result.ok, status: result.status, message: result.ok ? '' : failure(result.status, '다음 연락일을 저장하지 못했습니다.') };
}

/** 고객·거래·리드의 보류는 대상 meta.nudges가 정본이다(넛지와 같은 저장, §4.3). */
export async function snoozeSubject(fetchImpl, item, { until } = {}) {
  const { type, id } = item.subject || {};
  if (!['deal', 'lead', 'account'].includes(type)) return { ok: true, status: 'skipped' };
  const result = await send(fetchImpl, '/api/hub/crm-nudges', 'POST', { subjectType: type, subjectId: id, action: 'snooze', until });
  return { ok: result.ok, status: result.status, message: result.ok ? '' : failure(result.status, '보류를 저장하지 못했습니다.') };
}

export async function undoReceipt(fetchImpl, receipt) {
  const result = await send(fetchImpl, '/api/hub/signal-outcomes', 'PATCH', { id: receipt.id, action: 'undo' });
  if (!result.ok) return { ok: false, status: result.status, message: failure(result.status, '되돌리지 못했습니다.') };
  const { type, id } = receipt.subject || {};
  if (receipt.outcome === 'snoozed' && ['deal', 'lead', 'account'].includes(type)) {
    const resumed = await send(fetchImpl, '/api/hub/crm-nudges', 'POST', { subjectType: type, subjectId: id, action: 'resume' });
    if (!resumed.ok) return { ok: false, status: resumed.status, message: '영수증은 되돌렸지만 보류는 아직 걸려 있습니다. 다시 시도해 주세요.' };
  }
  return { ok: true, status: 'saved', message: '' };
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
    default: return '기록 1건';
  }
}

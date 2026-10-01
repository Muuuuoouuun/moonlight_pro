import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// 구글 일정 삭제(확인할 것 스펙 §4.7·§8.2) — 잡아 둔 일 취소에만 쓴다. 미연결은 preview(지운 것이 아님),
// 구글 실패는 5xx + 실패 기록, 이미 지워진 일정은 저장소 함수가 성공으로 돌려준다.
globalThis.__calendarRoute = { body: {}, deleteResult: { ok: true, reason: 'deleted' }, deletes: [], syncs: [] };
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      'next/server': `export class NextResponse extends Response {
  static json(value, init = {}) { return new Response(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json' } }); }
}`,
      '@/lib/hub-write-guard': `export function assertHubWriteAllowed() { return null; }
export async function readHubWriteJson() { return { data: globalThis.__calendarRoute.body }; }`,
      '@/lib/server-write': `export function resolveDefaultWorkspaceId() { return '11111111-1111-4111-8111-111111111111'; }`,
      '@/lib/google-calendar': `export async function deleteGoogleCalendarEvent(input) { globalThis.__calendarRoute.deletes.push(input); return globalThis.__calendarRoute.deleteResult; }
export async function recordGoogleCalendarSync(entry) { globalThis.__calendarRoute.syncs.push(entry); }
export async function createOrUpdateGoogleCalendarEvent() { return { ok: false, reason: 'unused' }; }
export async function readCombinedGoogleCalendarEvents() { return { ok: false, items: [], sources: [] }; }`,
    };
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const route = await import('./route.js');

async function del(body, deleteResult) {
  globalThis.__calendarRoute.body = body;
  if (deleteResult) globalThis.__calendarRoute.deleteResult = deleteResult;
  const response = await route.DELETE(new Request('http://hub.test/api/calendar/google/event', { method: 'DELETE' }));
  return { status: response.status, body: await response.json() };
}

test('DELETE needs an event id', async () => {
  const result = await del({});
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, 'missing-event-id');
});

test('DELETE removes the event and answers saved', async () => {
  const result = await del({ eventId: 'gcal-1' }, { ok: true, reason: 'already-gone' });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'saved');
  assert.equal(globalThis.__calendarRoute.deletes.at(-1).eventId, 'gcal-1');
});

test('DELETE without a connection is preview, and a Google failure is a recorded 502', async () => {
  assert.equal((await del({ eventId: 'gcal-2' }, { ok: false, reason: 'missing-connection' })).body.status, 'preview');
  const failed = await del({ eventId: 'gcal-3' }, { ok: false, reason: 'google-delete-500' });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.status, 'error');
  assert.equal(globalThis.__calendarRoute.syncs.at(-1).payload.action, 'delete');
});

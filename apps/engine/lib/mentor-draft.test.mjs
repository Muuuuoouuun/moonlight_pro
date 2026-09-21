import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as contract from './mentor-draft.ts';

test('draft responses satisfy the exact cron contract and reject incomplete output', () => {
  assert.equal(typeof contract.parseMentorDraft, 'function');
  assert.deepEqual(contract.parseMentorDraft('followup-draft', '{"subject":"연락","body":"확인 바랍니다"}'), { subject: '연락', body: '확인 바랍니다' });
  assert.deepEqual(contract.parseMentorDraft('content-draft', '```json\n{"title":"제목","body":"본문"}\n```'), { title: '제목', body: '본문' });
  assert.equal(contract.parseMentorDraft('followup-draft', '{"text":"자문"}'), null);
  assert.equal(contract.parseMentorDraft('content-draft', '{"title":"제목","body":""}'), null);
});

test('mentor endpoints serve cron draft shapes and reject unknown modes before provider calls', async () => {
  const before = { ...process.env }, oldFetch = globalThis.fetch;
  Object.assign(process.env, { GEMINI_API_KEY: 'local-test-key', COM_MOON_SHARED_WEBHOOK_SECRET: 'local-test-shared' });
  for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID']) delete process.env[key];
  try {
    for (const [kind, mode, heading] of [['sales', 'followup-draft', 'subject'], ['brand', 'content-draft', 'title']]) {
      const route = await import(`../app/api/ai/${kind}-mentor/route.ts`);
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ [heading]: '제목', body: '저장된 근거에서 작성한 초안' }) }] } }] }); };
      const request = selected => new Request(`https://engine.test/api/ai/${kind}-mentor`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': 'local-test-shared' }, body: JSON.stringify({ mode: selected, context: {} }) });
      assert.equal((await route.POST(request('unknown-mode'))).status, 400); assert.equal(calls, 0);
      const result = await (await route.POST(request(mode))).json();
      assert.equal(result.status, 'generated'); assert.equal(result.mode, mode); assert.equal(result[heading], '제목'); assert.ok(result.body); assert.equal(calls, 1);
    }
  } finally { process.env = before; globalThis.fetch = oldFetch; }
});

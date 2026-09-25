import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OFFICE_SKILL_REQUEST_WINDOW, formatOfficeSkillTime, loadOfficeSkillRequests, officeSkillRequestDraft, officeSkillRequestText,
  officeSkillScope, saveOfficeSkillRequest, validateOfficeSkillRequest,
} from './office-skill-request.js';

const requestId = '94f430e4-13e7-491f-9c2f-4b83d8ab9f12';
const taskId = 'c8814141-551c-413f-8dfa-adfe5142960f';
const otherTaskId = 'd9925252-662d-424f-9e0a-bef6253a7a10';
const input = { requestId, taskId, scope: 'personal', instruction: '영수증을 정리한다', expectedEvidence: '정리된 파일 경로와 누락 목록' };

test('an imported task keeps its known lane; a task without a project is personal only', () => {
  const brand = { taskId, taskWorkspace: 'brand' };
  assert.equal(officeSkillScope(brand, 'all'), 'personal');
  assert.equal(officeSkillScope(brand, 'personal'), 'personal');
  assert.equal(officeSkillScope(brand, 'classin'), null);
  assert.equal(officeSkillScope({ taskId, taskWorkspace: 'classin' }, 'all'), 'classin');
  assert.equal(officeSkillScope({ taskId, taskWorkspace: 'classin' }, 'personal'), null);
  // operating_goal_entity_scope_v1 resolves a project-less task to personal, so company can never save.
  assert.equal(officeSkillScope({ taskId }, 'all'), 'personal');
  assert.equal(officeSkillScope({ taskId }, 'personal'), 'personal');
  assert.equal(officeSkillScope({ taskId }, 'classin'), null);
  const unscoped = officeSkillRequestDraft({ agenda: { taskId }, officeScope: 'all', result: { nextAction: '폴더 정리' } });
  assert.equal(unscoped.scope, 'personal');
  assert.equal(unscoped.unscopedTask, true);
  assert.equal(officeSkillRequestDraft({ agenda: brand, officeScope: 'all', result: {} }).unscopedTask, false);
  assert.equal(officeSkillRequestDraft({ agenda: { taskId }, officeScope: 'classin', result: {} }), null);
  assert.equal(officeSkillScope({ taskId: 'not-an-id', taskWorkspace: 'brand' }, 'personal'), null);
  assert.equal(officeSkillRequestDraft({ agenda: brand, officeScope: 'all', result: { nextAction: '추가 행동 없음' } }).instruction, '');
  assert.equal(officeSkillRequestDraft({ agenda: null, officeScope: 'personal', result: {} }), null);
});

test('the server scope rule this client mirrors still ends a project-less task as personal', () => {
  const sql = fs.readFileSync(new URL('../../../../supabase/migrations/20260921_0036_operating_goals.sql', import.meta.url), 'utf8');
  const scope = sql.slice(sql.indexOf('create or replace function public.operating_goal_entity_scope_v1'), sql.indexOf('revoke all on function public.operating_goal_entity_scope_v1'));
  assert.match(scope, /if p_type='tasks' and v_row->>'project_id' is not null then return public\.operating_goal_entity_scope_v1/);
  assert.match(scope, /return 'personal';\s*end; \$\$;\s*$/);
  const skill = fs.readFileSync(new URL('../../../../supabase/migrations/20260925_0047_local_skill_requests.sql', import.meta.url), 'utf8');
  assert.match(skill, /v_scope:=public\.operating_goal_entity_scope_v1\(p_workspace_id,'tasks',p_task_id\)/);
  assert.match(skill, /case p_scope when 'classin' then 'company' when 'personal' then 'personal'/);
});

test('request history reads once per call, keeps only the current task and separates preview from failure', async () => {
  const row = (overrides = {}) => ({ requestId, taskId, scope: 'personal', instruction: '영수증 폴더 정리', expectedEvidence: '정리된 경로',
    state: 'requested', createdAt: '2026-09-25T05:03:00Z', updatedAt: '2026-09-25T05:03:00Z', receiptAt: null, receiptActorId: null, receipt: null, ...overrides });
  const receipt = { state: 'completed', summary: '정리를 마쳤다', evidence: [{ kind: 'path', value: '/receipts/2026-09' }, { kind: 'secret', value: 'x' }], commandId: 'c1', commandReceiptVerified: true };
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ status: 'ready', items: [
      row({ requestId: '11111111-1111-4111-8111-111111111111', state: 'completed', receipt, receiptAt: '2026-09-25T06:00:00Z', receiptActorId: 'codex' }),
      row({ requestId: '22222222-2222-4222-8222-222222222222', taskId: otherTaskId }),
      row({ requestId: '33333333-3333-4333-8333-333333333333', taskId: taskId.toUpperCase(), state: 'unconfirmed', receipt: { state: 'unconfirmed', summary: '결과 확인 못 함', evidence: [] } }),
      row({ requestId: 'bad-id' }),
      row({ requestId: '44444444-4444-4444-8444-444444444444', state: 'running' }),
    ] });
  };
  const live = await loadOfficeSkillRequests(taskId, { fetcher });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `/api/hub/skill-requests?limit=${OFFICE_SKILL_REQUEST_WINDOW}`);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.method, undefined);
  assert.equal(live.status, 'live');
  assert.equal(live.windowFull, false);
  assert.deepEqual(live.items.map(item => item.state), ['completed', 'unconfirmed']);
  assert.deepEqual(live.items[0].receipt, { summary: '정리를 마쳤다', evidence: [{ kind: 'path', value: '/receipts/2026-09' }], commandReceiptVerified: true });
  assert.equal(live.items[0].receiptActorId, 'codex');
  assert.equal(live.items[1].receipt.summary, '결과 확인 못 함');

  const full = await loadOfficeSkillRequests(taskId, { fetcher: async () => Response.json({ status: 'ready', items: Array(OFFICE_SKILL_REQUEST_WINDOW).fill(row()) }) });
  assert.equal(full.windowFull, true);
  const empty = await loadOfficeSkillRequests(taskId, { fetcher: async () => Response.json({ status: 'ready', items: [] }) });
  assert.deepEqual([empty.status, empty.items.length], ['live', 0]);
  const unconfigured = await loadOfficeSkillRequests(taskId, { fetcher: async () => Response.json({ status: 'error', source: 'error', error: 'skill-storage-not-configured' }) });
  assert.equal(unconfigured.status, 'preview');
  for (const failure of [
    async () => Response.json({ status: 'error', source: 'error', error: 'skill-storage-unavailable' }),
    async () => Response.json({ status: 'ready', items: [] }, { status: 500 }),
    async () => new Response('not json'),
    async () => { throw new Error('offline'); },
  ]) {
    const result = await loadOfficeSkillRequests(taskId, { fetcher: failure });
    assert.equal(result.status, 'error');
    assert.deepEqual(result.items, []);
    assert.ok(result.error);
  }
  let invalidCalls = 0;
  assert.equal((await loadOfficeSkillRequests('not-a-task', { fetcher: async () => { invalidCalls += 1; } })).status, 'error');
  assert.equal(invalidCalls, 0);
});

test('receipt times render as compact month-day and 24-hour time', () => {
  assert.equal(formatOfficeSkillTime('2026-09-25T05:03:00Z', { timeZone: 'Asia/Seoul' }), '09-25 14:03');
  assert.equal(formatOfficeSkillTime('2026-09-25T15:30:00Z', { timeZone: 'Asia/Seoul' }), '09-26 00:30');
  assert.equal(formatOfficeSkillTime(null), '');
  assert.equal(formatOfficeSkillTime('not a date'), '');
});

test('an operator must provide bounded instructions and completion evidence', () => {
  assert.equal(validateOfficeSkillRequest(input), null);
  assert.match(validateOfficeSkillRequest({ ...input, expectedEvidence: '' }), /증거/);
  assert.match(validateOfficeSkillRequest({ ...input, instruction: '가'.repeat(4001) }), /4,000자/);
  assert.match(validateOfficeSkillRequest({ ...input, scope: 'all' }), /범위/);
  const text = officeSkillRequestText(input);
  assert.match(text, new RegExp(requestId));
  assert.match(text, /get_skill_request/);
  assert.match(text, /record_skill_receipt/);
  assert.match(text, /휴지통/);
  assert.match(text, /completed\(증거 1개 이상\)·failed·unconfirmed/);
  assert.match(text, /요청서 복사나 채팅의 "완료" 문장은 완료가 아니다/);
  assert.match(text, /complete_task를 따로 부르고 그 commandId를 receipt에 넣는다/);
});

test('a request is ready only after a matching persisted receipt, and preview or read failure stays unsaved', async () => {
  const fetcher = async (_, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), input);
    return Response.json({ status: 'ready', persisted: true, request: { ...input, state: 'requested' } });
  };
  assert.equal((await saveOfficeSkillRequest(input, { fetcher })).status, 'ready');
  assert.equal((await saveOfficeSkillRequest(input, { fetcher: async () => Response.json({ status: 'ready', persisted: true, request: { ...input, requestId: crypto.randomUUID() } }) })).persisted, false);
  assert.equal((await saveOfficeSkillRequest(input, { fetcher: async () => Response.json({ status: 'error' }) })).status, 'error');
  const unavailable = await saveOfficeSkillRequest(input, { fetcher: async () => Response.json({ status: 'error', error: 'skill-storage-unavailable' }, { status: 502 }) });
  assert.equal(unavailable.status, 'error');
  assert.equal(unavailable.error, '요청서 저장소가 아직 준비되지 않았습니다.');
  const notConfigured = await saveOfficeSkillRequest(input, { fetcher: async () => Response.json({ status: 'error', error: 'skill-storage-not-configured' }, { status: 502 }) });
  assert.equal(notConfigured.status, 'error');
  assert.equal(notConfigured.error, '요청서 저장소 연결이 설정되지 않았습니다.');
  assert.equal((await saveOfficeSkillRequest(input, { fetcher: async () => { throw new Error('offline'); } })).persisted, false);
});

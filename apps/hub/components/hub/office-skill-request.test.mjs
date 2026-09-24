import { test } from 'node:test';
import assert from 'node:assert/strict';
import { officeSkillRequestDraft, officeSkillRequestText, officeSkillScope, saveOfficeSkillRequest, validateOfficeSkillRequest } from './office-skill-request.js';

const requestId = '94f430e4-13e7-491f-9c2f-4b83d8ab9f12';
const taskId = 'c8814141-551c-413f-8dfa-adfe5142960f';
const input = { requestId, taskId, scope: 'personal', instruction: '영수증을 정리한다', expectedEvidence: '정리된 파일 경로와 누락 목록' };

test('an imported task keeps its known lane or requires an explicit choice when unassigned', () => {
  const brand = { taskId, taskWorkspace: 'brand' };
  assert.equal(officeSkillScope(brand, 'all'), 'personal');
  assert.equal(officeSkillScope(brand, 'personal'), 'personal');
  assert.equal(officeSkillScope(brand, 'classin'), null);
  assert.equal(officeSkillScope({ taskId }, 'all'), null);
  assert.equal(officeSkillScope({ taskId }, 'all', 'personal'), 'personal');
  assert.equal(officeSkillRequestDraft({ agenda: { taskId }, officeScope: 'all', result: { nextAction: '폴더 정리' } }).scope, null);
  assert.equal(officeSkillScope({ taskId: 'not-an-id', taskWorkspace: 'brand' }, 'personal'), null);
  assert.equal(officeSkillRequestDraft({ agenda: brand, officeScope: 'all', result: { nextAction: '추가 행동 없음' } }).instruction, '');
  assert.equal(officeSkillRequestDraft({ agenda: null, officeScope: 'personal', result: {} }), null);
});

test('an operator must provide bounded instructions and completion evidence', () => {
  assert.equal(validateOfficeSkillRequest(input), null);
  assert.match(validateOfficeSkillRequest({ ...input, expectedEvidence: '' }), /증거/);
  assert.match(validateOfficeSkillRequest({ ...input, instruction: '가'.repeat(4001) }), /4,000자/);
  assert.match(validateOfficeSkillRequest({ ...input, scope: 'all' }), /범위/);
  assert.match(officeSkillRequestText(input), /요청서 복사는 할 일 완료가 아닙니다/);
});

test('a request is ready only after a matching persisted receipt, and preview or read failure stays unsaved', async () => {
  const fetcher = async (_, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), input);
    return Response.json({ status: 'ready', persisted: true, request: { ...input, state: 'requested' } });
  };
  assert.equal((await saveOfficeSkillRequest(input, { fetcher })).status, 'ready');
  assert.equal((await saveOfficeSkillRequest(input, { fetcher: async () => Response.json({ status: 'ready', persisted: true, request: { ...input, requestId: crypto.randomUUID() } }) })).persisted, false);
  assert.equal((await saveOfficeSkillRequest(input, { fetcher: async () => Response.json({ status: 'preview', persisted: false }, { status: 202 }) })).status, 'preview');
  assert.equal((await saveOfficeSkillRequest(input, { fetcher: async () => Response.json({ status: 'error' }) })).status, 'error');
  assert.equal((await saveOfficeSkillRequest(input, { fetcher: async () => { throw new Error('offline'); } })).persisted, false);
});

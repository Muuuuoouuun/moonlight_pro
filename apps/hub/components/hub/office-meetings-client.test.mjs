import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeSessionStore } from './office-session.js';
import { readOfficeMeeting, listOfficeMeetings, sendOfficeMeeting, saveOfficeMeetingSettings, applyOfficeTaskAction,
  readOfficeMeetingTask, applyOfficeMeetingTaskAction } from './office-meetings-client.js';

const meetingId = '10000000-0000-4000-8000-000000000001';
const turnId = '10000000-0000-4000-8000-000000000002';
const taskId = '10000000-0000-4000-8000-000000000003';

test('task comparison cannot follow a late read into another same-scope meeting or save its task there', async () => {
  const store = createOfficeSessionStore();
  const sourceTask = { id: taskId, title: '원래 안건', workspace: 'brand' };
  store.restoreMeeting('personal', detail('personal', { sourceTask }));
  let resolveRead;
  const pendingRead = readOfficeMeetingTask(store, 'personal', { fetcher: () => new Promise(resolve => { resolveRead = resolve; }) });
  store.restoreMeeting('personal', detail('personal', { meetingId: turnId, sourceTask: { ...sourceTask, id: meetingId } }));
  resolveRead(Response.json({ status: 'live', tasks: [{ ...sourceTask, updatedAt: '2026-10-04T00:00:00Z' }] }));
  assert.equal((await pendingRead).status, 'discarded');
  let writes = 0;
  const oldComparison = { meetingId, sourceTaskId: taskId, current: { ...sourceTask, updatedAt: '2026-10-04T00:00:00Z' }, nextAction: '확인한 행동' };
  const blocked = await applyOfficeMeetingTaskAction(store, 'personal', oldComparison, { fetcher: async () => { writes++; } });
  assert.equal(blocked.status, 'discarded');
  assert.equal(writes, 0);
  store.restoreMeeting('personal', detail('personal', { sourceTask }));
  const comparison = await readOfficeMeetingTask(store, 'personal', { fetcher: async () => Response.json({ status: 'live', tasks: [oldComparison.current] }) });
  assert.deepEqual([comparison.meetingId, comparison.sourceTaskId], [meetingId, taskId]);
  assert.equal(comparison.status, 'ready');
  const saved = await applyOfficeMeetingTaskAction(store, 'personal', { ...comparison, nextAction: '확인한 행동' }, { fetcher: async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { id: taskId, nextAction: '확인한 행동', expectedUpdatedAt: '2026-10-04T00:00:00Z' });
    return Response.json({ status: 'saved', task: oldComparison.current });
  } });
  assert.equal(saved.status, 'saved');
});
const detail = (scope = 'personal', extra = {}) => ({ status: 'ready', persisted: true,
  meeting: { meetingId, scope, title: '결정할 안건', ownerId: 'eevee', reviewers: ['umbreon'], mode: 'council', revision: 2, state: 'open', decisionContext: '확정한 조건', sourceTask: null, ...extra },
  turns: [{ id: turnId, roundNumber: 1, state: 'generated', request: { ownerId: 'eevee', reviewers: ['umbreon'], participants: ['eevee', 'umbreon'], mode: 'council', scope, message: '요청 원문' }, result: { status: 'generated', ownerId: 'eevee', mode: 'council', scope, answer: '결론', nextAction: '확인하기', discussion: { turns: [{ ownerId: 'umbreon', position: '조건부 반대' }] } } }], skillRequests: [] });

test('server restore retains complete role speeches and reload keeps exact unsent input', () => {
  const store = createOfficeSessionStore();
  assert.equal(store.restoreMeeting('personal', detail()), true);
  assert.equal(store.get('personal').turns[0].result.discussion.turns[0].position, '조건부 반대');
  store.update('personal', { draft: ' 공백까지 보존\n' });
  store.restoreMeeting('personal', detail('personal', { revision: 3 }));
  assert.equal(store.get('personal').draft, ' 공백까지 보존\n');
  assert.equal(store.get('personal').revision, 3);
});

test('reloading adopts remote settings for clean fields and follow-up cannot silently revert them', async () => {
  const store = createOfficeSessionStore();
  store.restoreMeeting('personal', detail());
  store.update('personal', { draft: '추가 검토' });
  const remote = detail('personal', { revision: 3, decisionContext: '다른 화면에서 저장한 조건', ownerId: 'jolteon', reviewers: [], mode: 'chat' });
  store.restoreMeeting('personal', remote, { keepSettings: true });
  assert.equal(store.get('personal').decisionContext, remote.meeting.decisionContext);
  assert.deepEqual([store.get('personal').ownerId, store.get('personal').reviewers, store.get('personal').mode], ['jolteon', [], 'chat']);
  const sent = await sendOfficeMeeting(store, 'personal', { requestId: taskId, fetcher: async (url, init) => {
    assert.equal(url, `/api/hub/office/meetings/${meetingId}/turns`, 'a clean reload must not PATCH over remote changes');
    const payload = JSON.parse(init.body);
    return Response.json({ ...remote, status: 'generated', turns: [{ id: taskId, state: 'generated',
      request: { ownerId: 'jolteon', scope: 'personal', mode: 'chat', message: payload.message },
      result: { ownerId: 'jolteon', scope: 'personal', mode: 'chat', answer: '추가 검토 결과' } }] });
  } });
  assert.equal(sent.status, 'generated');
});

test('scope mismatch cannot restore or overwrite another scope and switching meetings keeps drafts', () => {
  const store = createOfficeSessionStore();
  store.update('classin', { draft: '회사 입력' });
  assert.equal(store.restoreMeeting('classin', detail()), false);
  assert.equal(store.get('classin').draft, '회사 입력');
  store.restoreMeeting('personal', detail());
  store.update('personal', { draft: '첫 회의 입력' });
  store.restoreMeeting('personal', detail('personal', { meetingId: taskId }));
  store.update('personal', { draft: '둘째 입력' });
  store.restoreMeeting('personal', detail());
  assert.equal(store.get('personal').draft, '첫 회의 입력');
});

test('read error envelopes cannot look like an empty archive or restored meeting', async () => {
  const fetcher = async () => Response.json({ status: 'error', source: 'error', meetings: [] });
  assert.equal((await listOfficeMeetings('personal', { fetcher })).status, 'error');
  assert.equal((await readOfficeMeeting(meetingId, 'personal', { fetcher })).status, 'error');
  assert.equal((await readOfficeMeeting(meetingId, 'classin', { fetcher: async () => Response.json(detail()) })).status, 'error');
});

test('first explicit send creates once, sends no client history/results, and saves settings before follow-up', async () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: ' 보낼 원문 ', reviewers: ['umbreon'] });
  const calls = [];
  const fetcher = async (path, options) => {
    const body = JSON.parse(options.body); calls.push({ path, body });
    const response = detail('personal', { revision: 1 });
    if (path.endsWith('/turns')) {
      response.status = 'generated'; response.turns[0].id = body.requestId;
      for (const field of ['request', 'result']) Object.assign(response.turns[0][field], { ownerId: store.get('personal').ownerId, mode: body.mode });
    }
    return Response.json(response);
  };
  await sendOfficeMeeting(store, 'personal', { requestId: turnId, meetingId, fetcher });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.scope, 'personal');
  assert.equal(calls[1].body.message, '보낼 원문');
  assert.equal('history' in calls[1].body, false);
  assert.equal('result' in calls[1].body, false);
  assert.equal(store.get('personal').draft, '');
  store.update('personal', { draft: '후속', ownerId: 'flareon', reviewers: [] });
  calls.length = 0;
  await sendOfficeMeeting(store, 'personal', { requestId: taskId, fetcher });
  assert.equal(calls[0].path, `/api/hub/office/meetings/${meetingId}`);
  assert.equal(calls[0].body.ownerId, 'flareon');
  assert.equal(calls[1].body.requestId, taskId);
});

test('a success envelope without the submitted round never clears input or claims generation', async () => {
  const store = createOfficeSessionStore(); store.restoreMeeting('personal', detail());
  store.update('personal', { draft: '반드시 보존할 요청' });
  const result = await sendOfficeMeeting(store, 'personal', { requestId: taskId,
    fetcher: async () => Response.json({ ...detail(), status: 'generated' }) });
  assert.equal(result.status, 'unknown');
  assert.equal(store.get('personal').draft, '반드시 보존할 요청');
});

test('unconfirmed persistence cannot become a saved meeting', async () => {
  const result = await readOfficeMeeting(meetingId, 'personal', { fetcher: async () => Response.json({ ...detail(), persisted: false }) });
  assert.equal(result.status, 'error');
});

test('switching meetings while create is in flight cannot send the old draft to the new meeting', async () => {
  const store = createOfficeSessionStore(); store.update('personal', { draft: '첫 회의의 입력' });
  let release; let calls = 0;
  const sending = sendOfficeMeeting(store, 'personal', { requestId: turnId, meetingId,
    fetcher: async () => { calls++; if (calls === 1) await new Promise(resolve => { release = resolve; }); return Response.json(detail()); } });
  await Promise.resolve();
  store.restoreMeeting('personal', detail('personal', { meetingId: taskId }));
  release(); await sending;
  assert.equal(calls, 1);
  assert.equal(store.get('personal').meetingId, taskId);
});

test('context conflicts reload server revision while preserving both editor drafts and leave guard', () => {
  const store = createOfficeSessionStore(); store.restoreMeeting('personal', detail());
  store.update('personal', { draft: '이어서 묻는 원문', decisionContext: '편집 중인 결정' });
  store.restoreMeeting('personal', detail('personal', { revision: 7, decisionContext: '다른 화면의 결정' }), { keepSettings: true });
  assert.equal(store.get('personal').revision, 7);
  assert.equal(store.get('personal').decisionContext, '편집 중인 결정');
  assert.equal(store.get('personal').meeting.decisionContext, '다른 화면의 결정');
  assert.equal(store.get('personal').draft, '이어서 묻는 원문');
  assert.equal(store.hasUnsentDrafts(), true);
});

test('resuming a different meeting restores its unsaved context and participant edits over the new server baseline', () => {
  const store = createOfficeSessionStore(); store.restoreMeeting('personal', detail());
  store.update('personal', { decisionContext: '아직 저장하지 않은 조건', ownerId: 'flareon', reviewers: [] });
  store.restoreMeeting('personal', detail('personal', { meetingId: taskId }));
  store.restoreMeeting('personal', detail('personal', { revision: 8, decisionContext: '새 서버 조건' }));
  assert.equal(store.get('personal').decisionContext, '아직 저장하지 않은 조건');
  assert.equal(store.get('personal').ownerId, 'flareon');
  assert.deepEqual(store.get('personal').reviewers, []);
  assert.equal(store.get('personal').revision, 8);
  assert.equal(store.get('personal').meeting.decisionContext, '새 서버 조건');
});

test('conflict and uncertain generation preserve input and cannot automatically retry generation', async () => {
  const store = createOfficeSessionStore(); store.restoreMeeting('personal', detail());
  store.update('personal', { draft: ' 입력 유지 ' });
  const fetcher = async () => Response.json({ status: 'conflict', error: 'revision-mismatch' }, { status: 409 });
  const conflict = await sendOfficeMeeting(store, 'personal', { requestId: taskId, fetcher });
  assert.equal(conflict.status, 'conflict');
  assert.equal(store.get('personal').draft, ' 입력 유지 ');
  let calls = 0;
  await sendOfficeMeeting(store, 'personal', { requestId: taskId, fetcher: async () => { calls++; throw new Error('offline'); } });
  assert.equal(store.get('personal').error.status, 'unknown');
  await sendOfficeMeeting(store, 'personal', { requestId: turnId, fetcher: async () => { calls++; throw new Error('offline'); } });
  assert.equal(calls, 1);
  assert.equal(store.get('personal').draft, ' 입력 유지 ');
});

test('all scope never silently creates personal meeting', async () => {
  const store = createOfficeSessionStore(); store.update('all', { draft: '범위 고르기' });
  let called = false;
  const result = await sendOfficeMeeting(store, 'all', { requestId: turnId, fetcher: async () => { called = true; } });
  assert.equal(result.status, 'error'); assert.equal(called, false);
  assert.equal(store.get('all').draft, '범위 고르기');
});

test('context save conflict retains local context and task save compares latest timestamp', async () => {
  const store = createOfficeSessionStore(); store.restoreMeeting('personal', detail());
  store.update('personal', { decisionContext: '수정 중 조건' });
  const conflict = await saveOfficeMeetingSettings(store, 'personal', { fetcher: async () => Response.json({ status: 'conflict' }, { status: 409 }) });
  assert.equal(conflict.status, 'conflict');
  assert.equal(store.get('personal').decisionContext, '수정 중 조건');
  let body;
  const current = { id: taskId, updatedAt: '2026-10-04T00:00:00Z', nextAction: '현재 행동' };
  const saved = await applyOfficeTaskAction(current, '새 행동', { fetcher: async (_, options) => { body = JSON.parse(options.body); return Response.json({ status: 'saved', task: { id: taskId, next_action: '새 행동' } }); } });
  assert.equal(saved.status, 'saved');
  assert.deepEqual(body, { id: taskId, expectedUpdatedAt: current.updatedAt, nextAction: '새 행동' });
  assert.equal((await applyOfficeTaskAction(current, '새 행동', { fetcher: async () => Response.json({ status: 'conflict', task: current }, { status: 409 }) })).status, 'conflict');
});

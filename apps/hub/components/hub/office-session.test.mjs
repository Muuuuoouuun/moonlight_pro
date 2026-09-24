import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeSessionStore, copyOfficeText, shouldSubmitOfficeKey, OFFICE_MINIMUM_INSTRUCTION, officeMessageLength, officeTaskAgendaBlock, officeTasksForScope, loadOfficeTasks } from './office-session.js';

const generated = (request, answer = '요청한 결과입니다.') => ({ status: 'generated', ...request, answer, nextAction: '추가 행동 없음' });

test('one editor preserves original text across owner, mode, participants and preset changes', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '  사용자가 쓴 원문\n그대로 보존  ' });
  store.update('personal', { ownerId: 'flareon', mode: 'council', reviewers: ['umbreon'], presetId: 'customer' });
  assert.equal(store.get('personal').draft, '  사용자가 쓴 원문\n그대로 보존  ');
  const pending = store.begin('personal', 'request-a');
  assert.equal(pending.request.message, '사용자가 쓴 원문\n그대로 보존');
  assert.deepEqual(pending.request.participants, ['flareon', 'umbreon']);
  assert.equal(store.get('classin').draft, '');
});

test('scope and request identity isolate a late result while another scope is edited', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '개인 요청', ownerId: 'sylveon', mode: 'draft' });
  const personal = store.begin('personal', 'personal-request');
  store.update('classin', { draft: '회사 요청', ownerId: 'flareon', mode: 'review' });
  const company = store.begin('classin', 'company-request');
  assert.equal(store.complete('classin', personal.id, generated(personal.request)), false);
  assert.equal(store.complete('personal', personal.id, generated(personal.request)), true);
  assert.equal(store.get('classin').draft, '회사 요청');
  assert.equal(store.get('classin').pending.id, company.id);
  assert.equal(store.get('personal').turns[0].result.ownerId, 'sylveon');
  store.update('personal', { ownerId: 'eevee', mode: 'chat' });
  assert.equal(store.get('personal').turns[0].result.mode, 'draft');
});

test('duplicate send and stale completion do not start or append another request', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '한 번 요청' });
  const pending = store.begin('personal', 'first');
  assert.equal(store.begin('personal', 'duplicate'), null);
  assert.equal(store.complete('personal', 'first', generated(pending.request)), true);
  assert.equal(store.complete('personal', 'first', generated(pending.request)), false);
  assert.equal(store.get('personal').turns.length, 1);
  assert.equal(store.get('personal').draft, '');
  assert.equal(store.hasUnsentDrafts(), false);
});

test('failed requests keep exact original input and preserve new input on successful completion', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: ' 원문과 공백 ' });
  store.begin('personal', 'failed');
  store.complete('personal', 'failed', { status: 'error', error: '연결 실패' });
  assert.equal(store.get('personal').draft, ' 원문과 공백 ');
  assert.equal(store.hasUnsentDrafts(), true);
  const pending = store.begin('personal', 'retry');
  store.update('personal', { draft: '이후 작성한 원문' });
  store.complete('personal', 'retry', generated(pending.request));
  assert.equal(store.get('personal').draft, '이후 작성한 원문');
});

test('minimum mode keeps input unchanged and respects the v2 message limit', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '남길 약속', minimumOnly: true });
  const pending = store.begin('personal', 'minimum');
  assert.equal(pending.request.message, OFFICE_MINIMUM_INSTRUCTION + '남길 약속');
  assert.equal(store.get('personal').draft, '남길 약속');
  store.complete('personal', 'minimum', { status: 'error' });
  store.update('personal', { draft: '가'.repeat(6000) });
  assert.equal(store.begin('personal', 'too-long'), null);
  assert.equal(store.get('personal').draft.length, 6000);
});

test('new Hub sessions cannot recover another session raw drafts', () => {
  const previous = createOfficeSessionStore();
  previous.update('personal', { draft: '세션 전용 원문' });
  assert.equal(createOfficeSessionStore().get('personal').draft, '');
  assert.equal(previous.hasUnsentDrafts(), true);
});

test('IME composition and ordinary Enter cannot submit; command Enter can', () => {
  assert.equal(shouldSubmitOfficeKey({ key: 'Enter' }), false);
  assert.equal(shouldSubmitOfficeKey({ key: 'Enter', metaKey: true }), true);
  assert.equal(shouldSubmitOfficeKey({ key: 'Enter', ctrlKey: true }), true);
  for (const composition of [{ isComposing: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }, { nativeEvent: { keyCode: 229 } }]) {
    assert.equal(shouldSubmitOfficeKey({ key: 'Enter', metaKey: true, ...composition }), false);
  }
});

test('clipboard feedback reflects completion and reports permission or capability failures', async () => {
  let copied = null;
  assert.equal(await copyOfficeText('결과물', { writeText: async text => { copied = text; } }), true);
  assert.equal(copied, '결과물');
  assert.equal(await copyOfficeText('결과물', { writeText: async () => { throw new Error('denied'); } }), false);
  assert.equal(await copyOfficeText('결과물', undefined), false);
});

test('pending council snapshots preserve controls and weights across edits, scope changes and follow-up', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '유지할 원문', mode: 'council', reviewers: ['umbreon'], deliberation: { profile: 'explore', challenge: 3, influence: { eevee: 2, umbreon: 3 } } });
  const pending = store.begin('personal', 'configured');
  assert.equal(pending.request.deliberation.challenge, 3);
  store.update('personal', { ownerId: 'vaporeon', reviewers: ['eevee'], deliberation: { profile: 'urgent' } });
  store.update('classin', { draft: '별도 범위' });
  assert.deepEqual(pending.request.deliberation.influence, { eevee: 2, umbreon: 3 });
  assert.equal(pending.request.deliberation.profile, 'explore');
  store.complete('personal', pending.id, generated(pending.request));
  assert.deepEqual(store.get('personal').turns[0].request.deliberation, pending.request.deliberation);
  assert.equal(store.get('personal').deliberation.profile, 'urgent');
  assert.equal(store.get('classin').deliberation.profile, 'balanced');
  store.update('personal', { draft: '수정할 내용', ownerId: pending.request.ownerId, reviewers: pending.request.participants.filter(id => id !== pending.request.ownerId), deliberation: pending.request.deliberation });
  const followUp = store.begin('personal', 'follow-up');
  assert.deepEqual(followUp.request.deliberation, pending.request.deliberation);
  assert.notEqual(followUp.request.deliberation.influence, pending.request.deliberation.influence);
});

test('ordinary modes retain local settings without sending council-only fields', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '초안 원문', mode: 'draft', deliberation: { profile: 'scrutiny' } });
  const pending = store.begin('personal', 'draft');
  assert.equal(pending.request.deliberation, undefined);
  assert.equal(store.get('personal').deliberation.profile, 'scrutiny');
});

test('one host starts without reviewers and adding or removing a perspective determines council mode', () => {
  const store = createOfficeSessionStore();
  assert.deepEqual(store.get('personal').reviewers, []);
  store.update('personal', { draft: '가격 결정', mode: 'draft' });
  assert.equal(store.begin('personal', 'solo').request.mode, 'draft');
  store.complete('personal', 'solo', { status: 'error' });
  store.update('personal', { reviewers: ['umbreon'] });
  assert.equal(store.get('personal').mode, 'council');
  store.update('personal', { reviewers: [] });
  assert.equal(store.get('personal').mode, 'chat');
});

test('a host follow-up uses chat once without changing the configured council participants', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '가격을 정해요', reviewers: ['umbreon'] });
  const first = store.begin('personal', 'council');
  assert.equal(first.request.mode, 'council');
  store.complete('personal', first.id, generated(first.request));
  store.update('personal', { draft: '예산이 없어요' });
  const followUp = store.begin('personal', 'chat-follow-up', { mode: 'chat' });
  assert.equal(followUp.request.mode, 'chat');
  assert.deepEqual(followUp.request.participants, []);
  assert.equal(store.get('personal').mode, 'council');
  assert.deepEqual(store.get('personal').reviewers, ['umbreon']);
});

test('task agenda formatting and scope selection use only available task fields', () => {
  const tasks = [
    { id: 'a', title: '회사 제안서', workspace: 'classin', status: 'doing', nextAction: '금액 결정', due: '09-30', description: '고객 메모' },
    { id: 'b', title: '개인 콘텐츠', workspace: 'brand', status: 'inbox' },
    { id: 'c', title: '범위 없는 일', status: 'inbox' },
    { id: 'd', title: '끝난 일', workspace: 'classin', status: 'done' },
  ];
  assert.deepEqual(officeTasksForScope(tasks, 'classin').map(task => task.id), ['a']);
  assert.deepEqual(officeTasksForScope(tasks, 'personal').map(task => task.id), ['b']);
  assert.deepEqual(officeTasksForScope(tasks, 'all').map(task => task.id), ['a', 'b', 'c']);
  const block = officeTaskAgendaBlock(tasks[0]);
  for (const line of ['회사 제안서', '금액 결정', '09-30', '고객 메모']) assert.ok(block.includes(line));
  assert.doesNotMatch(block, /프로젝트:/);
  assert.ok(officeTaskAgendaBlock({ title: '가'.repeat(2000) }).length <= 1500);
});

test('agenda stays in the request after the first turn falls outside four-turn history', () => {
  const store = createOfficeSessionStore();
  const block = officeTaskAgendaBlock({ title: '제안서 가격', nextAction: '견적 확정' });
  store.update('classin', { agenda: { title: '제안서 가격', source: 'task', taskId: 't1', importedAt: '2026-09-24T09:00:00.000Z', block }, draft: `${block}\n\n검토해 줘` });
  for (let index = 0; index < 5; index += 1) {
    const pending = store.begin('classin', `turn-${index}`);
    assert.ok(pending);
    store.complete('classin', pending.id, generated(pending.request));
    store.update('classin', { draft: `후속 요청 ${index}` });
  }
  const sixth = store.begin('classin', 'sixth');
  assert.ok(sixth.request.message.startsWith(block));
  assert.equal(sixth.request.message.split(block).length, 2);
  assert.equal(sixth.request.history.length, 8);
});

test('manual agenda is derived from the first request and a new agenda clears only its scope', () => {
  const store = createOfficeSessionStore();
  store.update('personal', { draft: '첫 줄 안건\n추가 상황' });
  const pending = store.begin('personal', 'manual');
  assert.deepEqual(store.get('personal').agenda, { title: '첫 줄 안건', source: 'manual', block: '첫 줄 안건\n추가 상황' });
  store.complete('personal', pending.id, generated(pending.request));
  store.update('classin', { draft: '회사 원문' });
  store.reset('personal');
  assert.equal(store.get('personal').turns.length, 0);
  assert.equal(store.get('personal').agenda, null);
  assert.equal(store.get('personal').draft, '');
  assert.equal(store.get('classin').draft, '회사 원문');
});

test('the full message limit counts a reattached agenda and shows an explicit error', () => {
  const store = createOfficeSessionStore();
  const block = '안건'.repeat(250);
  store.update('personal', { agenda: { title: '긴 안건', source: 'manual', block }, turns: Array.from({ length: 5 }, (_, id) => ({ id, message: `후속 ${id}`, result: { answer: '답변' } })), draft: '가'.repeat(5600) });
  assert.ok(officeMessageLength(store.get('personal')) > 6000);
  assert.equal(store.begin('personal', 'too-long'), null);
  assert.match(store.get('personal').error.error, /6,000자/);
  assert.equal(store.get('personal').draft.length, 5600);
});

test('task reader distinguishes live, partial, preview and failed HTTP or read envelopes', async () => {
  const read = (status, body) => loadOfficeTasks({ fetcher: async () => Response.json(body, { status }) });
  assert.deepEqual((await read(200, { status: 'live', tasks: [{ id: 'a' }] })).tasks, [{ id: 'a' }]);
  assert.equal((await read(200, { status: 'partial', tasks: [{ id: 'a' }] })).status, 'partial');
  assert.equal((await read(200, { status: 'preview', tasks: [] })).status, 'preview');
  assert.equal((await read(502, { status: 'error', tasks: [] })).status, 'error');
  assert.equal((await read(200, { status: 'error', tasks: [] })).status, 'error');
  assert.equal((await loadOfficeTasks({ fetcher: async () => { throw new Error('offline'); } })).status, 'error');
});

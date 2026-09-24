import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOfficeMentorSessionStore } from './office-mentor-session.js';

const source = { requestId: '10000000-0000-4000-8000-000000000001', runId: null };
const result = (scope = 'personal') => ({
  status: 'generated', scope, answer: 'Office의 종합입니다.', evidence: ['확인한 근거'], dissent: ['남은 이견'], nextAction: '판단 보류',
});
const advice = (text, mentorRunId = null) => ({ status: 'generated', text, mentorRunId, officeSource: source });

test('one-hop answer becomes the first turn and two explicit follow-ups retain the same mentor context', () => {
  const store = createOfficeMentorSessionStore();
  const id = store.open({ result: result(), officeSource: source, scope: 'personal' });
  const first = store.begin(id, 'mentor-1');
  assert.equal(first.request.endpoint, '/api/hub/brand-mentor');
  assert.equal(first.request.body.mode, 'office-review');
  assert.equal(store.begin(id, 'duplicate'), null);
  assert.equal(store.complete(id, 'mentor-1', advice('첫 멘토 답변')), true);
  assert.equal(store.get(id).turns.length, 1);

  store.setDraft(id, '첫 번째 후속 질문');
  const followup1 = store.begin(id, 'mentor-2');
  assert.match(followup1.request.body.draft, /첫 멘토 답변/);
  assert.equal(followup1.request.endpoint, first.request.endpoint);
  store.complete(id, 'mentor-2', advice('첫 번째 후속 답변'));
  store.setDraft(id, '두 번째 후속 질문');
  const followup2 = store.begin(id, 'mentor-3');
  assert.match(followup2.request.body.draft, /첫 멘토 답변/);
  assert.match(followup2.request.body.draft, /첫 번째 후속 답변/);
  assert.match(followup2.request.body.draft, /두 번째 후속 질문/);
  assert.equal(followup2.request.body.mode, first.request.body.mode);
  store.complete(id, 'mentor-3', advice('두 번째 후속 답변'));
  assert.equal(store.get(id).turns.length, 3);
  assert.equal(store.get(id).draft, '');
});

test('failed follow-up retains exact input and conversation until an explicit retry', () => {
  const store = createOfficeMentorSessionStore();
  const id = store.open({ result: result(), officeSource: source, scope: 'personal', initialAdvice: advice('첫 멘토 답변') });
  store.setDraft(id, '  다시 물을 원문  ');
  const pending = store.begin(id, 'retry-1');
  assert.equal(pending.question, '다시 물을 원문');
  store.complete(id, 'retry-1', { status: 'error', note: '연결을 확인하지 못했습니다.' });
  assert.equal(store.get(id).draft, '  다시 물을 원문  ');
  assert.equal(store.get(id).turns.length, 1);
  assert.equal(store.get(id).error.status, 'error');
  assert.equal(store.get(id).pending, null);
  assert.equal(store.complete(id, 'retry-1', advice('늦은 답')), false);
  const retry = store.begin(id, 'retry-2');
  assert.equal(retry.question, pending.question);
  store.setDraft(id, '새로 작성한 질문');
  store.complete(id, 'retry-2', advice('후속 답변'));
  assert.equal(store.get(id).draft, '새로 작성한 질문');
  assert.equal(store.get(id).turns.length, 2);
});

test('all-scope session requires an explicit lane and locks it after the first answer', () => {
  const store = createOfficeMentorSessionStore();
  const id = store.open({ result: result('all'), officeSource: source, scope: 'all' });
  assert.equal(store.begin(id, 'before-lane'), null);
  assert.equal(store.get(id).error.code, 'lane-required');
  assert.equal(store.chooseLane(id, 'classin'), true);
  const first = store.begin(id, 'mentor-1');
  assert.equal(first.request.endpoint, '/api/hub/sales-mentor');
  store.complete(id, 'mentor-1', advice('회사 멘토 답변'));
  assert.equal(store.chooseLane(id, 'personal'), false);
  store.setDraft(id, '후속 질문');
  assert.equal(store.begin(id, 'mentor-2').request.endpoint, '/api/hub/sales-mentor');
});

test('a preloaded all-scope answer must name its chosen mentor lane', () => {
  const store = createOfficeMentorSessionStore();
  assert.throws(() => store.open({ result: result('all'), officeSource: source, scope: 'all', initialAdvice: advice('첫 답변') }), /lane-required/);
});

test('a fresh browser-memory store cannot restore a previous consultation', () => {
  const first = createOfficeMentorSessionStore();
  const id = first.open({ result: result(), officeSource: source, scope: 'personal', initialAdvice: advice('첫 답변') });
  assert.equal(first.get(id).turns.length, 1);
  assert.equal(createOfficeMentorSessionStore().get(id), null);
});

test('invalid follow-up stays editable and does not enter pending state', () => {
  const store = createOfficeMentorSessionStore();
  const id = store.open({ result: result(), officeSource: source, scope: 'personal', initialAdvice: advice('첫 답변') });
  store.setDraft(id, '가'.repeat(1201));
  assert.equal(store.begin(id, 'too-long'), null);
  assert.equal(store.get(id).error.code, 'question-too-long');
  assert.equal(store.get(id).draft.length, 1201);
  assert.equal(store.get(id).pending, null);
});

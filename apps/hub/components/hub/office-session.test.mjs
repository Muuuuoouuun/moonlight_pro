import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeSessionStore, copyOfficeText, shouldSubmitOfficeKey, OFFICE_MINIMUM_INSTRUCTION } from './office-session.js';

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

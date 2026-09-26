'use strict';
// 봉투 → 화면 상태, 메모 저장 요청·결과 해석. 실패가 빈 목록·저장 완료로 위장되지 않는지 고정한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./envelope-view');
const M = require('./memo-model');
const C = require('../../shared/contract');

test('모든 봉투 종류가 읽기 화면 상태를 가진다', () => {
  for (const kind of C.ENVELOPE_KINDS) {
    const v = E.describeRead({ kind }, '할 일');
    assert.equal(v.state, kind);
    if (kind === 'live' || kind === 'partial') assert.equal(v.showData, true);
    else {
      assert.equal(v.showData, false, `${kind} 는 목록을 보여 주지 않는다`);
      assert.ok(v.message && v.label, `${kind} 는 이유를 말한다`);
    }
  }
  assert.equal(E.describeRead({ kind: 'partial' }).label, '일부만 확인');
  assert.equal(E.describeRead({ kind: 'preview' }).label, 'Preview · 연결 필요');
  assert.equal(E.describeRead({ kind: 'unauthorized' }).label, '로그인 필요');
  assert.equal(E.describeRead({ kind: 'unauthorized' }).action.kind, 'login');
  assert.equal(E.describeRead({ kind: 'error', error: '시간 초과' }).message, '시간 초과');
  // 허브 모델의 사유 코드는 사람이 읽는 말로 — 'server' 같은 코드를 그대로 보여 주지 않는다.
  assert.equal(E.describeRead({ kind: 'error', error: 'offline' }).message, 'Hub에 연결하지 못했어요.');
  assert.equal(E.describeWrite({ kind: 'error', error: 'server' }).message, 'Hub가 요청을 처리하지 못했어요.');
  assert.doesNotMatch(E.describeWrite({ kind: 'error', error: 'some-new-code' }).message, /some-new-code/);
  assert.equal(E.describeRead({ kind: 'error' }).action.kind, 'retry');
  assert.equal(E.describeRead(null).state, 'invalid', '봉투가 아니면 invalid');
  assert.equal(E.describeRead({ kind: 'surprise' }).state, 'invalid');
});

test('허브 로그인 미설정은 "주소 필요"가 아니다(읽기·쓰기)', () => {
  const read = E.describeRead({ kind: 'not-configured', error: 'operator-login-not-configured' }, '할 일');
  assert.equal(read.label, 'Hub 로그인 미설정');
  assert.equal(read.showData, false);
  assert.equal(E.describeRead({ kind: 'not-configured', error: 'hub-url-missing' }).label, 'Hub 주소 필요');
  const write = E.describeWrite({ kind: 'not-configured', error: 'operator-login-not-configured' }, '메모');
  assert.equal(write.ok, false);
  assert.match(write.message, /저장되지 않았어요/);
});

test('쓰기 preview 는 저장 성공이 아니다', () => {
  const w = E.describeWrite({ kind: 'preview' }, '할 일');
  assert.equal(w.ok, false);
  assert.equal(w.keepInput, true);
  assert.match(w.message, /저장되지 않았어요/);
  assert.equal(E.describeWrite({ kind: 'live' }).ok, true);
  assert.equal(E.describeWrite({ kind: 'error' }).uncertain, true);
  assert.equal(E.describeWrite({ kind: 'invalid' }).uncertain, false);
});

// 허브 모델(pet-pending)의 요약 모양 — pet-hub journal-save/journal-read 가 data.pending 으로 싣는다.
const summary = (o = {}) => ({
  hasPendingTask: false, pendingTaskTitle: null, hasPendingMemo: false, pendingMemoEntryId: null, pendingMemoRole: null,
  memoConflict: false, memoConflictId: null, memoConflictIds: [], captureConflict: false,
  savedMemoId: null, savedMemoRevision: null, savedMemoBody: null, canSaveMemoAsNew: true, ...o,
});

test('저장 요청은 본문만 싣고 빠른 캡처를 끝낸다(요청 ID·revision 은 허브 모델이 만든다)', () => {
  assert.deepEqual(M.captureRequest('메모'), { body: '메모', finish: true });
  const id = '1f0c3a52-4d0e-4c35-9d1a-3b7f5e2a9c10';
  assert.deepEqual(M.asNewRequest('메모', M.pendingFrom({ data: { pending: summary({ captureConflict: true, memoConflictId: id, memoConflict: true }) } })),
    { body: '메모', finish: true, asNew: true, entryId: id });
  assert.deepEqual(M.asNewRequest('메모', null), { body: '메모', finish: true, asNew: true });
});

test('저장 결과 해석 — 확인됐을 때만 입력을 비우고, 앞 메모 재전송·충돌·보류를 구별한다', () => {
  const req = M.captureRequest('메모');
  const saved = M.interpretSave({ kind: 'live', data: { entry: { id: 'x' }, verified: true, replayed: false, pending: summary() } }, req, '메모');
  assert.equal(saved.outcome, 'saved');
  assert.equal(saved.clearDraft, true);
  const edited = M.interpretSave({ kind: 'live', data: { verified: true, replayed: false } }, req, '메모 고침');
  assert.equal(edited.clearDraft, false, '저장 중에 고친 입력은 남긴다');
  const replayed = M.interpretSave({ kind: 'live', data: { verified: true, replayed: true, entry: { body: '앞 메모' } } }, req, '메모');
  assert.equal(replayed.outcome, 'replayed');
  assert.equal(replayed.clearDraft, false, '앞 메모를 저장했을 뿐 지금 입력은 아직');
  const conflict = M.interpretSave({ kind: 'conflict', data: { pending: summary({ captureConflict: true, memoConflict: true }) } }, req, '메모');
  assert.equal(conflict.outcome, 'conflict');
  assert.equal(conflict.pending.captureConflict, true);
  assert.match(conflict.message, /새 항목으로 Hub에 저장/);
  const held = M.interpretSave({ kind: 'error', error: 'offline', data: { pending: summary({ hasPendingMemo: true, pendingMemoRole: 'capture' }) } }, req, '메모');
  assert.equal(held.outcome, 'pending', '결과를 모르면 허브가 같은 명령을 보관한다');
  assert.equal(M.saveButtonLabel({ saving: false, pending: held.pending }), '저장 확인');
  const login = M.interpretSave({ kind: 'unauthorized', data: { pending: summary({ hasPendingMemo: true }) } }, req, '메모');
  assert.equal(login.outcome, 'pending');
  assert.equal(login.action.kind, 'login');
  const preview = M.interpretSave({ kind: 'preview', data: { pending: summary() } }, req, '메모');
  assert.equal(preview.clearDraft, false);
  assert.equal(preview.outcome, 'failed');
});

test('메모 검증·상태 문구·보관 목록', () => {
  assert.equal(M.validateBody('  ').ok, false);
  assert.equal(M.validateBody('a'.repeat(20000)).ok, true);
  assert.equal(M.validateBody('a'.repeat(20001)).ok, false);
  assert.equal(M.canSave({ draft: '', pending: { hasPendingMemo: true } }), true, '빈 입력창에서도 저장 확인은 가능');
  assert.equal(M.canSave({ draft: '', pending: null }), false);
  assert.equal(M.canSave({ draft: '글', pending: { captureConflict: true } }), false, '캡처 충돌이면 새 항목으로만');
  assert.equal(M.statusLabel({ draft: 'a', savedBody: 'a' }), 'Hub에 저장됨 · 이 PC에 보관');
  assert.equal(M.pendingFrom({ data: {} }), null);
  let list = [];
  for (let i = 0; i < 25; i += 1) list = M.pushCaptured(list, `메모 ${i}`);
  assert.equal(list.length, M.CAPTURED_MAX);
  assert.equal(list[0], '메모 24');
  list = M.pushCaptured(list, '메모 20');
  assert.equal(list[0], '메모 20');
  assert.equal(list.filter((m) => m === '메모 20').length, 1);
});

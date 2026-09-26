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
  assert.equal(E.describeRead({ kind: 'error' }).action.kind, 'retry');
  assert.equal(E.describeRead(null).state, 'invalid', '봉투가 아니면 invalid');
  assert.equal(E.describeRead({ kind: 'surprise' }).state, 'invalid');
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

let n = 0;
const uuid = () => `id-${++n}`;

test('같은 내용의 미확인 요청은 같은 requestId·entryId 로 다시 보낸다', () => {
  const first = M.requestFor('메모', null, uuid, new Date('2026-09-27T01:00:00Z'));
  assert.equal(first.expectedRevision, 0);
  assert.equal(first.occurredAt, '2026-09-27T01:00:00.000Z');
  const again = M.requestFor('메모', { memo: first }, uuid);
  assert.equal(again, first);
  const other = M.requestFor('다른 메모', { memo: first }, uuid);
  assert.notEqual(other.requestId, first.requestId);
  assert.notEqual(other.entryId, first.entryId);
});

test('저장 결과 해석 — 확인됐을 때만 입력을 비운다', () => {
  const req = M.buildSaveRequest('메모', uuid);
  const saved = M.interpretSave({ kind: 'live', data: { entry: { id: req.entryId }, verified: true } }, req, '메모');
  assert.equal(saved.outcome, 'saved');
  assert.equal(saved.clearDraft, true);
  assert.equal(saved.pendingMemo, null);
  const edited = M.interpretSave({ kind: 'live', data: { verified: true } }, req, '메모 고침');
  assert.equal(edited.clearDraft, false, '저장 중에 고친 입력은 남긴다');
  const unverified = M.interpretSave({ kind: 'live', data: { verified: false } }, req, '메모');
  assert.equal(unverified.outcome, 'unverified');
  assert.equal(unverified.pendingMemo, req);
  const conflict = M.interpretSave({ kind: 'conflict' }, req, '메모');
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.pendingMemo, null, '충돌은 자동 재시도를 멈춘다');
  assert.match(conflict.message, /새 항목으로 Hub에 저장/);
  const error = M.interpretSave({ kind: 'error' }, req, '메모');
  assert.equal(error.pendingMemo, req, '불확실하면 같은 요청을 보존');
  const preview = M.interpretSave({ kind: 'preview' }, req, '메모');
  assert.equal(preview.clearDraft, false);
  assert.equal(preview.outcome, 'failed');
});

test('메모 검증·상태 문구·보관 목록', () => {
  assert.equal(M.validateBody('  ').ok, false);
  assert.equal(M.validateBody('a'.repeat(20000)).ok, true);
  assert.equal(M.validateBody('a'.repeat(20001)).ok, false);
  assert.equal(M.saveButtonLabel({ saving: false, pending: true }), '저장 확인');
  assert.equal(M.canSave({ draft: '', pending: { body: 'x' } }), true, '빈 입력창에서도 저장 확인은 가능');
  assert.equal(M.canSave({ draft: '', pending: null }), false);
  assert.equal(M.statusLabel({ draft: 'a', savedBody: 'a' }), 'Hub에 저장됨 · 이 PC에 보관');
  let list = [];
  for (let i = 0; i < 25; i += 1) list = M.pushCaptured(list, `메모 ${i}`);
  assert.equal(list.length, M.CAPTURED_MAX);
  assert.equal(list[0], '메모 24');
  list = M.pushCaptured(list, '메모 20');
  assert.equal(list[0], '메모 20');
  assert.equal(list.filter((m) => m === '메모 20').length, 1);
  assert.equal(M.pendingKey('https://hub.example.com/dashboard'), 'petHub.pending.v1.https://hub.example.com');
  assert.equal(M.pendingKey(''), null);
});

'use strict';
// Mac OfficeChatStoreTests·OfficeChatContractTests 의 화면 규칙 이식.
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('./chat-view-model');
const C = require('../../shared/contract');

test('질문은 UTF-16 6,000자까지, 공백만은 보낼 수 없다', () => {
  assert.equal(V.LIMIT, 6000);
  assert.equal(V.canSend({ draft: 'a'.repeat(6000), busy: false }), true);
  assert.equal(V.canSend({ draft: 'a'.repeat(6001), busy: false }), false);
  assert.equal(V.canSend({ draft: '   \n', busy: false }), false);
  // 이모지 하나는 UTF-16 두 단위 — 서버·Mac 과 같은 셈법.
  assert.equal(V.length('😀'), 2);
  assert.equal(V.canSend({ draft: '😀'.repeat(3000), busy: false }), true);
  assert.equal(V.canSend({ draft: `${'😀'.repeat(3000)}a`, busy: false }), false);
  assert.equal(V.counterLabel('a'.repeat(1234)), '1,234 / 6,000');
  assert.match(V.footerNote('a'.repeat(6001)), /6,000자 이내/);
});

test('전송 중에는 보내기와 담당·범위 변경을 막는다', () => {
  assert.equal(V.canSend({ draft: '질문', busy: true }), false);
  assert.equal(V.pickerLocked(true), true);
  assert.equal(V.pickerLocked(false), false);
});

test('담당자는 캐릭터 9종과 1:1, 기본은 지금 캐릭터', () => {
  const agents = V.agents();
  assert.equal(agents.length, 9);
  assert.deepEqual(agents.map((a) => a.ownerId), C.CHARACTERS.map((c) => c.officeId));
  assert.equal(V.defaultOwner('silver'), 'glaceon');
  assert.equal(V.defaultOwner('없는키'), 'glaceon', '모르는 키는 기본 캐릭터');
  assert.equal(V.agentFor('sylveon').name, '님피아');
  assert.deepEqual(V.SCOPES.map((s) => s.value), ['all', 'classin', 'personal']);
  assert.equal(V.scopeLabel('classin'), '회사');
});

test('최근 30판만 보이고, 답을 기다리는 사이 고친 초안은 지우지 않는다', () => {
  const turns = Array.from({ length: 45 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', text: `t${i}` }));
  const shown = V.visibleTurns(turns);
  assert.equal(shown.length, 30);
  assert.equal(shown[0].id, '15');
  assert.equal(V.draftAfterSuccess('질문', '질문'), '');
  assert.equal(V.draftAfterSuccess('질문', '질문 고침'), '질문 고침');
});

test('브랜드 Council 전달은 4,000자 이내 초안만', () => {
  assert.equal(V.canHandoff('a'.repeat(4000)), true);
  assert.equal(V.canHandoff('a'.repeat(4001)), false);
  assert.equal(V.canHandoff(''), false);
  assert.equal(V.sourceLabel({ kind: 'memo' }), '현재 메모');
  assert.equal(V.sourceLabel('task'), '할 일');
  assert.equal(V.draftFromTask({ title: '  견적 검토 ' }), '견적 검토');
});

test('전송 요청 표: 중단 뒤 다시 보내면 앞 요청의 늦은 응답은 현재가 아니다', () => {
  const gate = V.createSendGate();
  const first = gate.begin();
  assert.equal(gate.isCurrent(first), true);
  gate.cancel(); // 기다림 중단
  assert.equal(gate.isCurrent(first), false);
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false, '첫 요청의 응답이 두 번째 요청의 잠금을 풀지 못한다');
  assert.equal(gate.isCurrent(second), true);
});

test('대화 잠금: busy 는 이 대화, busyWith 가 다른 대화면 보내기만 잠근다(허브 pet:chat-session 모양)', () => {
  const me = { ownerId: 'glaceon', scope: 'all' };
  assert.deepEqual(V.sessionLock({ busy: true, busyWith: { ...me, message: 'q' } }, me), { busy: true, lockedByOther: false });
  assert.deepEqual(V.sessionLock({ busy: false, busyWith: { ownerId: 'eevee', scope: 'all', message: 'q' } }, me), { busy: false, lockedByOther: true });
  assert.deepEqual(V.sessionLock({ busy: false, busyWith: null }, me), { busy: false, lockedByOther: false });
  assert.deepEqual(V.sessionLock({ busy: 'yes' }, me), { busy: false, lockedByOther: false }, 'boolean 만 믿는다');
});

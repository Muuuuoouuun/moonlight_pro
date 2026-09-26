'use strict';
// Mac Tests/HubDomainTests(storeChecks·recoveryChecks·captureChecks) 이식 — 보류 명령·충돌·재시작.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPending, sanitizePending, PENDING_PREFIX } = require('./pet-pending');
const { fail } = require('./pet-hub-client');

const ORIGIN = 'https://recover.test';

function memoryStore() {
  const map = new Map();
  return {
    map,
    get: (key) => (map.has(key) ? JSON.parse(map.get(key)) : null),
    set: (key, value) => { map.set(key, JSON.stringify(value)); },
  };
}

// Mac ControlledHub 대역 — 허브 쪽 상태를 흉내 내며 호출을 기록한다.
function controlledHub() {
  const hub = {
    creates: [], saves: [], savedMemo: null, confirmedTask: null,
    failCreateOnce: false, conflictCreateOnce: false, failMemoOnce: false, memoConflict: false, holdCreate: null,
    async createTask(command) {
      hub.creates.push(JSON.parse(JSON.stringify(command)));
      if (hub.holdCreate) await hub.holdCreate;
      if (hub.conflictCreateOnce) { hub.conflictCreateOnce = false; throw fail('conflict', 'conflict', 409); }
      if (hub.failCreateOnce) { hub.failCreateOnce = false; throw fail('error', 'timeout'); }
      return { id: command.id, title: command.title, status: 'todo', updatedAt: '2026-09-25T01:00:00Z' };
    },
    async tasks() {
      return { tasks: hub.confirmedTask ? [hub.confirmedTask] : [], partial: false };
    },
    confirmCreatedElsewhere() {
      const command = hub.creates[hub.creates.length - 1];
      hub.confirmedTask = { id: command.id, title: 'Hub에서 바꾼 제목', status: 'done', updatedAt: '2026-09-25T03:00:00Z' };
      hub.conflictCreateOnce = true;
    },
    async memo() {
      if (!hub.savedMemo) throw fail('error', 'save-not-verified');
      return { ...hub.savedMemo };
    },
    async saveMemo(command) {
      hub.saves.push(JSON.parse(JSON.stringify(command)));
      if (hub.memoConflict) throw fail('conflict', 'memo-conflict');
      if (hub.failMemoOnce) { hub.failMemoOnce = false; throw fail('error', 'timeout'); }
      hub.savedMemo = {
        id: command.entryId, body: command.body, title: command.title, occurredAt: command.occurredAt,
        revision: command.expectedRevision + 1, noteMeta: command.noteMeta, contexts: command.contexts,
      };
      return { ...hub.savedMemo };
    },
    changeMemoElsewhere() {
      hub.savedMemo = { ...hub.savedMemo, body: 'Hub에서 수정', revision: hub.savedMemo.revision + 1 };
    },
  };
  return hub;
}

async function open(api, store, origin = ORIGIN) {
  const pending = createPending({ api, store, origin });
  await pending.load();
  return pending;
}

test('불확실한 생성은 재시작 뒤에도 같은 명령으로만 재시도, 확인된 제목을 돌려준다', async () => {
  const api = controlledHub();
  const store = memoryStore();
  const first = await open(api, store);
  api.failCreateOnce = true;
  await assert.rejects(first.addTask({ title: '첫 입력' }), (e) => e.error === 'timeout');
  assert.equal(first.summary().hasPendingTask, true);
  assert.ok(store.map.has(PENDING_PREFIX + ORIGIN));
  const reopened = await open(api, store);
  const result = await reopened.addTask({ title: '' });
  assert.equal(api.creates.length, 2);
  assert.deepEqual(api.creates[0], api.creates[1]);
  assert.equal(result.title, '첫 입력');
  assert.equal(result.replayed, true);
  assert.equal(reopened.summary().hasPendingTask, false);
});

test('새 입력은 확인되지 않은 이전 할 일을 앞지르지 않는다', async () => {
  const api = controlledHub();
  const pending = await open(api, memoryStore());
  api.failCreateOnce = true;
  await assert.rejects(pending.addTask({ title: '이전 입력' }));
  const result = await pending.addTask({ title: '새 입력' });
  assert.equal(result.title, '이전 입력');
  assert.equal(result.replayed, true);
  assert.deepEqual(api.creates.map((c) => c.title), ['이전 입력', '이전 입력']);
  const next = await pending.addTask({ title: '새 입력' });
  assert.equal(next.title, '새 입력');
  assert.equal(next.replayed, false);
  assert.notEqual(api.creates[2].id, api.creates[0].id);
});

test('렌더러가 준 안정 UUID 를 쓰고, 제목 1–300자만 받는다', async () => {
  const api = controlledHub();
  const pending = await open(api, memoryStore());
  const id = randomUUID().toUpperCase();
  const result = await pending.addTask({ title: '  안정 id  ', id });
  assert.equal(result.task.id, id.toLowerCase());
  assert.equal(api.creates[0].title, '안정 id');
  await assert.rejects(pending.addTask({ title: '   ' }), (e) => e.error === 'invalid-input');
  await assert.rejects(pending.addTask({ title: 'x'.repeat(301) }), (e) => e.error === 'invalid-input');
  assert.equal(api.creates.length, 1);
});

test('409 뒤 같은 id 가 이미 Hub 에 있으면 원격 변경을 되돌리지 않고 확인으로 끝낸다', async () => {
  const api = controlledHub();
  const pending = await open(api, memoryStore());
  api.failCreateOnce = true;
  await assert.rejects(pending.addTask({ title: '생성 직후 수정' }));
  api.confirmCreatedElsewhere();
  const recovered = await pending.addTask({ title: '' });
  assert.equal(recovered.title, '생성 직후 수정');
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.task.title, 'Hub에서 바꾼 제목');
  assert.equal(recovered.task.status, 'done');
  assert.equal(pending.summary().hasPendingTask, false);
});

test('할 일 저장은 한 번에 하나', async () => {
  const api = controlledHub();
  const pending = await open(api, memoryStore());
  let release;
  api.holdCreate = new Promise((resolve) => { release = resolve; });
  const first = pending.addTask({ title: '하나' });
  await assert.rejects(pending.addTask({ title: '둘' }), (e) => e.error === 'busy');
  release();
  await first;
  assert.equal(api.creates.length, 1);
});

test('메모: 확인 안 된 저장은 새 입력보다 먼저, 이후 저장은 새 requestId + 현재 revision', async () => {
  const api = controlledHub();
  const store = memoryStore();
  const pending = await open(api, store);
  api.failMemoOnce = true;
  await assert.rejects(pending.saveMemo({ body: '첫 메모' }));
  assert.equal(pending.summary().hasPendingMemo, true);
  const retried = await pending.saveMemo({ body: '' });
  assert.equal(retried.entry.body, '첫 메모');
  assert.equal(retried.replayed, true);
  assert.equal(api.saves.length, 2);
  assert.deepEqual(api.saves[0], api.saves[1]);
  assert.equal(pending.summary().savedMemoBody, '첫 메모');
  await pending.saveMemo({ body: '더 새로운 메모' });
  assert.equal(api.saves.length, 3);
  assert.equal(api.saves[2].entryId, api.saves[1].entryId);
  assert.notEqual(api.saves[2].requestId, api.saves[1].requestId);
  assert.equal(api.saves[2].expectedRevision, 1);
});

test('메모: 같은 본문이면 쓰지 않고, Hub 에서 바뀌었으면 덮어쓰지 않는다', async () => {
  const api = controlledHub();
  const pending = await open(api, memoryStore());
  await pending.saveMemo({ body: '원문' });
  const same = await pending.saveMemo({ body: '원문' });
  assert.equal(same.unchanged, true);
  assert.equal(api.saves.length, 1);
  api.changeMemoElsewhere();
  await assert.rejects(pending.saveMemo({ body: '로컬 수정' }), (e) => e.kind === 'conflict');
  assert.equal(api.saves.length, 1);
  assert.equal(pending.summary().memoConflict, true);
});

test('충돌 확인 뒤: 재전송 금지(재시작 포함), 새 항목으로만 복구', async () => {
  const api = controlledHub();
  const store = memoryStore();
  const pending = await open(api, store);
  await pending.saveMemo({ body: '원본' });
  await assert.rejects(pending.saveMemo({ body: 'x'.repeat(20001), asNew: true }), (e) => e.error === 'invalid-input');
  assert.equal(pending.summary().savedMemoBody, '원본', '잘못된 새 입력은 기존 연결을 끊지 않는다');
  await pending.saveMemo({ body: '수정' });
  assert.equal(api.saves.length, 2);
  assert.equal(api.saves[0].entryId, api.saves[1].entryId);
  api.memoConflict = true;
  await assert.rejects(pending.saveMemo({ body: '유실 응답 이후 로컬 입력' }), (e) => e.kind === 'conflict');
  assert.equal(pending.summary().hasPendingMemo, false);
  assert.equal(pending.summary().canSaveMemoAsNew, true);
  const before = api.saves.length;
  await assert.rejects(pending.saveMemo({ body: '유실 응답 이후 로컬 입력' }), (e) => e.error === 'memo-conflict');
  assert.equal(api.saves.length, before);
  const reopened = await open(api, store);
  await assert.rejects(reopened.saveMemo({ body: '유실 응답 이후 로컬 입력' }), (e) => e.error === 'memo-conflict');
  assert.equal(api.saves.length, before);
  api.memoConflict = false;
  const recovered = await reopened.saveMemo({ body: '사용자가 새 항목으로 선택', asNew: true });
  assert.equal(recovered.entry.body, '사용자가 새 항목으로 선택');
  assert.notEqual(recovered.entry.id, api.saves[0].entryId);
  assert.equal(reopened.summary().savedMemoBody, '사용자가 새 항목으로 선택');
  assert.equal(reopened.summary().memoConflict, false);
});

test('빠른 캡처: 확인된 메모는 끝나고 다음 입력은 새 id (재시작 뒤에도)', async () => {
  const api = controlledHub();
  const store = memoryStore();
  const pending = await open(api, store);
  api.failMemoOnce = true;
  await assert.rejects(pending.saveMemo({ body: '이전 메모' }));
  const receipt = await pending.saveMemo({ body: '새로 작성한 메모' });
  assert.equal(receipt.entry.body, '이전 메모', '재시도는 이전 본문을 확인할 뿐 새 입력을 인정하지 않는다');
  assert.equal(pending.finishMemoCapture(receipt.entry), true);
  const next = await pending.saveMemo({ body: '새로 작성한 메모', finish: true });
  assert.notEqual(next.entry.id, receipt.entry.id);
  assert.equal(pending.summary().savedMemoId, null);
  const reopened = await open(api, store);
  const third = await reopened.saveMemo({ body: '다음 실행에서 작성' });
  assert.notEqual(third.entry.id, next.entry.id);
});

test('렌더러가 읽어 둔 기존 메모를 고치면 revision 을 다시 확인하고 메타를 보존한다', async () => {
  const api = controlledHub();
  const id = randomUUID();
  api.savedMemo = { id, body: '기존', title: '제목', occurredAt: '2026-09-24T00:00:00Z', revision: 3, noteMeta: { kind: 'idea', tags: ['a'] }, contexts: [] };
  const pending = await open(api, memoryStore());
  await assert.rejects(pending.saveMemo({ body: '수정', entryId: id, expectedRevision: 2 }), (e) => e.kind === 'conflict');
  const fresh = await open(api, memoryStore(), 'https://other.test');
  const saved = await fresh.saveMemo({ body: '수정', entryId: id, expectedRevision: 3 });
  assert.equal(saved.entry.revision, 4);
  assert.deepEqual(api.saves[0].noteMeta, { kind: 'idea', tags: ['a'] });
  assert.equal(api.saves[0].title, '제목');
});

test('origin 마다 따로 보관하고, 모양이 틀린 저장값은 버린다', async () => {
  const api = controlledHub();
  const store = memoryStore();
  const one = await open(api, store, 'https://one.test');
  api.failCreateOnce = true;
  await assert.rejects(one.addTask({ title: '한 곳' }));
  const two = await open(api, store, 'https://two.test');
  assert.equal(two.summary().hasPendingTask, false);
  assert.deepEqual(sanitizePending({ task: { id: 'nope', title: 'x' }, memo: { action: 'drop' }, memoConflict: 'yes' }),
    { task: null, memo: null, savedMemo: null, memoConflict: false });
});

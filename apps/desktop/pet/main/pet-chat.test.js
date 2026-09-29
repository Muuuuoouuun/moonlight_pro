'use strict';
// Mac Tests/OfficeChatStoreTests 이식 + Windows 규칙(보내는 동안 담당·범위 잠금, 안 보는 대화의 답 → 알림).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChat, buildHistory, prefixUtf16 } = require('./pet-chat');
const { fail } = require('./pet-hub-client');

// 답을 테스트가 직접 풀어 주는 Office 대역(Mac ChatGate).
function chatGate() {
  const gate = {
    commands: [],
    signals: [],
    waiters: [],
    officeChat(command, options) {
      gate.commands.push(JSON.parse(JSON.stringify(command)));
      gate.signals.push(options && options.signal);
      return new Promise((resolve, reject) => gate.waiters.push({ resolve, reject }));
    },
    finish(answer = '검토한 답변') {
      gate.waiters.shift().resolve({ answer, nextAction: '다음 단계 확인', contextNote: '입력 내용 기준', contextSource: 'provided', persisted: false, runId: null });
    },
    failNext(error = fail('error', 'timeout')) {
      gate.waiters.shift().reject(error);
    },
  };
  return gate;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

function replyRecorder() {
  const replies = [];
  return { replies, activity: { addAgentReply: (n) => replies.push(n) } };
}

test('한 번에 하나, 보낸 담당의 대화에만 기록, 기다리는 동안 고친 초안은 지킨다', async () => {
  const api = chatGate();
  const chat = createChat({ uuid: (() => { let i = 0; return () => `turn-${++i}`; })() });
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'vaporeon', scope: 'personal' };
  chat.session({ ...who, draft: '질문 원문' });
  const sending = chat.send({ ...who, message: '질문 원문' });
  await tick();
  assert.equal(api.commands.length, 1);
  assert.deepEqual(chat.busy(), { ...who, message: '질문 원문' });
  const duplicate = await chat.send({ ...who, message: '중복 클릭' });
  assert.equal(duplicate.error, 'busy');
  chat.session({ ...who, draft: '질문 원문\n' });
  api.finish();
  const result = await sending;
  assert.equal(result.kind, 'live');
  assert.equal(result.data.turn.role, 'assistant');
  assert.equal(result.data.turn.text, '검토한 답변');
  assert.equal(result.data.userTurn.text, '질문 원문');
  const session = chat.session(who);
  assert.equal(session.turns.length, 2);
  assert.equal(session.draft, '질문 원문\n', '기다리는 동안 한 줄바꿈 편집은 남는다');
  assert.equal(chat.busy(), null);
});

test('범위·담당별로 대화와 초안이 갈리고 메모리에서 이어진다', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://one.example' });
  const personal = { ownerId: 'vaporeon', scope: 'personal' };
  const sending = chat.send({ ...personal, message: '질문' });
  await tick();
  api.finish();
  await sending;
  chat.session({ ...personal, draft: '개인 초안' });
  const classin = chat.session({ ownerId: 'vaporeon', scope: 'classin' });
  assert.deepEqual([classin.turns.length, classin.draft], [0, '']);
  chat.session({ ownerId: 'vaporeon', scope: 'classin', draft: '회사 질문' });
  const back = chat.session(personal);
  assert.deepEqual([back.turns.length, back.draft], [2, '개인 초안']);
  assert.equal(chat.session({ ownerId: 'eevee', scope: 'personal' }).draft, '');
});

test('시간 초과는 답도 영수증도 아니고, 완료된 대화는 남는다(자동 재시도 없음)', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'vaporeon', scope: 'personal' };
  const ok = chat.send({ ...who, message: '첫 질문' });
  await tick();
  api.finish();
  await ok;
  const failed = chat.send({ ...who, message: '보존할 질문' });
  await tick();
  api.failNext();
  const result = await failed;
  assert.equal(result.kind, 'error');
  assert.equal(result.error, 'timeout');
  assert.equal(api.commands.length, 2);
  const session = chat.session(who);
  assert.equal(session.turns.length, 2);
  assert.equal(session.error, 'timeout');
});

test('기다림 중단 뒤 늦은 답은 버리고, 다시 보내면 새 요청', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'espeon', scope: 'all' };
  const canceled = chat.send({ ...who, message: '기다림 중단' });
  await tick();
  assert.equal(api.signals[0].aborted, false);
  assert.equal(chat.cancel(), true);
  assert.equal(api.signals[0].aborted, true, 'AbortSignal 로 실제 요청을 끊는다');
  api.finish('늦은 답');
  const result = await canceled;
  assert.equal(result.error, 'cancelled');
  assert.equal(chat.busy(), null);
  assert.equal(chat.session(who).turns.length, 0);
  const again = chat.send({ ...who, message: '기다림 중단' });
  await tick();
  assert.equal(api.commands.length, 2);
  api.finish();
  assert.equal((await again).kind, 'live');
});

test('origin 이 바뀌면 진행 중 답은 버려지고 대화·초안이 섞이지 않는다', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'vaporeon', scope: 'personal' };
  chat.session({ ...who, draft: '첫 허브 초안' });
  const late = chat.send({ ...who, message: '이전 허브 질문' });
  await tick();
  chat.configure({ service: api, origin: 'https://two.example' });
  api.finish();
  assert.equal((await late).error, 'cancelled');
  const other = chat.session(who);
  assert.deepEqual([other.turns.length, other.draft], [0, '']);
  chat.configure({ service: api, origin: 'https://one.example' });
  assert.equal(chat.session(who).draft, '첫 허브 초안');
});

test('보낸 그대로 남은 초안만 확인된 답 뒤에 지운다(앞뒤 공백 포함 비교)', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://two.example' });
  const who = { ownerId: 'glaceon', scope: 'classin' };
  chat.session({ ...who, draft: '  보낼 질문  ' });
  const sending = chat.send({ ...who, message: '  보낼 질문  ' });
  await tick();
  assert.equal(api.commands[0].message, '보낼 질문', '서버에는 다듬은 질문');
  api.finish();
  await sending;
  assert.equal(chat.session(who).draft, '');
});

test('입력 한도·연결 없음은 보내지 않는다', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'eevee', scope: 'all' };
  assert.equal((await chat.send({ ...who, message: '😀'.repeat(3001) })).error, 'invalid-input');
  assert.equal((await chat.send({ ...who, message: ' \n' })).error, 'invalid-input');
  assert.equal((await chat.send({ ownerId: 'pikachu', scope: 'all', message: '질문' })).error, 'invalid-input');
  chat.configure({ service: null, origin: null });
  const offline = await chat.send({ ...who, message: '연결 없는 질문' });
  assert.equal(offline.kind, 'not-configured');
  assert.equal(api.commands.length, 0);
});

test('문맥은 최근 4왕복, 각 2000 UTF-16(서로게이트 보존), JSON 20000 이하', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'umbreon', scope: 'all' };
  for (let i = 0; i < 6; i += 1) {
    const sending = chat.send({ ...who, message: `질문 ${i}` });
    await tick();
    api.finish(`답 ${i}`);
    await sending;
  }
  const sending = chat.send({ ...who, message: '다음' });
  await tick();
  const history = api.commands[6].history;
  assert.equal(history.length, 8);
  assert.deepEqual(history.slice(0, 2), [{ role: 'user', text: '질문 2' }, { role: 'assistant', text: '답 2' }]);
  api.finish();
  await sending;

  assert.equal(prefixUtf16('😀'.repeat(1500)).length, 2000);
  assert.equal(prefixUtf16(`a${'😀'.repeat(1500)}`).length, 1999, '서로게이트 쌍을 자르지 않는다');
  const long = Array.from({ length: 4 }, (_, i) => ({ message: `"${'\\'.repeat(1990)}${i}`, reply: { answer: '\u0001'.repeat(1990) } }));
  const trimmed = buildHistory(long);
  assert.ok(JSON.stringify(trimmed).length <= 20000);
  assert.ok(trimmed.length < 8 && trimmed.length % 2 === 0);
});

test('화면에는 최근 30왕복까지만', async () => {
  const api = chatGate();
  const chat = createChat();
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'leafeon', scope: 'personal' };
  for (let i = 0; i < 32; i += 1) {
    const sending = chat.send({ ...who, message: `질문 ${i}` });
    await tick();
    api.finish();
    await sending;
  }
  const turns = chat.session(who).turns;
  assert.equal(turns.length, 60);
  assert.equal(turns[0].text, '질문 2');
});

test('보고 있지 않은 대화에 온 답은 알림으로, 보고 있으면 알림 없이 이벤트만', async () => {
  const api = chatGate();
  const { replies, activity } = replyRecorder();
  const events = [];
  const chat = createChat({ activity, onReply: (p) => events.push(p), characterName: () => '님피아' });
  chat.configure({ service: api, origin: 'https://one.example' });
  const who = { ownerId: 'sylveon', scope: 'personal' };
  chat.view(who);
  let sending = chat.send({ ...who, message: '보는 중' });
  await tick();
  api.finish();
  await sending;
  assert.equal(replies.length, 0);
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].ownerId, events[0].scope, events[0].turn.role], ['sylveon', 'personal', 'assistant']);
  chat.clearViewing();
  sending = chat.send({ ...who, message: '창을 접은 뒤' });
  await tick();
  api.finish('접은 뒤 도착한 답');
  await sending;
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ownerId, 'sylveon');
  assert.equal(replies[0].scope, 'personal');
  assert.equal(replies[0].title, '님피아의 답변 · 개인');
  assert.equal(replies[0].body, '접은 뒤 도착한 답');
  assert.equal(events.length, 2);
});

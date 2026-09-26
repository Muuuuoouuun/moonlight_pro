'use strict';
// Moonlight Pet — Office 담당 에이전트 즉시 대화(Mac OfficeChatStore 이식).
//   - 대화는 허브 origin · 담당(ownerId) · 범위(scope)별로 메모리에만. 미전송 초안도 같은 키로 보관.
//   - 한 번에 요청 하나. 보내는 동안 담당·범위는 잠긴다(다른 대화로 섞이지 않는다).
//   - 자동 재시도 없음. 취소하면 늦게 온 답은 버리고, 다시 보내기는 새 요청이다.
//   - 화면에 30왕복까지, 문맥은 최근 4왕복(각 2000 UTF-16, JSON 20000 이하)만 보낸다.
//   - 보고 있지 않은 대화에 답이 오면 activity 에 'reply' 알림을 남긴다.

const { randomUUID } = require('node:crypto');
const { LIMITS } = require('../shared/contract');
const { fail, okEnvelope, errorEnvelope } = require('./pet-hub-client');
const { OFFICE_OWNERS, CHAT_SCOPES } = require('./pet-hub-api');

const HISTORY_EXCHANGES = LIMITS.chatHistoryItems / 2;
const SCOPE_TITLE = Object.freeze({ all: '전체', classin: '회사', personal: '개인' });

// 서로게이트 쌍을 자르지 않고 UTF-16 예산 안에서 앞부분만.
function prefixUtf16(text, limit = LIMITS.chatHistoryItemChars) {
  let out = '';
  for (const ch of String(text).trim()) {
    if (out.length + ch.length > limit) break;
    out += ch;
  }
  return out;
}

// 최근 4왕복 → history. JSON 이 20000 을 넘으면 앞에서 한 왕복씩 뺀다.
function buildHistory(exchanges) {
  let history = exchanges.slice(-HISTORY_EXCHANGES).flatMap((x) => [
    { role: 'user', text: prefixUtf16(x.message) },
    { role: 'assistant', text: prefixUtf16(x.reply.answer) },
  ]);
  while (history.length && JSON.stringify(history).length > LIMITS.chatHistoryJson) history = history.slice(Math.min(2, history.length));
  return history;
}

const sessionKey = (origin, ownerId, scope) => `${origin}\n${ownerId}\n${scope}`;

function userTurn(x) {
  return { id: `${x.id}:user`, role: 'user', text: x.message, at: x.at };
}
function assistantTurn(x) {
  return {
    id: x.id, role: 'assistant', text: x.reply.answer, nextAction: x.reply.nextAction, contextNote: x.reply.contextNote,
    at: x.repliedAt, runId: x.reply.runId, persisted: x.reply.persisted,
  };
}

// options: { now, uuid, activity, onReply({ownerId, scope, turn}), characterName(ownerId) }
function createChat(options = {}) {
  const clock = options.now || Date.now;
  const uuid = options.uuid || randomUUID;
  const activity = options.activity || null;
  const onReply = typeof options.onReply === 'function' ? options.onReply : null;
  const nameOf = typeof options.characterName === 'function' ? options.characterName : (id) => id;
  const sessions = new Map();
  let api = null;
  let origin = null;
  let generation = 0;
  let controller = null;
  let sending = null;
  let viewing = null;

  const iso = () => new Date(clock()).toISOString();
  function sessionFor(key) {
    let s = sessions.get(key);
    if (!s) {
      s = { exchanges: [], draft: '', error: null };
      sessions.set(key, s);
    }
    return s;
  }
  const validTarget = (ownerId, scope) => OFFICE_OWNERS.includes(ownerId) && CHAT_SCOPES.includes(scope);
  const busyInfo = () => (sending ? { ownerId: sending.ownerId, scope: sending.scope, message: sending.message } : null);

  function invalidate() {
    generation += 1;
    if (controller) controller.abort();
    controller = null;
    sending = null;
  }

  // 연결 변경 — 진행 중 요청을 무효로 한다. 대화는 origin 키로 갈라져 섞이지 않는다.
  function configure({ service = null, origin: nextOrigin = null } = {}) {
    invalidate();
    api = service;
    origin = nextOrigin;
    viewing = null;
  }

  function view({ ownerId, scope } = {}) {
    if (!origin || !validTarget(ownerId, scope)) return null;
    viewing = sessionKey(origin, ownerId, scope);
    return viewing;
  }
  function clearViewing() {
    viewing = null;
  }

  // draft 가 문자열이면 그 대화의 미전송 초안으로 저장한다.
  function session({ ownerId, scope, draft } = {}) {
    if (!validTarget(ownerId, scope)) throw fail('error', 'invalid-input');
    if (!origin) throw fail('not-configured', 'hub-url-missing');
    const key = sessionKey(origin, ownerId, scope);
    const s = sessionFor(key);
    if (typeof draft === 'string') s.draft = draft;
    return {
      turns: s.exchanges.flatMap((x) => [userTurn(x), assistantTurn(x)]),
      draft: s.draft,
      busy: busyInfo(),
      sending: Boolean(sending && sending.key === key),
      error: s.error,
    };
  }

  // 반환: 봉투. 성공 data = { turn, userTurn }
  async function send({ ownerId, scope, message } = {}) {
    if (!api || !origin) return errorEnvelope(fail('not-configured', 'hub-url-missing'));
    if (!validTarget(ownerId, scope)) return errorEnvelope(fail('error', 'invalid-input'));
    if (sending) return errorEnvelope(fail('error', 'busy'));
    const raw = typeof message === 'string' ? message : '';
    const value = raw.trim();
    if (!value || raw.length > LIMITS.chatMessage) return errorEnvelope(fail('error', 'invalid-input'));
    const key = sessionKey(origin, ownerId, scope);
    const s = sessionFor(key);
    const history = buildHistory(s.exchanges);
    const ticket = generation;
    const service = api;
    controller = new AbortController();
    sending = { key, ownerId, scope, message: value };
    s.error = null;
    const sentAt = iso();
    try {
      const reply = await service.officeChat({ ownerId, scope, message: value, history }, { signal: controller.signal });
      if (ticket !== generation) return errorEnvelope(fail('error', 'cancelled'));
      const exchange = { id: uuid(), message: value, reply, at: sentAt, repliedAt: iso() };
      s.exchanges.push(exchange);
      if (s.exchanges.length > LIMITS.chatShownTurns) s.exchanges.splice(0, s.exchanges.length - LIMITS.chatShownTurns);
      // 보낸 그대로 남아 있는 초안만 지운다 — 기다리는 동안 고친 글(공백 포함)은 그대로 둔다.
      if (s.draft === raw) s.draft = '';
      const turn = assistantTurn(exchange);
      if (onReply) {
        try {
          onReply({ ownerId, scope, turn });
        } catch {
          // 이벤트 전달 실패는 대화 기록을 되돌리지 않는다.
        }
      }
      if (activity && viewing !== key) {
        activity.addAgentReply({
          id: exchange.id, ownerId, scope, title: `${nameOf(ownerId)}의 답변 · ${SCOPE_TITLE[scope]}`,
          body: prefixUtf16(reply.answer, 120), at: exchange.repliedAt,
        });
      }
      return okEnvelope('live', { turn, userTurn: userTurn(exchange) });
    } catch (error) {
      if (ticket !== generation) return errorEnvelope(fail('error', 'cancelled'));
      const envelope = errorEnvelope(error);
      s.error = envelope.error;
      return envelope;
    } finally {
      if (ticket === generation) {
        sending = null;
        controller = null;
      }
    }
  }

  // 기다림 중단. 늦게 오는 답은 버린다. 입력(초안)은 그대로.
  function cancel() {
    if (!sending) return false;
    const key = sending.key;
    invalidate();
    const s = sessions.get(key);
    if (s) s.error = 'cancelled';
    return true;
  }

  function clear({ ownerId, scope } = {}) {
    if (sending || !origin || !validTarget(ownerId, scope)) return false;
    const s = sessionFor(sessionKey(origin, ownerId, scope));
    s.exchanges = [];
    s.error = null;
    return true;
  }

  return { configure, session, send, cancel, clear, view, clearViewing, busy: busyInfo, viewingKey: () => viewing };
}

module.exports = { createChat, buildHistory, prefixUtf16, sessionKey };

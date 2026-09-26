// Council(담당 Office 대화) 화면의 순수 규칙 — 6,000자 제한(UTF-16), 전송 가능 판정, 전송 중 잠금,
// 최근 30판 표시, 담당·범위 목록. 길이는 JS 문자열 길이(UTF-16 코드 단위)가 서버·Mac 과 같은 단위다.
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const api = factory(C);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).chat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const LIMIT = C.LIMITS.chatMessage;
  const SHOWN = C.LIMITS.chatShownTurns;
  const HANDOFF_LIMIT = C.LIMITS.councilDraft;
  const SCOPES = Object.freeze([
    Object.freeze({ value: 'all', label: '전체' }),
    Object.freeze({ value: 'classin', label: '회사' }),
    Object.freeze({ value: 'personal', label: '개인' }),
  ]);
  const SOURCE_LABEL = Object.freeze({ text: '직접 입력', memo: '현재 메모', task: '할 일' });

  const length = (text) => String(text == null ? '' : text).length;
  const fmt = (n) => Number(n).toLocaleString('en-US');

  function counterLabel(draft) { return `${fmt(length(draft))} / ${fmt(LIMIT)}`; }
  function overLimit(draft) { return length(draft) > LIMIT; }

  function canSend({ draft, busy }) {
    const text = String(draft == null ? '' : draft);
    return !busy && text.trim().length > 0 && text.length <= LIMIT;
  }

  function canHandoff(draft) {
    const text = String(draft == null ? '' : draft);
    return text.trim().length > 0 && text.length <= HANDOFF_LIMIT;
  }

  // 담당자 목록은 계약의 캐릭터 9종(Office 담당자와 1:1)에서 만든다.
  function agents() {
    return C.CHARACTERS.map((c) => ({ ownerId: c.officeId, name: c.name, role: c.role, key: c.key }));
  }
  function agentFor(ownerId) {
    return agents().find((a) => a.ownerId === ownerId) || null;
  }
  function defaultOwner(characterKey) { return C.characterByKey(characterKey).officeId; }
  function scopeLabel(scope) { const s = SCOPES.find((x) => x.value === scope); return s ? s.label : '전체'; }
  function isScope(scope) { return SCOPES.some((s) => s.value === scope); }

  // 전송 중에는 담당·범위를 바꿀 수 없다(바꾸려면 먼저 기다림 중단).
  function pickerLocked(busy) { return !!busy; }

  function visibleTurns(turns) {
    const list = Array.isArray(turns) ? turns.filter((t) => t && typeof t.text === 'string') : [];
    return list.slice(-SHOWN);
  }

  // 답변이 오는 사이 사용자가 초안을 고쳤으면 지우지 않는다.
  function draftAfterSuccess(sent, current) { return current === sent ? '' : current; }

  function footerNote(draft) {
    return overLimit(draft) ? `질문은 ${fmt(LIMIT)}자 이내로 적어 주세요.` : '대화·초안은 앱 실행 중 유지';
  }

  function sourceLabel(source) {
    const kind = source && typeof source === 'object' ? source.kind : source;
    return SOURCE_LABEL[kind] || SOURCE_LABEL.text;
  }

  // 할 일·메모에서 안건을 가져올 때의 초안. 원문은 바꾸지 않고 복사한다.
  function draftFromTask(task) { return String((task && task.title) || '').trim(); }
  function draftFromMemo(memo) { return String(memo || '').trim(); }

  function sameSession(a, b) { return !!a && !!b && a.ownerId === b.ownerId && a.scope === b.scope; }

  return {
    LIMIT, SHOWN, HANDOFF_LIMIT, SCOPES,
    length, counterLabel, overLimit, canSend, canHandoff, agents, agentFor, defaultOwner, scopeLabel, isScope,
    pickerLocked, visibleTurns, draftAfterSuccess, footerNote, sourceLabel, draftFromTask, draftFromMemo, sameSession,
  };
});

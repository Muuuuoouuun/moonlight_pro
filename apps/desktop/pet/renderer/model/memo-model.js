// 빠른 메모의 순수 규칙 — 저장 요청 만들기(재시도는 같은 requestId·entryId), 결과 해석, 상태 문구,
// 저장한 메모 보관 목록. 입력은 매 키 입력마다 로컬(petPreview.memo)에 남고, Hub 저장은 명시적 동작이다.
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const E = typeof require === 'function' ? require('./envelope-view.js') : root.PetModel.envelope;
  const api = factory(C, E);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).memo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, E) {
  const MAX_BODY = C.LIMITS.memoBody;
  const CAPTURED_MAX = 20;

  function validateBody(text) {
    const body = String(text == null ? '' : text);
    const trimmed = body.trim();
    if (!trimmed.length || body.length > MAX_BODY) {
      return { ok: false, error: `메모는 1~${MAX_BODY.toLocaleString('en-US')}자로 적어 주세요.` };
    }
    return { ok: true, error: null };
  }

  // 새 메모는 새 entryId·requestId·revision 0. uuid 는 주입한다(브라우저는 crypto.randomUUID).
  function buildSaveRequest(body, uuid, now) {
    const id = uuid || (() => globalThis.crypto.randomUUID());
    return {
      requestId: id(),
      entryId: id(),
      expectedRevision: 0,
      body,
      title: '',
      occurredAt: (now || new Date()).toISOString(),
    };
  }

  // 같은 내용의 불확실한 요청이 남아 있으면 그 요청을 그대로 다시 보낸다(서버가 중복을 가린다).
  function requestFor(body, pending, uuid, now) {
    if (pending && pending.memo && pending.memo.body === body) return pending.memo;
    return buildSaveRequest(body, uuid, now);
  }

  // 결과 해석. clearDraft: 서버가 확인했고 보내는 사이 입력이 바뀌지 않았을 때만.
  function interpretSave(result, request, currentDraft) {
    const w = E.describeWrite(result, '메모');
    const data = (result && result.data) || {};
    if (w.ok && data.verified === true) {
      return {
        outcome: 'saved', clearDraft: currentDraft === request.body, pendingMemo: null, conflict: false,
        savedEntry: data.entry || null, message: null, label: null,
      };
    }
    if (w.ok) {
      return {
        outcome: 'unverified', clearDraft: false, pendingMemo: request, conflict: false, savedEntry: null,
        label: '저장 확인 필요', message: '저장 결과 확인이 필요해요. 같은 요청으로 다시 확인할 수 있어요.',
      };
    }
    if (w.kind === 'conflict') {
      return {
        outcome: 'conflict', clearDraft: false, pendingMemo: null, conflict: true, savedEntry: null,
        label: w.label, message: '다른 곳에서 먼저 바뀌어 덮어쓰지 않았어요. 더보기의 ‘새 항목으로 Hub에 저장’으로 남길 수 있어요.',
      };
    }
    return {
      outcome: w.uncertain ? 'unverified' : 'failed', clearDraft: false,
      pendingMemo: w.uncertain ? request : null, conflict: false, savedEntry: null,
      label: w.label, message: w.message, action: w.action,
    };
  }

  function saveButtonLabel({ saving, pending }) {
    if (saving) return '저장 중…';
    if (pending) return '저장 확인';
    return 'Hub에 저장';
  }

  function statusLabel({ saving, draft, savedBody }) {
    if (saving) return '이 PC에 보관 · Hub 저장 중…';
    if (savedBody != null && savedBody === draft && draft) return 'Hub에 저장됨 · 이 PC에 보관';
    return draft ? '이 PC에 자동 저장됨' : '이 PC에 자동 저장';
  }

  function canSave({ saving, draft, pending }) {
    if (saving) return false;
    if (pending) return true;
    return String(draft || '').trim().length > 0;
  }

  function pushCaptured(list, body) {
    const text = String(body || '');
    if (!text.trim()) return Array.isArray(list) ? list.slice(0, CAPTURED_MAX) : [];
    const rest = (Array.isArray(list) ? list : []).filter((m) => typeof m === 'string' && m !== text);
    return [text].concat(rest).slice(0, CAPTURED_MAX);
  }

  function capturedLabel(body) {
    const line = String(body || '').replace(/\s+/g, ' ').trim();
    return line.length > 32 ? `${line.slice(0, 32)}…` : line;
  }

  // petHub.pending.v1.<origin> — origin 별로 미확인 요청을 나눠 보관한다.
  function pendingKey(hubUrl) {
    try { return `petHub.pending.v1.${new URL(hubUrl).origin}`; } catch (_) { return null; }
  }

  return { MAX_BODY, CAPTURED_MAX, validateBody, buildSaveRequest, requestFor, interpretSave, saveButtonLabel, statusLabel, canSave, pushCaptured, capturedLabel, pendingKey };
});

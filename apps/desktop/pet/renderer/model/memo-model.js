// 빠른 메모의 순수 규칙 — 저장 요청 만들기, 결과 해석, 상태 문구, 저장한 메모 보관 목록.
// 입력은 매 키 입력마다 로컬(petPreview.memo)에 남고, Hub 저장은 명시적 동작이다.
// 확인되지 않은 저장(보류 명령)과 충돌 표시는 메인 프로세스의 허브 모델(pet-pending)이 origin 별로 가진다 —
// 렌더러는 그 요약(data.pending)을 읽기만 하고 요청 ID·revision 을 만들지 않는다. 빠른 캡처는 확인되면 끝난다(finish).
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const E = typeof require === 'function' ? require('./envelope-view.js') : root.PetModel.envelope;
  const Plat = typeof require === 'function' ? require('./platform.js') : root.PetModel.platform;
  const api = factory(C, E, Plat);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).memo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, E, Plat) {
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

  // 허브 요약(pet-pending summary) → 이 화면이 쓰는 세 가지. 모양이 틀리면 '보류 없음'.
  function pendingFrom(result) {
    const p = result && result.data && result.data.pending;
    if (!p || typeof p !== 'object') return null;
    return {
      hasPendingMemo: p.hasPendingMemo === true,
      pendingMemoRole: typeof p.pendingMemoRole === 'string' ? p.pendingMemoRole : null,
      captureConflict: p.captureConflict === true,
      conflictId: typeof p.memoConflictId === 'string' ? p.memoConflictId : null,
    };
  }

  // 빠른 캡처 저장(Ctrl+S·버튼). 확인이 안 된 앞 저장이 있으면 허브가 그 명령을 먼저 다시 보낸다.
  function captureRequest(body) {
    return { body: String(body == null ? '' : body), finish: true };
  }

  // '새 항목으로 Hub에 저장' — 충돌한 메모(conflictId)를 덮어쓰지 않고 새 메모로 남긴다.
  function asNewRequest(body, pending) {
    const request = { body: String(body == null ? '' : body), finish: true, asNew: true };
    if (pending && pending.conflictId) request.entryId = pending.conflictId;
    return request;
  }

  // 결과 해석. clearDraft: 서버가 이 입력을 확인했고 보내는 사이 입력이 바뀌지 않았을 때만.
  //   saved    — 이 입력이 저장·재조회로 확인됐다
  //   replayed — 확인이 필요했던 앞 메모를 먼저 저장했다(지금 입력은 아직 저장 전)
  //   conflict — 다른 곳에서 먼저 바뀌어 덮어쓰지 않았다(captureConflict 면 새 항목으로만)
  //   pending  — 결과를 모른다. 허브가 같은 명령을 보관했다가 다음 저장에서 먼저 다시 보낸다
  //   failed   — 저장되지 않았다(preview·로그인 필요·주소 없음·입력 오류)
  function interpretSave(result, request, currentDraft) {
    const w = E.describeWrite(result, '메모');
    const data = (result && result.data) || {};
    const pending = pendingFrom(result);
    if (w.ok && data.verified === true) {
      if (data.replayed === true) {
        return {
          outcome: 'replayed', clearDraft: false, pending, savedEntry: data.entry || null,
          label: '앞 메모 저장', message: '확인이 필요했던 앞 메모를 먼저 저장했어요. 지금 입력은 한 번 더 저장해 주세요.',
        };
      }
      return { outcome: 'saved', clearDraft: currentDraft === request.body, pending, savedEntry: data.entry || null, label: null, message: null };
    }
    if (w.ok) {
      return {
        outcome: 'pending', clearDraft: false, pending, savedEntry: null,
        label: '저장 확인 필요', message: '저장 결과 확인이 필요해요. ‘저장 확인’으로 같은 요청을 다시 확인해요.',
      };
    }
    if (w.kind === 'conflict') {
      return {
        outcome: 'conflict', clearDraft: false, pending, savedEntry: null, label: w.label,
        message: '다른 곳에서 먼저 바뀌어 덮어쓰지 않았어요. 더보기의 ‘새 항목으로 Hub에 저장’으로 남길 수 있어요.',
      };
    }
    const held = Boolean(pending && pending.hasPendingMemo);
    return {
      outcome: held ? 'pending' : 'failed', clearDraft: false, pending, savedEntry: null,
      label: w.label, message: held ? `${w.message} ‘저장 확인’으로 같은 요청을 다시 보내요.` : w.message, action: w.action,
    };
  }

  function saveButtonLabel({ saving, pending }) {
    if (saving) return '저장 중…';
    if (pending && pending.hasPendingMemo) return '저장 확인';
    return 'Hub에 저장';
  }

  function statusLabel({ saving, draft, savedBody, platform }) {
    let text;
    if (saving) text = '이 PC에 보관 · Hub 저장 중…';
    else if (savedBody != null && savedBody === draft && draft) text = 'Hub에 저장됨 · 이 PC에 보관';
    else text = draft ? '이 PC에 자동 저장됨' : '이 PC에 자동 저장';
    return Plat.localize(text, platform); // mac 은 '이 Mac'
  }

  // 빈 입력창에서도 보류 중인 저장은 확인할 수 있다. 캡처 충돌이면 대상 없는 저장은 막힌다(새 항목으로만).
  function canSave({ saving, draft, pending }) {
    if (saving) return false;
    if (pending && pending.hasPendingMemo) return true;
    if (pending && pending.captureConflict) return false;
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

  return {
    MAX_BODY, CAPTURED_MAX, validateBody, pendingFrom, captureRequest, asNewRequest, interpretSave,
    saveButtonLabel, statusLabel, canSave, pushCaptured, capturedLabel,
  };
});

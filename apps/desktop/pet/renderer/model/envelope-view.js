// 허브 봉투(contract.ENVELOPE_KINDS) → 화면 상태. 실패를 빈 목록이나 저장 완료로 보이지 않게 하는
// 한 곳이다. 읽기(describeRead)와 쓰기(describeWrite)를 나눈다 — 읽기의 preview 는 "데이터 없음"이 아니라
// "연결 필요"이고, 쓰기의 preview 는 "저장되지 않음"이다(DESIGN.md §8.1 Save envelope, 심화 설계 §16).
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const api = factory(C);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).envelope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const KINDS = C.ENVELOPE_KINDS;
  // 허브 주소는 있는데 허브 서버에 운영자 로그인 설정이 없는 경우(pet-hub-client 의 사유 코드) — '주소 없음'과 다르다.
  const LOGIN_NOT_CONFIGURED = 'operator-login-not-configured';

  function kindOf(result) {
    if (!result || typeof result !== 'object') return 'invalid';
    return KINDS.includes(result.kind) ? result.kind : 'invalid';
  }

  // 허브 모델(pet-hub-client)의 사유 코드 → 사람이 읽는 말. 코드를 그대로 보여 주지 않는다.
  const CODE_TEXT = Object.freeze({
    offline: 'Hub에 연결하지 못했어요.',
    timeout: 'Hub 응답이 늦어지고 있어요.',
    server: 'Hub가 요청을 처리하지 못했어요.',
    cancelled: '요청을 중단했어요.',
    busy: '앞 요청을 처리하는 중이에요. 잠시 뒤 다시 시도해 주세요.',
    'invalid-input': '입력을 확인해 주세요.',
    'invalid-response': 'Hub 응답을 확인하지 못했어요.',
    'invalid-status': 'Hub 응답 상태를 확인하지 못했어요.',
    'save-not-verified': '저장 결과를 확인하지 못했어요.',
    'pending-memo': '확인이 필요한 앞 메모가 있어요. 먼저 ‘저장 확인’을 눌러 주세요.',
    'memo-conflict': 'Hub에서 먼저 바뀌었어요. 입력은 보관했어요.',
    conflict: 'Hub에서 먼저 바뀌었어요. 입력은 보관했어요.',
    'missing-version': '할 일의 버전을 몰라 다시 불러와야 해요.',
    'stale-origin': 'Hub 주소가 바뀌어 이 결과는 쓰지 않았어요.',
    'redirect-rejected': 'Hub가 다른 주소로 보내려 해서 멈췄어요.',
    'rejected-url': '허용하지 않는 주소예요.',
    unexpected: '앱 안에서 요청을 처리하지 못했어요.',
  });
  const codeOf = (result) => (result && typeof result.error === 'string' ? result.error : '');
  function errorText(result) {
    const e = result && result.error;
    if (!e) return '';
    const text = typeof e === 'string' ? e : typeof e.message === 'string' ? e.message : '';
    if (Object.prototype.hasOwnProperty.call(CODE_TEXT, text)) return CODE_TEXT[text];
    // 모르는 기계 코드(소문자·하이픈)는 보여 주지 않고 각 상태의 기본 문구를 쓴다.
    return /^[a-z0-9-]+$/.test(text) ? '' : text;
  }

  // subject: 무엇을 읽었나("할 일", "일정", "알림") — 일부·오류 문구에만 쓴다.
  function describeRead(result, subject) {
    const what = subject || '내용';
    const kind = kindOf(result);
    const detail = errorText(result);
    switch (kind) {
      case 'live':
        return { state: 'live', showData: true, label: null, message: null, action: null };
      case 'partial':
        return {
          state: 'partial', showData: true, label: '일부만 확인',
          message: `${what} 일부만 확인했어요. 전체는 Hub에서 확인해 주세요.`,
          action: { kind: 'retry', label: '다시 불러오기' },
        };
      case 'preview':
        return {
          state: 'preview', showData: false, label: 'Preview · 연결 필요',
          message: 'Hub 데이터 연결이 필요해요. 연결 전에는 목록을 채우지 않아요.',
          action: { kind: 'status', label: '연결 상태' },
        };
      case 'unauthorized':
        return {
          state: 'unauthorized', showData: false, label: '로그인 필요',
          message: 'Hub 로그인이 필요해요. 메인 창에서 로그인하면 이어서 볼 수 있어요.',
          action: { kind: 'login', label: '메인 창에서 로그인' },
        };
      case 'not-configured':
        if (codeOf(result) === LOGIN_NOT_CONFIGURED) {
          return {
            state: 'not-configured', showData: false, label: 'Hub 로그인 미설정',
            message: 'Hub 서버에 운영자 로그인 설정이 아직 없어요. 서버 설정이 끝나면 이어서 볼 수 있어요.',
            action: { kind: 'status', label: '연결 상태' },
          };
        }
        return {
          state: 'not-configured', showData: false, label: 'Hub 주소 필요',
          message: 'Hub 주소가 아직 없어요. 메인 창에서 Hub 주소를 먼저 정해 주세요.',
          action: { kind: 'main', label: '메인 창 열기' },
        };
      case 'conflict':
        return {
          state: 'conflict', showData: false, label: '다른 곳에서 바뀜',
          message: detail || 'Hub에서 먼저 바뀌었어요. 입력은 보관했어요.',
          action: { kind: 'retry', label: '다시 불러오기' },
        };
      case 'error':
        return {
          state: 'error', showData: false, label: '연결 오류',
          message: detail || `${what} 불러오기에 실패했어요. 잠시 뒤 다시 시도해 주세요.`,
          action: { kind: 'retry', label: '다시 시도' },
        };
      default:
        return {
          state: 'invalid', showData: false, label: '응답 확인 필요',
          message: detail || 'Hub 응답을 확인하지 못했어요. 다시 불러와 주세요.',
          action: { kind: 'retry', label: '다시 불러오기' },
        };
    }
  }

  // 쓰기 결과. ok 는 서버가 영속을 확인했을 때(live)만 true. partial·error 는 결과가 불확실하므로
  // uncertain 으로 두고 같은 요청을 다시 보낼 수 있게 입력을 보존한다.
  function describeWrite(result, subject) {
    const what = subject || '내용';
    const kind = kindOf(result);
    const detail = errorText(result);
    const base = { kind, ok: false, uncertain: false, keepInput: true, label: null, message: null, action: null };
    switch (kind) {
      case 'live':
        return { ...base, ok: true, keepInput: false };
      case 'partial':
        return {
          ...base, uncertain: true, label: '확인 필요',
          message: `${what} 저장 결과를 다 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요.`,
          action: { kind: 'retry', label: '저장 확인' },
        };
      case 'preview':
        return {
          ...base, label: 'Preview · 연결 필요', message: 'Hub 데이터 연결이 필요해요. 아직 저장되지 않았어요.',
          action: { kind: 'status', label: '연결 상태' },
        };
      case 'unauthorized':
        return {
          ...base, label: '로그인 필요', message: 'Hub 로그인이 필요해요. 입력은 그대로 보관했어요.',
          action: { kind: 'login', label: '메인 창에서 로그인' },
        };
      case 'not-configured':
        if (codeOf(result) === LOGIN_NOT_CONFIGURED) {
          return { ...base, label: 'Hub 로그인 미설정', message: 'Hub 서버에 운영자 로그인 설정이 아직 없어요. 저장되지 않았어요.', action: { kind: 'status', label: '연결 상태' } };
        }
        return {
          ...base, label: 'Hub 주소 필요', message: 'Hub 주소가 아직 없어요. 저장되지 않았어요.',
          action: { kind: 'main', label: '메인 창 열기' },
        };
      case 'conflict':
        return { ...base, label: '다른 곳에서 바뀜', message: detail || 'Hub에서 먼저 바뀌었어요. 입력은 보관했어요.' };
      case 'error':
        return {
          ...base, uncertain: true, label: '저장 확인 필요',
          message: detail || '저장 결과를 확인하지 못했어요. 같은 요청으로 다시 시도할 수 있어요.',
          action: { kind: 'retry', label: '다시 시도' },
        };
      default:
        return { ...base, label: '입력 확인 필요', message: detail || 'Hub가 요청을 받지 않았어요. 입력을 확인해 주세요.' };
    }
  }

  function isFailure(result) {
    const k = kindOf(result);
    return k !== 'live' && k !== 'partial';
  }

  return { kindOf, errorText, describeRead, describeWrite, isFailure };
});

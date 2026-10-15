// 빠른 패널 셸의 순수 규칙 — 제목·크기, 탭 묶음, 창 안 단축키(Windows Ctrl+1~7·Ctrl+S·Ctrl+Enter / macOS ⌘1~7·⌘S·⌘Return, 공통 Esc),
// Hub 연결 상태 문구. 모드 순서는 계약의 MODE_HOTKEY_ORDER 가 정본이다.
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const Plat = typeof require === 'function' ? require('./platform.js') : root.PetModel.platform;
  const api = factory(C, Plat);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).panel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, Plat) {
  const TODAY = Object.freeze(['tasks', 'calendar']);
  const CAPTURE = Object.freeze(['tasks', 'memo']);

  function titleFor(mode) {
    if (mode === 'hub-status') return 'Hub 연결';
    if (mode === 'tasks' || mode === 'calendar') return '오늘';
    if (mode === 'memo') return '빠른 메모';
    return C.MODE_LABEL[mode] || '오늘';
  }
  const isLargeTitle = (mode) => mode === 'tasks' || mode === 'calendar' || mode === 'memo';
  const showsDate = (mode) => mode === 'tasks' || mode === 'calendar';

  // 헤더 아래 탭(오늘) / 헤더 안 탭(메모).
  function tabsFor(mode) {
    if (mode === 'tasks' || mode === 'calendar') return { place: 'below', modes: TODAY };
    if (mode === 'memo') return { place: 'header', modes: CAPTURE };
    return null;
  }

  function hotkeyLabel(mode, platform) {
    const i = C.MODE_HOTKEY_ORDER.indexOf(mode);
    return i < 0 ? '' : Plat.hotkey(i + 1, platform);
  }

  // 키 이벤트 → 동작. 주 수정키는 Windows Ctrl / macOS ⌘ 이고, Alt 나 반대편 수정키가 섞이면 무시한다
  // (전역 Ctrl+Alt+M · ⌃⌥M 과 겹치지 않게). platform 을 생략하면 현재 창의 플랫폼.
  function keyAction(e, platform, mode) {
    if (!e) return null;
    // IME 조합 중(한글 입력)의 키는 입력기 몫 — Esc 로 조합을 취소하거나 Enter 로 확정하는 중에 패널이 접히거나 저장되지 않게.
    if (e.isComposing || e.keyCode === 229) return null;
    // Mac 원본 WindowCoordinator: 메모에서만 ⌃Return을 ⌘Return의 대안으로 허용한다.
    if (Plat.isMac(platform) && mode === 'memo' && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')) return { type: 'primary' };
    const ctrl = Plat.primaryDown(e, platform);
    if (ctrl && !e.shiftKey) {
      const m = /^Digit([1-7])$/.exec(e.code || '') || /^([1-7])$/.exec(e.key || '');
      if (m) return { type: 'mode', mode: C.MODE_HOTKEY_ORDER[Number(m[1]) - 1] };
      if ((e.key === 's' || e.key === 'S' || e.code === 'KeyS')) return { type: 'save' };
    }
    if (ctrl && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')) return { type: 'primary' };
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) return { type: 'collapse' };
    return null;
  }

  // 문구의 '이 PC' 는 hubStatusView 가 플랫폼에 맞춰 바꾼다(mac 은 '이 Mac').
  const HUB_STATUS = Object.freeze({
    connected: Object.freeze({ glyph: 'check', label: '연결됨', detail: '메인 창의 로그인 세션을 함께 써요.' }),
    unauthorized: Object.freeze({ glyph: 'lock', label: '로그인 필요', detail: '메인 창에서 로그인하면 펫도 바로 이어서 써요.' }),
    'not-configured': Object.freeze({ glyph: 'info', label: 'Hub 주소 없음', detail: '메인 창에서 Hub 주소를 먼저 정해 주세요.' }),
    offline: Object.freeze({ glyph: 'alert', label: '연결 안 됨', detail: 'Hub에 닿지 못했어요. 입력은 이 PC에 보관돼요.' }),
    unknown: Object.freeze({ glyph: 'info', label: '확인 중', detail: 'Hub 연결을 확인하고 있어요.' }),
  });
  // not-configured 는 두 가지다: 주소가 없거나(메인 창에서 정한다), 주소는 있는데 허브에 운영자 로그인 설정이 없거나.
  const LOGIN_NOT_CONFIGURED = Object.freeze({ glyph: 'info', label: 'Hub 로그인 미설정', detail: 'Hub 서버에 운영자 로그인 설정이 아직 없어요. 서버 설정이 끝나면 펫도 이어서 써요.' });
  const hubStatusView = (status, hubUrl, platform) => {
    if (status === 'not-configured' && hubUrl) return LOGIN_NOT_CONFIGURED;
    const v = HUB_STATUS[status] || HUB_STATUS.unknown;
    const detail = Plat.localize(v.detail, platform);
    return detail === v.detail ? v : Object.freeze({ ...v, detail });
  };

  function hostOf(url) {
    try { return new URL(url).host; } catch (_) { return ''; }
  }

  // 셸의 state.modeTarget({ seq, mode, date? | ownerId?, scope? }) → 이번 상태 방송에서 고를 목적지.
  // 새 seq 이고 지금 모드와 같을 때만 target 을 준다(말풍선의 '내용 보기'가 그 날짜·그 대화로 연다). 결과 { seen, target }.
  function modeTargetStep(seen, target, mode) {
    const s = Number(seen) || 0;
    if (!target || typeof target !== 'object' || !Number.isFinite(target.seq) || target.seq <= s) return { seen: s, target: null };
    return { seen: target.seq, target: target.mode === mode ? target : null };
  }

  return { TODAY, CAPTURE, titleFor, isLargeTitle, showsDate, tabsFor, hotkeyLabel, keyAction, hubStatusView, hostOf, modeTargetStep };
});

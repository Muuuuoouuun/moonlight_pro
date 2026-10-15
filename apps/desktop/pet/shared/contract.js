'use strict';
// Moonlight Pet (Windows 이식) — 메인 프로세스·프리로드·렌더러가 함께 쓰는 계약.
// 출처: prototypes/moonlight-pet-macos (승인 스펙 2026-09-24~26) + 2026-09-26 운영자 결정
//   재질 A(Acrylic 실제 블러) · 로그인은 메인 창 세션 공유 · 집중 모드는 타이머 화면만.
// 이 파일은 순수 상수·순수 함수만 둔다(Electron 의존 없음). 값을 바꾸면 세 계층이 같이 바뀐다.

const MODES = Object.freeze(['tasks', 'memo', 'calendar', 'office', 'council', 'focus', 'notifications']);
const MODE_LABEL = Object.freeze({
  tasks: '할 일', memo: '메모', calendar: '일정', office: 'Office', council: 'Council', focus: '집중', notifications: '알림',
});
// ⌘1~7 → Ctrl+1~7 (펫 창 안에서만)
const MODE_HOTKEY_ORDER = Object.freeze(['tasks', 'memo', 'calendar', 'office', 'council', 'focus', 'notifications']);

// 크기(CSS px = Mac pt). Mac 값은 8px 그림자 여백 포함. Acrylic 창은 시스템 그림자를 쓰므로 유리 크기만
// 창 크기가 된다(`glass`). 걸친 캐릭터(perch)는 별도 투명 창: 72×72, 유리 오른쪽에서 20px 안쪽, 위로 54px 띠.
const SHADOW_MARGIN = 8;
const PERCH_STRIP = 54;
const PERCH_SIZE = 72;
const PERCH_INSET_RIGHT = 20;
const GLASS_RADIUS = 26; // Mac 값 — Acrylic 창은 시스템 8px가 되고, CSS 레이어(중앙 음영·림)는 이 값을 참고만 한다
const PANEL_SIZES = Object.freeze({
  // [width, height] — Mac 빠른 패널 크기(여백 포함). widget 모드는 +PERCH_STRIP(메모는 이미 포함).
  tasks: [336, 504], calendar: [336, 484], memo: [520, 440], office: [424, 296],
  council: [460, 580], notifications: [360, 480], focus: [380, 320],
});
const MEMO_ALREADY_HAS_STRIP = true;
function glassSize(mode) {
  const [w, h] = PANEL_SIZES[mode] || PANEL_SIZES.tasks;
  return { width: w - SHADOW_MARGIN * 2, height: h - SHADOW_MARGIN * 2 };
}
const PET_SIZE = 56;
const PET_PORTRAIT = 52;
const PET_EDGE_INSET = 8; // 화면 오른쪽에서
const PANEL_GAP = 10; // 빠른 패널과 펫 사이
const BUBBLE_SIZE = Object.freeze({ width: 326, height: 130 });
const FOCUS_CARD_WIDTH = 420;

// 캐릭터 9종 — Office 담당자와 1:1. portrait/cutout 은 apps/desktop/pet/assets/ 의 파일명.
// wash 는 누름·드래그 중에만 보이는 캐릭터색과 그 불투명도(님피아 42%, 나머지 52%).
const CHARACTERS = Object.freeze([
  { key: 'brown', name: '이브이', officeId: 'eevee', role: '비서실장', color: '#69452E', wash: 0.52, portrait: 'portrait-brown.png', cutout: 'cutout-brown.png' },
  { key: 'blue', name: '샤미드', officeId: 'vaporeon', role: '운영총괄', color: '#2B527A', wash: 0.52, portrait: 'portrait-blue.png', cutout: 'cutout-blue.png' },
  { key: 'gold', name: '쥬피썬더', officeId: 'jolteon', role: '기술총괄', color: '#7D632B', wash: 0.52, portrait: 'portrait-gold.png', cutout: 'cutout-gold.png' },
  { key: 'red', name: '부스터', officeId: 'flareon', role: '매출총괄', color: '#7A3824', wash: 0.52, portrait: 'portrait-red.png', cutout: 'cutout-red.png' },
  { key: 'lilac', name: '에브이', officeId: 'espeon', role: '전략총괄', color: '#594178', wash: 0.52, portrait: 'portrait-lilac.png', cutout: 'cutout-lilac.png' },
  { key: 'dark', name: '블래키', officeId: 'umbreon', role: '리스크총괄', color: '#363339', wash: 0.52, portrait: 'portrait-dark.png', cutout: 'cutout-dark.png' },
  { key: 'olive', name: '리피아', officeId: 'leafeon', role: '재무·자원총괄', color: '#4C6130', wash: 0.52, portrait: 'portrait-olive.png', cutout: 'cutout-olive.png' },
  { key: 'silver', name: '글레이시아', officeId: 'glaceon', role: '제품총괄', color: '#4A6C80', wash: 0.52, portrait: 'portrait-silver.png', cutout: 'cutout-silver.png' },
  { key: 'pink', name: '님피아', officeId: 'sylveon', role: '브랜드·마케팅총괄', color: '#704759', wash: 0.42, portrait: 'portrait-pink.png', cutout: 'cutout-pink.png' },
]);
const DEFAULT_CHARACTER = 'silver';
// 원본 자산(prototypes/moonlight-pet-macos/Sources/MoonlightPetPreview/Resources) → assets 생성 규칙.
// portrait: pet-<key>.png (dark 는 pet-dark-straight.png) 를 224px 정사각으로. cutout: 아틀라스 crop.
const SOURCE_ASSETS = Object.freeze({
  brown: { portrait: 'pet-brown.png', atlas: 'pet-cutouts-a.png', crop: [72, 94, 389, 359] },
  blue: { portrait: 'pet-blue.png', atlas: 'pet-cutouts-a.png', crop: [576, 127, 409, 330] },
  gold: { portrait: 'pet-gold.png', atlas: 'pet-cutouts-a.png', crop: [1070, 89, 392, 365] },
  red: { portrait: 'pet-red.png', atlas: 'pet-cutouts-a.png', crop: [63, 570, 398, 357] },
  lilac: { portrait: 'pet-lilac.png', atlas: 'pet-cutouts-corrected.png', crop: [797, 171, 727, 709] },
  dark: { portrait: 'pet-dark-straight.png', atlas: 'pet-cutouts-corrected.png', crop: [15, 161, 747, 692] },
  olive: { portrait: 'pet-olive.png', atlas: 'pet-cutouts-b.png', crop: [636, 57, 578, 570] },
  silver: { portrait: 'pet-silver.png', atlas: 'pet-cutouts-b.png', crop: [28, 633, 599, 603] },
  pink: { portrait: 'pet-pink.png', atlas: 'pet-cutouts-b.png', crop: [627, 627, 616, 604] },
});
function characterByKey(key) {
  return CHARACTERS.find((c) => c.key === key) || CHARACTERS.find((c) => c.key === DEFAULT_CHARACTER);
}

// 모션(Mac PetMotion) — CSS 변수로도 같은 이름을 쓴다.
const MOTION = Object.freeze({
  hoverMs: 120, panelMs: 240, overlayMs: 160, ease: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
  petHover: { scale: 1.04, rotate: -1.2, shift: -0.7 }, petPress: { scale: 0.93, down: 1 }, petDrag: { scale: 0.97 },
});
// Windows Acrylic·Mac HUD 대체 경로의 유리값. macOS 26+ 네이티브 재질은
// pet/native/mac-glass.mm + 원본 GlassOptics.metal의 별도 계약을 따른다(2026-09-29).
const GLASS = Object.freeze({
  centerShade: 0.09, textShadowNear: 0.73, textShadowFar: 0.37, rimReflection: 0.66, diffusion: 0.48, diffusionEdge: 24,
  textPrimary: 0.98, textSecondary: 0.92, textFaint: 0.86,
  // 곡면 단면(glass.css .section·.section-fine·.prism) — 프로토타입 GlassOptics.metal 배포값의 CSS 근사. 깊이는 px(1x = pt).
  bevel: 9, sectionGain: 0.75, shoulder: 0.38, innerReturn: 0.30, innerAttenuation: 0.10, prism: 0.34,
  // 캐릭터 색은 곡면 쪽에 모인다(PetGlassWash depthMask): 가장자리 1 → 48px 에 걸쳐 면 35%.
  washFeather: 48, washInterior: 0.35,
  // mac 베일(라이트 모양 hud 가 밝은 회색이라 흰 글자를 지키는 층) — 글자 열에서 짙고 단면 9px 안에서 55% 로 옅어진다.
  macVeilLight: 0.48, macVeilDark: 0.24, macVeilEdge: 0.55, macVeilFeather: 9,
});

// 허브 봉투 해석(Mac HubTransport 규칙을 그대로) — 메인 프로세스 pet-hub-client 가 만들고 렌더러가 읽는다.
const ENVELOPE_KINDS = Object.freeze(['live', 'partial', 'preview', 'unauthorized', 'not-configured', 'conflict', 'error', 'invalid']);
const HUB_PATHS = Object.freeze({
  tasks: '/dashboard/work/my?view=todos', memo: '/dashboard/work/memos', calendar: '/dashboard/work/calendar',
  office: '/dashboard/agents/office-council', council: '/dashboard/agents/council', notifications: '/dashboard/revenue/inquiries?filter=unread',
  inquiry: (id) => `/dashboard/revenue/inquiries?inquiry=${encodeURIComponent(id)}`,
});
const LIMITS = Object.freeze({
  taskTitle: 300, memoBody: 20000, chatMessage: 6000, chatHistoryItems: 8, chatHistoryItemChars: 2000, chatHistoryJson: 20000,
  chatShownTurns: 30, councilDraft: 4000, councilFragment: 24000, noticesKept: 1000, inquiriesPage: 25,
  requestTimeoutMs: 20000, totalTimeoutMs: 45000, chatTimeoutMs: 60000, chatTotalTimeoutMs: 70000,
  pollMs: 60000, bubbleShowMs: 8000, bubbleGapMs: 1000, upcomingEventMinutes: 10, taskDoneGraceMs: 3000,
});

// 프리로드 다리 `window.moonlightPet` — invoke 채널(요청/응답)과 이벤트 채널(메인→렌더러).
// 'pet:set-mode' payload: {mode} — 모드만. 알림에서 열 때 {mode:'calendar', date:'YYYY-MM-DD'} · {mode:'council', ownerId, scope?}
// 로 그 날짜·그 대화를 함께 고른다(셸이 state.modeTarget {seq, …} 로 패널에 전한다 — pet-state.js modeTargetFrom).
// 'pet:focus-state' payload: {} 읽기 · {dismissConfirm:true} 중지 확인을 거두고 지금 눌린 Esc 를 뗄 때까지 잠근다.
const PET_INVOKE = Object.freeze([
  'pet:state', 'pet:set-character', 'pet:set-mode', 'pet:set-presentation', 'pet:collapse', 'pet:open-hub', 'pet:open-external',
  'pet:drag', 'pet:press', 'pet:resize-content', 'pet:context-menu',
  'pet:store-get', 'pet:store-set',
  'pet:hub-session', 'pet:tasks-list', 'pet:tasks-add', 'pet:tasks-toggle',
  'pet:journal-read', 'pet:journal-save', 'pet:calendar-week',
  'pet:notices-list', 'pet:notices-read', 'pet:notices-hide', 'pet:notices-read-all',
  'pet:chat-send', 'pet:chat-cancel', 'pet:chat-session', 'pet:council-handoff',
  'pet:focus-start', 'pet:focus-stop', 'pet:focus-state',
]);
const PET_EVENTS = Object.freeze(['pet:state-changed', 'pet:wash', 'pet:notice', 'pet:badge', 'pet:chat-reply', 'pet:focus-tick', 'pet:hub-status']);

module.exports = {
  MODES, MODE_LABEL, MODE_HOTKEY_ORDER,
  SHADOW_MARGIN, PERCH_STRIP, PERCH_SIZE, PERCH_INSET_RIGHT, GLASS_RADIUS, PANEL_SIZES, MEMO_ALREADY_HAS_STRIP, glassSize,
  PET_SIZE, PET_PORTRAIT, PET_EDGE_INSET, PANEL_GAP, BUBBLE_SIZE, FOCUS_CARD_WIDTH,
  CHARACTERS, DEFAULT_CHARACTER, SOURCE_ASSETS, characterByKey,
  MOTION, GLASS, ENVELOPE_KINDS, HUB_PATHS, LIMITS, PET_INVOKE, PET_EVENTS,
};

// 펫이 붙는 화면 가장자리(2026-09-29 운영자 요청 "모니터 사이드 바꿀 수 있게"). 기본은 오른쪽 — 오른쪽 숫자는 그대로 두고
// 왼쪽은 거울로 놓는다(펫 8px·패널·말풍선은 화면 가운데 쪽, 걸친 캐릭터는 바깥쪽 20px). 셸이 state.side 로 알린다.
module.exports.PET_SIDES = Object.freeze(['left', 'right']);
module.exports.DEFAULT_PET_SIDE = 'right';

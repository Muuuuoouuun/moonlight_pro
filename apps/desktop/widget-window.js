// 빠른 입력 위젯 창의 규칙 — Electron 없이 테스트할 수 있게 순수 함수만 둔다.
'use strict';

const WIDGET_WIDTH = 380;
const WIDGET_HEIGHT = 200;
const WIDGET_MIN_HEIGHT = 140;
const WIDGET_MAX_HEIGHT = 360;
const WIDGET_MARGIN = 16;

// 위젯 프리로드가 쓰는 IPC 채널 전부. 메인은 이 밖의 채널을 위젯에 열지 않는다.
const WIDGET_CHANNELS = Object.freeze({
  pin: 'moonlight-widget:pin',
  isPinned: 'moonlight-widget:is-pinned',
  close: 'moonlight-widget:close',
  openMain: 'moonlight-widget:open-main',
  setHeight: 'moonlight-widget:set-height',
});

function originOf(value) {
  try {
    const { origin } = new URL(value);
    return origin && origin !== 'null' ? origin : '';
  } catch {
    return '';
  }
}

function widgetUrl(hubUrl) {
  const origin = originOf(hubUrl);
  return origin ? `${origin}/widget` : '';
}

// 세션이 끝나 허브가 로그인 화면으로 보낸 주소인가. 작은 위젯 창은 로그인 폼을 그리지 않는다.
function isLoginUrl(target, hubUrl) {
  const origin = originOf(hubUrl);
  if (!origin) return false;
  try {
    const url = new URL(target);
    if (url.origin !== origin) return false;
    return url.pathname === '/login' || url.pathname.startsWith('/login/');
  } catch {
    return false;
  }
}

// 위젯이 로그인으로 밀려났을 때 메인 창이 열 로그인 주소. 허브 미들웨어는 `/login?next=%2Fwidget`로
// 보내는데, 메인 창이 그 next를 물려받으면 로그인 뒤 380px 위젯 페이지를 큰 창 전체로 띄운다.
// next가 위젯 화면을 가리키면 지운다 — 로그인 화면의 기본 목적지(/dashboard)로 간다. 다른 목적지와
// 나머지 쿼리는 그대로 둔다. 허브 origin의 로그인 주소가 아니면 null.
function mainLoginUrl(target, hubUrl) {
  if (!isLoginUrl(target, hubUrl)) return null;
  const url = new URL(target);
  const next = url.searchParams.get('next');
  if (next !== null) {
    let pointsAtWidget = true; // 읽을 수 없는 next도 위젯에서 온 것이므로 버린다
    try {
      pointsAtWidget = isWidgetPage(new URL(next, url.origin).href, hubUrl);
    } catch { /* keep true */ }
    if (pointsAtWidget) url.searchParams.delete('next');
  }
  return url.href;
}

// 위젯이 떠 있는 페이지가 위젯 화면인가(로그인·실패로 다른 곳에 있으면 다시 불러야 한다).
function isWidgetPage(target, hubUrl) {
  const origin = originOf(hubUrl);
  if (!origin) return false;
  try {
    const url = new URL(target);
    return url.origin === origin && (url.pathname === '/widget' || url.pathname.startsWith('/widget/'));
  } catch {
    return false;
  }
}

// openMain(path): 허브 안의 경로만 받는다. 스킴·호스트·프로토콜 상대(//)·역슬래시·제어 문자는 거절.
function resolveMainPath(input, hubUrl) {
  const origin = originOf(hubUrl);
  if (!origin) return { ok: false, reason: 'no-hub' };
  if (typeof input !== 'string' || !input.startsWith('/')) return { ok: false, reason: 'path' };
  if (input.length > 2048) return { ok: false, reason: 'path' };
  if (input.startsWith('//') || input.includes('\\') || /[\u0000-\u001f\u007f]/.test(input)) {
    return { ok: false, reason: 'path' };
  }
  let url;
  try {
    url = new URL(input, origin);
  } catch {
    return { ok: false, reason: 'path' };
  }
  if (url.origin !== origin) return { ok: false, reason: 'path' };
  return { ok: true, url: url.href };
}

// 페이지가 요청한 높이를 140–360px로 자른다. 숫자가 아니면 null(무시).
function clampWidgetHeight(value) {
  const px = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(px)) return null;
  return Math.min(WIDGET_MAX_HEIGHT, Math.max(WIDGET_MIN_HEIGHT, Math.round(px)));
}

// widget-state.json → { x, y, pinned }. 좌표가 없으면 null(기본 위치), 고정은 기본 켜짐.
function normalizeWidgetState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  const hasPoint = Number.isFinite(state.x) && Number.isFinite(state.y);
  return {
    x: hasPoint ? Math.round(state.x) : null,
    y: hasPoint ? Math.round(state.y) : null,
    pinned: state.pinned !== false,
  };
}

// 주 모니터 작업 영역의 오른쪽 아래, 가장자리에서 16px.
function defaultWidgetPosition(workArea, size, margin = WIDGET_MARGIN) {
  return {
    x: workArea.x + workArea.width - size.width - margin,
    y: workArea.y + workArea.height - size.height - margin,
  };
}

// 창 전체가 작업 영역 안에 들어오게 좌표를 민다(모니터 분리·해상도 변경 대비).
function clampIntoWorkArea(point, size, workArea) {
  const maxX = workArea.x + Math.max(0, workArea.width - size.width);
  const maxY = workArea.y + Math.max(0, workArea.height - size.height);
  return {
    x: Math.min(maxX, Math.max(workArea.x, Math.round(point.x))),
    y: Math.min(maxY, Math.max(workArea.y, Math.round(point.y))),
  };
}

// 저장된 좌표가 있으면 그 좌표가 속한(가장 가까운) 작업 영역 안으로, 없으면 주 모니터 기본 위치.
function resolveWidgetPosition(state, size, savedWorkArea, primaryWorkArea) {
  if (state && state.x !== null && state.y !== null && savedWorkArea) {
    return clampIntoWorkArea({ x: state.x, y: state.y }, size, savedWorkArea);
  }
  return clampIntoWorkArea(defaultWidgetPosition(primaryWorkArea, size), size, primaryWorkArea);
}

// 토글 단축키·메뉴의 판정: 주소가 없으면 설정 화면, 떠 있으면 숨기기, 아니면 보이기.
function widgetToggleAction({ hubUrl, visible }) {
  if (!originOf(hubUrl)) return 'settings';
  return visible ? 'hide' : 'show';
}

module.exports = {
  WIDGET_WIDTH,
  WIDGET_HEIGHT,
  WIDGET_MIN_HEIGHT,
  WIDGET_MAX_HEIGHT,
  WIDGET_MARGIN,
  WIDGET_CHANNELS,
  widgetUrl,
  isLoginUrl,
  mainLoginUrl,
  isWidgetPage,
  resolveMainPath,
  clampWidgetHeight,
  normalizeWidgetState,
  defaultWidgetPosition,
  clampIntoWorkArea,
  resolveWidgetPosition,
  widgetToggleAction,
};

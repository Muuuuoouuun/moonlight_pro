'use strict';
// 펫 창 만들기 — 모양·재질·페이지 불러오기만. 어디에 놓을지는 pet-geometry, 언제 띄울지는 pet-main이 정한다.
//
//   pet     56×56 투명, 포커스를 받지 않는다(클릭은 받는다). 대기 얼굴.
//   panel   Acrylic 유리 창 하나 — 빠른 패널과 지속 위젯이 같은 창을 쓴다(운영자 결정 2026-09-26 재질 A:
//           backgroundMaterial 'acrylic', frame·thickFrame 없음, 투명 아님, 배경 #00000000 + DWM 둥근 모서리·테두리 없음).
//   perch   panel이 소유한 72×72 투명 창 — 유리 위 끝에 걸친 캐릭터. panel과 같이 움직인다.
//   bubble  326×130 Acrylic 말풍선 — 포커스를 받지 않고 showInactive로만 뜬다.
//   focus   화면마다 하나인 불투명 전체 화면 창(주 화면에만 타이머 조작).
// 모두 항상 위(floating), 작업 표시줄에 나오지 않는다. 페이지는 UI 패키지가 pet/renderer/에 둔다.
//
// macOS(platform 'darwin')는 같은 창을 다른 재질·성질로 만든다(Windows 값은 그대로):
//   유리    macOS 26+는 pet-mac-glass의 NSGlassEffectView(.clear) + 원본 Metal 단면.
//           구형 OS·연결부 불가 시에만 vibrancy(MAC_VIBRANCY) + visualEffectState 'active'로 대체한다.
//           두 경로 모두 투명 창 + 알파 0 배경, DWM 호출 없음.
//   패널    모든 펫 창은 type 'panel'(NSPanel, 비활성 패널) — 키 창이 되어도 앱을 활성화하지 않아 큰 허브 창이 앞으로
//           나오지 않고, 전체 화면 앱 위에도 뜬다. acceptFirstMouse 로 다른 앱이 앞에 있어도 첫 클릭이 바로 먹는다.
//           setVisibleOnAllWorkspaces 로 모든 Space 를 따라다닌다(skipTransformProcessType — Dock 아이콘을 건드리지 않는다).
//   집중    display.bounds 전체(메뉴 막대·Dock 위)를 덮도록 roundedCorners:false(제목 없는 창) + enableLargerThanScreen.
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');
const C = require('../shared/contract');
const { isExternalOpenable } = require('../../hub-url');
const { loadMacGlass, attachMacGlass } = require('./pet-mac-glass');

const PET_PAGES = Object.freeze({
  pet: 'pet.html',
  panel: 'panel.html',
  perch: 'perch.html',
  bubble: 'bubble.html',
  focus: 'focus.html',
});
const DEFAULT_PAGES_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, 'pet-preload.js');
const FOCUS_BACKGROUND = '#141C27'; // 허브 --bg와 같은 불투명 흑연(main.js BACKGROUND)
const SOLID_GLASS = '#1B2430'; // 투명도 줄이기·고대비: 블러 대신 불투명 면
// 네이티브 연결부가 없거나 macOS 26 미만이면 기존 HUD로 대체한다.
const MAC_VIBRANCY = 'hud';
// 모든 Space·전체 화면 앱 위. skipTransformProcessType 이 없으면 Electron 이 Dock 아이콘을 숨긴다(허브 창 앱이 사라진다).
const MAC_WORKSPACES = Object.freeze({ visibleOnFullScreen: true, skipTransformProcessType: true });

const isMac = (platform) => platform === 'darwin';

// 페이지 파일 고르기. pagesDir(기본 pet/renderer) 안의 표면별 파일, 또는 pageFile 하나를 모든 표면에(?surface=).
function pagePath({ pagesDir, pageFile } = {}, surface) {
  if (pageFile) return pageFile;
  return path.join(pagesDir || DEFAULT_PAGES_DIR, PET_PAGES[surface]);
}

// 페이지가 아직 없을 때(UI 패키지 이전) 빈 창 대신 보여 줄 최소 화면.
function fallbackUrl(surface) {
  const body = surface === 'panel' || surface === 'focus'
    ? '<p style="margin:24px;font:14px system-ui;color:#fff">펫 화면 파일이 없습니다.</p>'
    : '';
  const bg = surface === 'focus' ? FOCUS_BACKGROUND : 'transparent';
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Moonlight 펫</title><body style="margin:0;background:${bg}">${body}</body>`)}`;
}

// backgroundThrottling:false 는 모든 펫 창에 남긴다. 펫·패널·말풍선은 숨었다 나타나기를 자주 하고, 숨은 동안 바뀐
// 내용(모드·알림·캐릭터)을 보이는 첫 프레임에 그려야 한다 — 숨은 동안 그리기를 멈추면 다시 띄울 때 옛 화면이 한두 프레임
// 비친다. 집중 화면은 타이머라 가려져도 초를 그려야 한다. 대신 페이지의 visibilityState 가 숨은 동안에도 'visible'이라
// 가시성으로만 거르는 렌더러 폴링은 숨은 패널에서도 돈다(렌더러 쪽이 state.panelOpen 으로 거르는 게 맞다).
const webPreferences = () => ({
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  backgroundThrottling: false,
});

// 표면별 창 옵션(순수 — 테스트가 두 플랫폼을 모두 본다). extra 는 표면 고유 값(크기·focusable·parent).
// Windows 는 이식 당시 값 그대로, macOS 는 위 머리 설명대로.
function surfaceOptions(surface, platform, extra = {}) {
  if (isMac(platform)) {
    const panel = { type: 'panel', acceptFirstMouse: true, hiddenInMissionControl: true };
    if (surface === 'panel' || surface === 'bubble') {
      return {
        ...panel,
        transparent: true,
        backgroundColor: '#00000000',
        vibrancy: MAC_VIBRANCY,
        visualEffectState: 'active',
        roundedCorners: true,
        hasShadow: true,
        ...extra,
      };
    }
    if (surface === 'focus') {
      return {
        ...panel,
        backgroundColor: FOCUS_BACKGROUND,
        transparent: false,
        hasShadow: false,
        movable: false,
        focusable: true,
        roundedCorners: false, // 제목 있는 창 모양이면 AppKit 이 메뉴 막대 아래로 밀어 넣는다
        enableLargerThanScreen: true,
        level: 'screen-saver',
        ...extra,
      };
    }
    // pet·perch: 투명 창. 둥근 모서리 마스크·그림자 없이(제목 없는 창) 캐릭터 모양만.
    return { ...panel, transparent: true, backgroundColor: '#00000000', hasShadow: false, roundedCorners: false, ...extra };
  }
  if (surface === 'panel' || surface === 'bubble') {
    // Acrylic 유리: 창 자체는 불투명 취급(transparent:false)이고 배경색 알파 0이 재질을 보이게 한다.
    return {
      transparent: false,
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      thickFrame: false,
      roundedCorners: true,
      hasShadow: true,
      ...extra,
    };
  }
  if (surface === 'focus') {
    return {
      backgroundColor: FOCUS_BACKGROUND,
      transparent: false,
      thickFrame: false,
      hasShadow: false,
      movable: false,
      focusable: true,
      level: 'screen-saver',
      ...extra,
    };
  }
  return { transparent: true, backgroundColor: '#00000000', hasShadow: false, thickFrame: false, ...extra };
}

const chrome = {
  frame: false,
  show: false,
  skipTaskbar: true,
  resizable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  alwaysOnTop: true,
  title: 'Moonlight 펫',
};

function createWindowFactory(options = {}) {
  const openExternal = options.openExternal || (() => {});
  const log = options.log || (() => {});
  const pages = { pagesDir: options.pagesDir, pageFile: options.pageFile };
  const platform = options.platform || process.platform;
  const macGlass = options.macGlass === undefined ? loadMacGlass({ platform, log }) : options.macGlass;

  // 펫 창은 로컬 페이지만 띄운다: 이동은 막고, 새 창 요청은 시스템 브라우저(http·https·mailto)로.
  function guard(win, surface) {
    const contents = win.webContents;
    contents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (isExternalOpenable(url)) openExternal(url);
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalOpenable(url)) openExternal(url);
      return { action: 'deny' };
    });
    contents.on('render-process-gone', (_event, details) => {
      log(`pet:${surface} renderer gone ${details && details.reason}`);
      if (details && details.reason !== 'clean-exit' && !win.isDestroyed()) setTimeout(() => !win.isDestroyed() && contents.reload(), 1000);
    });
  }

  function load(win, surface, query = {}) {
    const file = pagePath(pages, surface);
    const loaded = new Promise((resolve) => {
      win.webContents.once('did-finish-load', () => resolve(true));
      win.webContents.once('did-fail-load', () => resolve(false));
    }).then((ok) => {
      win.petReady = true; // 늦게 만든 창(말풍선)이 불러오기 전에 보낸 메시지를 잃지 않게 셸이 본다
      return ok;
    });
    if (fs.existsSync(file)) win.loadFile(file, { query: { surface, ...query } }).catch(() => {});
    else {
      log(`pet:${surface} page missing ${file}`);
      win.loadURL(fallbackUrl(surface)).catch(() => {});
    }
    return loaded;
  }

  function make(surface, extra, query) {
    const opts = surfaceOptions(surface, platform, extra);
    if (isMac(platform) && macGlass && (surface === 'panel' || surface === 'bubble')) delete opts.vibrancy;
    const win = new BrowserWindow({ ...chrome, ...opts, webPreferences: webPreferences() });
    win.setAlwaysOnTop(true, opts.level || 'floating');
    if (isMac(platform)) {
      try {
        win.setVisibleOnAllWorkspaces(true, MAC_WORKSPACES);
      } catch (error) {
        log(`pet:${surface} all-workspaces failed ${error && error.message}`);
      }
    }
    guard(win, surface);
    win.petSurface = surface;
    win.petPlatform = platform;
    win.petMaterial = isMac(platform) ? (opts.vibrancy || null) : (opts.backgroundMaterial || null); // 스모크가 본다
    if (isMac(platform) && (surface === 'panel' || surface === 'bubble')) {
      win.petNativeGlass = attachMacGlass(win, macGlass, surface === 'bubble' ? 14 : C.GLASS_RADIUS, log);
      if (win.petNativeGlass) win.petMaterial = 'native-clear';
      else {
        win.setVibrancy(MAC_VIBRANCY);
        win.petMaterial = MAC_VIBRANCY;
      }
    }
    win.petReady = false;
    win.petLoaded = load(win, surface, { ...query, material: win.petMaterial || 'none' });
    return win;
  }

  return {
    platform,
    pet: () => make('pet', { width: C.PET_SIZE, height: C.PET_SIZE, focusable: false }),
    panel: () => make('panel', { ...C.glassSize('tasks'), focusable: true }),
    perch: (parent) => make('perch', { parent, width: C.PERCH_SIZE, height: C.PERCH_SIZE, focusable: false }),
    bubble: () => make('bubble', { ...C.BUBBLE_SIZE, focusable: false }),
    focus: (display, primary) => make('focus', { ...display.bounds }, { primary: primary ? '1' : '0', display: String(display.id) }),
  };
}

// 요청한 크기를 페이지가 정확히 받게 한다. 배율에 따라 테두리 없는 창의 콘텐츠가 1px 작게 잡히면
// 모자란 만큼 창을 키운다(main.js applyWidgetBounds와 같은 보정).
function setBoundsExact(win, rect) {
  if (!win || win.isDestroyed()) return;
  win.setBounds(rect);
  const got = win.getContentBounds();
  if (got.width === rect.width && got.height === rect.height) return;
  win.setBounds({ ...rect, width: rect.width * 2 - got.width, height: rect.height * 2 - got.height });
}

// 투명도 줄이기·고대비면 블러 대신 불투명 면. 렌더러 CSS도 prefs를 보고 같이 바꾼다.
// Mac 네이티브는 둥근 면 자체를 불투명하게 전환한다. HUD 대체 경로만 vibrancy를 끄고 켠다.
function applyGlassMaterial(win, prefs, platform = (win && win.petPlatform) || process.platform) {
  if (!win || win.isDestroyed()) return;
  const solid = Boolean(prefs && (prefs.reduceTransparency || prefs.highContrast));
  try {
    if (isMac(platform) && win.petNativeGlass) {
      win.petNativeGlass.setSolid(solid);
      // Native rounded surface paints the solid accessibility fallback. A window
      // background would fill the transparent corners with a rectangular plate.
      win.setBackgroundColor('#00000000');
      return;
    }
    if (isMac(platform)) win.setVibrancy(solid ? null : MAC_VIBRANCY);
    else win.setBackgroundMaterial(solid ? 'none' : 'acrylic');
    win.setBackgroundColor(solid ? SOLID_GLASS : '#00000000');
  } catch { /* 재질을 못 바꾸면 그대로 둔다 */ }
}

module.exports = {
  PET_PAGES, DEFAULT_PAGES_DIR, PRELOAD, FOCUS_BACKGROUND, SOLID_GLASS, MAC_VIBRANCY, MAC_WORKSPACES,
  pagePath, fallbackUrl, surfaceOptions, createWindowFactory, setBoundsExact, applyGlassMaterial,
};

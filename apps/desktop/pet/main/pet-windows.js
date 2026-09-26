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
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');
const C = require('../shared/contract');
const { isExternalOpenable } = require('../../hub-url');

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

const webPreferences = () => ({
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  backgroundThrottling: false,
});

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
    });
    if (fs.existsSync(file)) win.loadFile(file, { query: { surface, ...query } }).catch(() => {});
    else {
      log(`pet:${surface} page missing ${file}`);
      win.loadURL(fallbackUrl(surface)).catch(() => {});
    }
    return loaded;
  }

  function make(surface, extra, query) {
    const win = new BrowserWindow({ ...chrome, ...extra, webPreferences: webPreferences() });
    win.setAlwaysOnTop(true, extra.level || 'floating');
    guard(win, surface);
    win.petSurface = surface;
    win.petLoaded = load(win, surface, query);
    return win;
  }

  const transparent = { transparent: true, backgroundColor: '#00000000', hasShadow: false, thickFrame: false };
  // Acrylic 유리: 창 자체는 불투명 취급(transparent:false)이고 배경색 알파 0이 재질을 보이게 한다.
  const acrylic = {
    transparent: false,
    backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    thickFrame: false,
    roundedCorners: true,
    hasShadow: true,
  };

  return {
    pet: () => make('pet', { ...transparent, width: C.PET_SIZE, height: C.PET_SIZE, focusable: false }),
    panel: () => make('panel', { ...acrylic, ...C.glassSize('tasks'), focusable: true }),
    perch: (parent) => make('perch', { ...transparent, parent, width: C.PERCH_SIZE, height: C.PERCH_SIZE, focusable: false }),
    bubble: () => make('bubble', { ...acrylic, ...C.BUBBLE_SIZE, focusable: false }),
    focus: (display, primary) => make('focus', {
      ...display.bounds,
      backgroundColor: FOCUS_BACKGROUND,
      transparent: false,
      thickFrame: false,
      hasShadow: false,
      movable: false,
      focusable: true,
      level: 'screen-saver',
    }, { primary: primary ? '1' : '0', display: String(display.id) }),
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
function applyGlassMaterial(win, prefs) {
  if (!win || win.isDestroyed()) return;
  const solid = Boolean(prefs && (prefs.reduceTransparency || prefs.highContrast));
  try {
    win.setBackgroundMaterial(solid ? 'none' : 'acrylic');
    win.setBackgroundColor(solid ? SOLID_GLASS : '#00000000');
  } catch { /* 재질을 못 바꾸면 그대로 둔다 */ }
}

module.exports = { PET_PAGES, DEFAULT_PAGES_DIR, PRELOAD, FOCUS_BACKGROUND, pagePath, fallbackUrl, createWindowFactory, setBoundsExact, applyGlassMaterial };

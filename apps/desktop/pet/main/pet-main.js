'use strict';
// Moonlight 펫(Windows·macOS) 셸 — 창·입력·상태·트레이·단축키를 묶고, 허브 채널은 끼워 넣은 hub 객체에 넘긴다.
// main.js가 한 번 부른다: const pet = require('./pet/main/pet-main').install({ app, getHubUrl, openMainUrl, … }).
// 동작 기준: prototypes/moonlight-pet-macos WindowCoordinator + 2026-09-26 운영자 결정(재질 A·세션 공유·타이머 화면만).
// 플랫폼 차이(options.platform, 기본 process.platform)는 창 재질·띄우기·늦게 만들기뿐이다 — 채널·상태·배치 규칙은 같다.
//   macOS: 패널·집중 화면은 showInactive + focus(비활성 패널이라 앱을 활성화하지 않는다 → 허브 창이 앞으로 오지 않음),
//          DWM·활성 유지 도우미 없음(vibrancy 'active'), 걸친 캐릭터·말풍선 창은 처음 쓸 때 만든다(lazyWindows).
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const electron = require('electron');
const C = require('../shared/contract');
const G = require('./pet-geometry');
const { createPetStore, isAllowedStoreKey, STORE_FILE } = require('./pet-store');
const { createPetState, modeTargetFrom, CHARACTER_KEY } = require('./pet-state');
const { createPointerGesture, applyPointerSignal, createEscHold, escHoldInput, registerShortcut, PET_QUICK_ACCELERATOR } = require('./pet-input');
const { applyGlassFrame, createActivationKeeper } = require('./pet-dwm');
const { createWindowFactory, setBoundsExact, applyGlassMaterial } = require('./pet-windows');
const { petTrayItems, characterMenuTemplate, petPlacementItems } = require('./pet-tray');
const { HUB_CHANNELS, envelope, statusFromEnvelope, createHubBridge, hubFromModule } = require('./pet-hub-bridge');
const { createBubbleQueue, clampFocusMinutes, remainingSeconds } = require('./pet-timing');
const { resolveMainPath } = require('../../widget-window');
const { isExternalOpenable } = require('../../hub-url');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
// 펫 자리: { displayId, side: 'left'|'right', ratio(작업 영역 안 세로 비율 0~1), x, y } — 예전 { x, y } 도 읽는다
// (G.resolvePetPlacement). 끌기·메뉴·위젯 접기처럼 운영자가 옮길 때만 쓴다 — 모니터가 빠져 다른 화면으로 밀려난 동안은
// 쓰지 않아서, 그 모니터가 돌아오면 원래 화면으로 돌아간다.
const POSITION_KEY = 'pet.position';
const HIDDEN_KEY = 'pet.hidden'; // 운영자가 펫을 숨겼는가(true 만 저장). 메인 전용 — 렌더러 저장 허용 목록 밖.
const BLUR_GRACE_MS = 400; // 패널을 띄우는 순간의 포커스 흔들림은 "밖을 눌렀다"로 치지 않는다
const CLICK_DEDUPE_MS = 600; // 펫 클릭을 렌더러가 set-presentation으로 한 번 더 보내도 두 번 처리하지 않는다
const FOCUS_TICK_MS = 500;
const REFIT_DELAY_MS = 200;
const GESTURE_STALE_MS = 15000; // 누른 채 이만큼 신호가 없으면 잃은 포인터로 보고 취소
const MAC_REFOCUS_MS = 150; // macOS: 띄운 뒤 키 창을 다시 확인하는 간격 — 150ms·300ms 두 번(BLUR_GRACE_MS 안)
const MAC_REFOCUS_TRIES = 2;
const PERCH_FIX_MS = 60; // macOS: 밀려난 걸친 캐릭터를 제자리로 돌리기 전 기다림(바로 옮기면 화면에 반영되지 않는다)

// 시스템 접근성 설정 → prefs. Electron 버전에 따라 없는 값은 false.
function readPrefs() {
  const { nativeTheme, systemPreferences } = electron;
  let reduceMotion = false;
  try {
    const animation = systemPreferences.getAnimationSettings && systemPreferences.getAnimationSettings();
    if (animation) reduceMotion = Boolean(animation.prefersReducedMotion || animation.shouldRenderRichAnimation === false);
  } catch { /* 지원하지 않는 플랫폼 */ }
  return {
    reduceTransparency: Boolean(nativeTheme.prefersReducedTransparency),
    highContrast: Boolean(nativeTheme.shouldUseHighContrastColors),
    reduceMotion,
  };
}

// 허브 모델은 pet-hub.js 하나다: createPetHub(ctx) → hub. 불러오지 못하면 null(허브 채널은 not-configured).
function loadDefaultHub(ctx, log) {
  let mod;
  try {
    mod = require('./pet-hub');
  } catch (error) {
    log(`pet:hub load failed ${error && error.message}`);
    return null;
  }
  try {
    return hubFromModule(mod, ctx);
  } catch (error) {
    log(`pet:hub create failed ${error && error.message}`);
    return null;
  }
}

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

// 캐릭터 메뉴의 20px 얼굴. macOS 메뉴는 포인트 단위라 1x(20px)만 주면 Retina 에서 흐리다 — 20·40px 두 배율을 한 이미지에
// 담는다. Windows 는 지금처럼 20px 하나(메뉴가 DPI 를 스스로 맞춘다).
function menuIcon(nativeImage, image, platform) {
  const one = image.resize({ width: 20, height: 20, quality: 'best' });
  if (platform !== 'darwin' || !nativeImage || typeof nativeImage.createEmpty !== 'function') return one;
  try {
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1, buffer: one.toPNG() });
    icon.addRepresentation({ scaleFactor: 2, buffer: image.resize({ width: 40, height: 40, quality: 'best' }).toPNG() });
    return icon.isEmpty() ? one : icon;
  } catch {
    return one;
  }
}

function install(options = {}) {
  const { BrowserWindow, Menu, globalShortcut, ipcMain, nativeImage, nativeTheme, powerMonitor, screen, session, shell } = electron;
  const app = options.app || electron.app;
  const getHubUrl = options.getHubUrl || (() => '');
  const openMainUrl = options.openMainUrl || (() => {});
  const showSettings = options.showSettings || (() => {});
  // 트레이 메뉴처럼 한 번 만든 메뉴가 펫 자리·숨김·모니터 목록을 비추면 다시 만들어야 한다(main.js refreshMenus).
  const onMenusChanged = typeof options.onMenusChanged === 'function' ? options.onMenusChanged : () => {};
  const log = options.log || ((message) => console.log(message));
  const activate = options.activate !== false; // 스모크는 false — 운영자 화면의 포커스를 빼앗지 않는다
  const assetsDir = options.assetsDir || ASSETS_DIR;
  const platform = options.platform || process.platform;
  const mac = platform === 'darwin';
  // 걸친 캐릭터·말풍선 창을 처음 쓸 때 만든다(대기 중 렌더러 프로세스 둘을 덜 띄운다). macOS 기본. Windows 는 DWM 속성을
  // 시작할 때 창 둘(패널·말풍선)에 한 번에 거는 흐름을 그대로 두려고 지금처럼 미리 만든다.
  const lazyWindows = options.lazyWindows === undefined ? mac : Boolean(options.lazyWindows);
  const openExternal = (url) => {
    if (typeof url !== 'string' || !isExternalOpenable(url)) return false;
    (options.openExternal || shell.openExternal)(url);
    return true;
  };

  const store = options.store || createPetStore(path.join(app.getPath('userData'), STORE_FILE));
  const alive = new Set();
  const broadcast = (event, payload) => {
    for (const win of alive) if (!win.isDestroyed()) win.webContents.send(event, payload);
  };
  const assetUrl = (name) => pathToFileURL(path.join(assetsDir, name)).href;
  let hub = null; // 허브 모델(pet-hub.js createPetHub) — 아래 '허브'에서 만든다
  // 대화 화면(Council 모드가 열린 패널)을 떠나면 허브에 알려 새 답을 알림으로 돌린다(계약 채널 없이 셸이 부른다).
  let chatWasVisible = false;
  function onStateChange(snapshot) {
    broadcast('pet:state-changed', snapshot);
    const chatVisible = Boolean(snapshot.panelOpen && snapshot.mode === 'council');
    if (chatWasVisible && !chatVisible && hub && typeof hub.chatLeave === 'function') {
      try {
        hub.chatLeave();
      } catch (error) {
        log(`pet:hub chatLeave failed ${error && error.message}`);
      }
    }
    chatWasVisible = chatVisible;
  }
  const state = createPetState({ store, assetUrl, hubUrl: getHubUrl(), onChange: onStateChange });

  let quitting = false;
  const factory = createWindowFactory({ pagesDir: options.pagesDir, pageFile: options.pageFile, openExternal, log, platform });
  const track = (win) => {
    alive.add(win);
    win.on('closed', () => alive.delete(win));
    // Alt+F4 등으로 닫히지 않게 — 숨기기는 셸이 정한다. 종료할 때만 닫힌다.
    if (win.petSurface !== 'focus') {
      win.on('close', (event) => {
        if (quitting) return;
        event.preventDefault();
        if (win.petSurface === 'panel') collapse();
      });
    }
    return win;
  };

  const pet = track(factory.pet());
  const panel = track(factory.panel());
  // 걸친 캐릭터·말풍선: lazyWindows 면 처음 쓸 때 만든다(ensurePerch·ensureBubble). 한 번 만들면 끝날 때까지 둔다.
  let perch = null;
  let bubble = null;
  let focusWindows = [];

  // Acrylic 창(패널·말풍선)에 DWM 둥근 모서리·테두리 없음. 실패해도 계속(결과는 스모크가 본다).
  // Windows 가 아니면 applyGlassFrame 이 곧바로 { error: 'platform' } — 프로세스를 띄우지 않고 로그도 남기지 않는다.
  const glassFrame = (wins) => applyGlassFrame(wins, { platform }).then((result) => {
    if (!result.ok && result.error !== 'platform') log(`pet:dwm degraded ${result.error || JSON.stringify(result.applied)}`);
    return result;
  });
  let dwmReady;

  // 초점을 잃은 Acrylic 패널(지속 위젯, 유예 안의 빠른 패널)은 DWM 이 단색으로 바꾼다 — WM_NCACTIVATE(TRUE)로 블러를 되살린다.
  // macOS 는 vibrancy visualEffectState 'active' 가 같은 일을 하므로 keep() 이 아무것도 하지 않는다.
  const activationKeeper = options.activationKeeper || createActivationKeeper({ log, platform });
  let solidGlass = false; // 투명도 줄이기·고대비(아래 '시스템 설정')

  // 걸친 캐릭터가 있어야 할 자리(패널이 걸친 채 떠 있을 때만).
  const perchTarget = () => (state.panelOpen && perched && companion
    ? G.perchBounds(G.glassFromCompanion(companion, true), side) : null);
  // macOS: 걸친 창은 패널의 자식 창이다. 숨은 채 패널을 옮기고 곧바로 다시 띄우면(접고 바로 위젯, 가장자리·모니터 바꾸기)
  // 창 서버가 캐릭터를 옛 자리에 둔다 — getBounds 는 새 자리인데 화면에는 옛 자리에 남거나, 약 0.1초 뒤 AppKit 이 옛 상대
  // 자리로 한 번 더 밀어낸다(2026-09-29 실측: 왼쪽으로 옮긴 위젯의 캐릭터가 1400pt 오른쪽에 남음). 같은 값으로 다시 놓는 것은
  // AppKit 이 건너뛰고, 밀어내는 도중에 옮긴 것은 화면에 반영되지 않는다 — 그래서 60ms 뒤 1pt 비켰다가 다시 60ms 뒤 제자리에
  // 놓는다(실측으로 화면까지 돌아온다). 띄울 때마다 한 번, 그리고 셸이 옮기지 않은 움직임(move)을 볼 때마다 처음부터 다시.
  let perchFixTimer = null;
  function resyncPerch() {
    clearTimeout(perchFixTimer);
    const win = perch;
    const step = (nudge) => {
      perchFixTimer = setTimeout(() => {
        perchFixTimer = null;
        const target = perchTarget();
        if (!target || !win || win.isDestroyed() || !win.isVisible()) return;
        if (nudge) {
          win.setBounds({ ...target, x: target.x + 1 });
          step(false);
        } else {
          setBoundsExact(win, target);
        }
      }, PERCH_FIX_MS);
    };
    step(true);
  }
  function ensurePerch() {
    if (!perch || perch.isDestroyed()) {
      perch = track(factory.perch(panel));
      if (mac) {
        const win = perch;
        win.on('move', () => {
          const want = perchTarget();
          if (!want || win.isDestroyed()) return;
          const got = win.getBounds();
          // 제자리이거나 셸이 1pt 비켜 놓은 자리(보정 자신)면 그대로.
          if ((got.x === want.x || got.x === want.x + 1) && got.y === want.y) return;
          resyncPerch();
        });
      }
    }
    return perch;
  }
  let bubblePageOk = true; // 말풍선 페이지를 불러오지 못했으면 빈 말풍선을 띄우지 않는다
  function ensureBubble() {
    if (bubble && !bubble.isDestroyed()) return bubble;
    bubble = track(factory.bubble());
    bubblePageOk = true;
    bubble.petLoaded.then((ok) => {
      bubblePageOk = ok !== false;
      if (!bubblePageOk) log('pet:bubble page failed to load — bubbles stay hidden');
    });
    if (solidGlass) applyGlassMaterial(bubble, { reduceTransparency: true });
    if (lazyWindows) glassFrame([bubble]);
    return bubble;
  }
  const perchVisible = () => Boolean(perch && !perch.isDestroyed() && perch.isVisible());
  const bubbleVisible = () => Boolean(bubble && !bubble.isDestroyed() && bubble.isVisible());
  if (!lazyWindows) {
    ensurePerch();
    ensureBubble();
    dwmReady = glassFrame([panel, bubble]);
  } else {
    dwmReady = glassFrame([panel]);
  }

  // ── 위치 ───────────────────────────────────────────────────────────────
  const displays = () => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }));
  const primaryDisplay = () => {
    const d = screen.getPrimaryDisplay();
    return { id: d.id, bounds: d.bounds, workArea: d.workArea };
  };
  const initialPlacement = G.resolvePetPlacement(asObject(store.get(POSITION_KEY)), displays(), primaryDisplay());
  let petBounds = initialPlacement.bounds;
  let side = initialPlacement.side; // 펫이 붙은 가장자리 — 패널·위젯·말풍선·걸친 캐릭터가 모두 이 값으로 거울 배치된다
  const petDisplay = () => screen.getDisplayMatching(petBounds);
  const workArea = () => petDisplay().workArea;
  const savePosition = () => {
    const display = petDisplay();
    store.set(POSITION_KEY, {
      displayId: display.id,
      side,
      ratio: Math.round(G.petYRatio(petBounds.y, display.workArea) * 1e5) / 1e5,
      x: petBounds.x,
      y: petBounds.y,
    });
  };
  const placePet = (bounds) => {
    petBounds = bounds;
    setBoundsExact(pet, petBounds);
  };
  const setSideState = (next) => {
    side = next === 'left' ? 'left' : 'right';
    state.patch({ side });
  };
  placePet(petBounds);
  state.patch({ side }, { silent: true });
  const menusChanged = () => {
    try {
      onMenusChanged();
    } catch (error) {
      log(`pet:menus refresh failed ${error && error.message}`);
    }
  };

  let companion = null; // 지금 패널 덩어리(유리 + 걸친 띠)
  let contentHeight = null; // 렌더러가 pet:resize-content로 바꾼 유리 높이(모드가 바뀌면 되돌린다)
  let perched = false;
  let blurGraceUntil = 0;
  let lastPetClickAt = 0;
  let petHidden = store.get(HIDDEN_KEY) === true;
  state.patch({ hidden: petHidden }, { silent: true });
  let refocusTimer = null;

  const focusRunning = () => state.focus.running;
  const glassSizeNow = () => {
    const base = G.panelGlassSize(state.mode);
    return contentHeight ? { width: base.width, height: contentHeight } : base;
  };

  function syncPet() {
    const visible = !petHidden && !focusRunning() && !(state.panelOpen && perched);
    if (visible && !pet.isVisible()) pet.showInactive();
    else if (!visible && pet.isVisible()) pet.hide();
  }

  // 유리 창과 걸친 캐릭터 창을 덩어리 자리에 놓는다. 걸친 창은 패널이 보일 때만 보인다.
  function layoutPanel(frame, isPerchedNow) {
    companion = frame;
    const glass = G.glassFromCompanion(frame, isPerchedNow);
    setBoundsExact(panel, glass);
    if (isPerchedNow) {
      // 늦게 만든 걸친 창은 페이지가 뜨기 전엔 투명한 빈 창이라 먼저 띄워도 보이는 것이 없다.
      setBoundsExact(ensurePerch(), G.perchBounds(glass, side));
      if (panel.isVisible() && !perch.isVisible()) perch.showInactive();
    } else if (perchVisible()) {
      perch.hide();
    }
  }

  function revealPanel() {
    blurGraceUntil = Date.now() + BLUR_GRACE_MS;
    if (activate && mac) {
      // show()는 앱을 활성화해 허브 창까지 앞으로 올린다. 비활성 패널은 showInactive 로 띄운 뒤 focus()로 키 창이 된다
      // (앱 활성화 없이 키 입력·Esc 를 받는다). 앱 활성화(app.focus steal)는 쓰지 않는다 — 다른 앱 뒤에 보이는 허브 창까지
      // 모두 앞으로 올라온다(코드 리뷰 2026-09-29, 여는 횟수의 약 20%).
      panel.showInactive();
      panel.focus();
      panel.webContents.focus();
      // 비활성 패널의 첫 키 창 잡기가 가끔 늦게 풀린다(위젯 창에서 실측 약 3/15) — 띄우는 순간의 유예 안에서
      // 150ms·300ms 에 다시 잡는다(잡히면 멈춘다).
      clearTimeout(refocusTimer);
      const retry = (left) => {
        refocusTimer = setTimeout(() => {
          refocusTimer = null;
          if (!state.panelOpen || !panel.isVisible() || panel.isFocused() || Date.now() >= blurGraceUntil) return;
          panel.focus();
          panel.webContents.focus();
          if (left > 1 && !panel.isFocused()) retry(left - 1);
        }, MAC_REFOCUS_MS);
      };
      retry(MAC_REFOCUS_TRIES);
    } else if (activate) {
      panel.show();
      panel.focus();
      if (!panel.isFocused()) {
        // Windows 전경 잠금: 항상 위를 한 번 껐다 켜고 다시 앞으로(목업 하네스와 같은 우회).
        panel.setAlwaysOnTop(false);
        panel.setAlwaysOnTop(true, 'floating');
        panel.show();
        panel.focus();
      }
      panel.webContents.focus();
    } else {
      panel.showInactive();
    }
    if (perched) {
      const wasHidden = !perchVisible();
      ensurePerch().showInactive();
      perch.moveTop();
      if (mac && wasHidden) resyncPerch(); // 위 ensurePerch 주석 — 숨었다 다시 뜬 캐릭터의 자리를 창 서버에 다시 알린다
    }
  }

  // ── 패널: 빠른 패널·지속 위젯·접기 ─────────────────────────────────────
  function openQuick() {
    if (focusRunning()) return state.get();
    if (petHidden) setHidden(false); // 숨긴 펫에서 빠른 기능을 부르면(⌃⌥M·트레이) 펫을 다시 보이고 연다
    // 지속 위젯에서 빠른 패널로: 먼저 위젯을 접어 펫을 위젯 위 끝에 맞춘 뒤(Mac alignPet) 그 자리에서 연다.
    if (state.panelOpen && state.presentation === 'widget') collapse({ resume: false });
    bubbles.dismiss();
    contentHeight = null;
    perched = G.isPerched({ presentation: 'quick', mode: state.mode });
    state.patch({ presentation: 'quick', pinned: false, panelOpen: true, perched });
    layoutPanel(G.quickCompanionFrame(petBounds, glassSizeNow(), perched, workArea(), side), perched);
    syncPet();
    revealPanel();
    return state.get();
  }

  function showWidget(mode) {
    if (focusRunning()) return state.get();
    if (petHidden) setHidden(false);
    if (C.MODES.includes(mode) && mode !== state.mode) {
      state.setMode(mode);
      contentHeight = null;
    }
    bubbles.dismiss();
    if (state.panelOpen && state.presentation === 'widget') {
      relayout();
      revealPanel();
      return state.get();
    }
    contentHeight = null;
    perched = true;
    state.patch({ presentation: 'widget', pinned: true, panelOpen: true, perched });
    layoutPanel(G.widgetCompanionFrame(petBounds, glassSizeNow(), true, workArea(), side), true);
    syncPet();
    revealPanel();
    return state.get();
  }

  function collapse({ resume = true } = {}) {
    if (!state.panelOpen) return state.get();
    if (state.presentation === 'widget' && companion) {
      placePet(G.petAlignedToCompanion(companion, workArea(), side));
      savePosition();
    }
    // 상태를 먼저 닫는다 — hide()가 곧바로 blur를 보내도 다시 접기로 들어오지 않게.
    perched = false;
    state.patch({ panelOpen: false, pinned: false, presentation: 'quick', perched: false });
    panel.hide();
    if (perch) perch.hide();
    cancelGesture('panel'); // 숨긴 창에서는 pointerup 이 오지 않는다
    setWash(false);
    syncPet();
    if (resume) bubbles.pump();
    return state.get();
  }

  function toggleQuick() {
    if (focusRunning()) return state.get();
    if (state.panelOpen && state.presentation === 'quick') return collapse();
    return openQuick();
  }

  // 모드·높이가 바뀌면 덩어리의 바깥쪽 위(오른쪽 가장자리면 오른쪽 위)를 고정한 채 크기를 바꾼다(Mac resizeBar·resizeWidget).
  function relayout() {
    if (!state.panelOpen || !companion) return;
    perched = G.isPerched({ presentation: state.presentation, mode: state.mode });
    state.patch({ perched });
    const frame = G.resizedKeepingOuterTop(companion, G.companionSize(glassSizeNow(), perched), workArea(), side);
    layoutPanel(frame, perched);
    syncPet();
  }

  // payload 는 'pet:set-mode' 그대로 — {mode, date?} · {mode, ownerId?, scope?} 면 그 날짜·대화를 목적지로 함께 알린다
  // (알림에서 열 때). 목적지가 있으면 같은 모드여도 패널이 다시 고른다.
  function setMode(mode, payload) {
    if (!C.MODES.includes(mode)) return state.get();
    const target = modeTargetFrom(mode, payload);
    if (mode === state.mode && !target) return state.get();
    if (mode !== state.mode) contentHeight = null;
    state.setMode(mode, target);
    relayout();
    return state.get();
  }

  // 트레이·알림·펫 메뉴: 위젯이 떠 있으면 그 위젯의 모드만, 아니면 빠른 패널을 그 모드로.
  function openMode(mode) {
    if (focusRunning() || !C.MODES.includes(mode)) return state.get();
    if (state.panelOpen && state.presentation === 'widget') {
      setMode(mode);
      revealPanel();
      return state.get();
    }
    if (mode !== state.mode) {
      contentHeight = null;
      state.setMode(mode);
    }
    return openQuick();
  }

  function resizeContent(height) {
    if (!state.panelOpen || !companion) return null;
    const next = G.clampContentHeight(height, workArea(), perched);
    if (next === null) return null;
    contentHeight = next;
    relayout();
    return next;
  }

  // 빠른 패널은 밖을 누르거나 다른 앱으로 가면 접힌다. 지속 위젯은 남는다.
  panel.on('blur', () => {
    if (state.panelOpen && state.presentation === 'quick' && Date.now() >= blurGraceUntil) {
      collapse();
      return;
    }
    // 남아 있는 패널: 투명도 줄이기(불투명 면)가 아니면 블러를 되살린다.
    if (state.panelOpen && !solidGlass && panel.isVisible()) activationKeeper.keep(panel);
  });

  // ── 끌기·누름·클릭 ──────────────────────────────────────────────────────
  let washOn = false;
  const washPayload = () => {
    const c = C.characterByKey(state.character);
    return { on: washOn, color: c.color, opacity: c.wash };
  };
  function setWash(on) {
    if (washOn === on) return;
    washOn = on;
    broadcast('pet:wash', washPayload());
  }

  // 빠른 패널·말풍선을 지금 펫 자리에 다시 맞춘다(끌기 중·놓은 뒤).
  function followPet() {
    const wa = workArea();
    if (state.panelOpen && state.presentation === 'quick') {
      layoutPanel(G.quickCompanionFrame(petBounds, glassSizeNow(), perched, wa, side), perched);
    }
    if (bubbleVisible()) setBoundsExact(bubble, G.bubbleBounds(petBounds, wa, side));
  }

  // 펫 끌기는 자유롭다(가로·세로, 다른 모니터로도). 끄는 동안의 날 자리(petDrag)에 움직임을 쌓고, 펫 가운데가 있는 화면의
  // 작업 영역 안에 그린다. 놓으면 그 화면의 가까운 가장자리(왼쪽·오른쪽)로 붙고 저장한다(G.snapPetToEdge).
  let petDrag = null;
  function dragPetBy(dx, dy) {
    if (!petDrag) petDrag = { x: petBounds.x, y: petBounds.y, side, displayId: petDisplay().id };
    petDrag.x += Number.isFinite(dx) ? dx : 0;
    petDrag.y += Number.isFinite(dy) ? dy : 0;
    placePet(G.freeDragBounds(petDrag, displays()));
    followPet();
  }
  function endPetDrag() {
    const start = petDrag || { side, displayId: petDisplay().id };
    petDrag = null;
    const snapped = G.snapPetToEdge(petBounds, displays());
    const moved = snapped.side !== start.side || snapped.displayId !== start.displayId;
    setSideState(snapped.side);
    placePet(snapped.bounds);
    followPet();
    savePosition();
    if (moved) menusChanged();
  }

  // 패널 손잡이·걸친 캐릭터 끌기는 지금처럼 세로만.
  function moveCompanionBy(dy) {
    if (!state.panelOpen || !companion) return;
    const wa = workArea();
    const previous = companion;
    const next = G.movedVertically(previous, dy, wa);
    layoutPanel(next, perched);
    if (state.presentation === 'widget') placePet(G.petAlignedToCompanion(next, wa, side));
    else placePet(G.petBoundsAt(petBounds.y + (next.y - previous.y), wa, side));
  }

  // 끌기가 끝났다(놓음·잃음). 펫은 가장자리로 붙이고, 패널은 자리만 저장한다.
  function finishDrag(from) {
    if (from === 'pet') endPetDrag();
    else savePosition();
  }

  const gestures = { pet: createPointerGesture(), panel: createPointerGesture() };
  // 누른 채 신호가 끊기면(창이 사라짐·pointerup 유실) 워시가 남고 다음 누름이 옛 제스처에 섞인다.
  // 신호가 GESTURE_STALE_MS 동안 없으면 그 제스처를 클릭 없이 취소한다.
  const gestureWatch = { pet: null, panel: null };
  function cancelGesture(from) {
    clearTimeout(gestureWatch[from]);
    gestureWatch[from] = null;
    const actions = gestures[from].cancel();
    if (actions.some((a) => a.type === 'drag-end')) finishDrag(from);
    if (!gestures.pet.isDown && !gestures.panel.isDown) setWash(false);
  }
  function watchGesture(from) {
    clearTimeout(gestureWatch[from]);
    gestureWatch[from] = gestures[from].isDown ? setTimeout(() => cancelGesture(from), GESTURE_STALE_MS) : null;
  }
  // 가로 좌표: 렌더러가 screenX 를 보내지 않으면(구 페이지·손잡이) 메인이 커서 위치로 채운다 — 펫만.
  function cursorX() {
    try {
      const point = typeof screen.getCursorScreenPoint === 'function' ? screen.getCursorScreenPoint() : null;
      return point && Number.isFinite(point.x) ? point.x : null;
    } catch {
      return null;
    }
  }
  function onPointer(surface, channel, payload) {
    const from = surface === 'pet' ? 'pet' : 'panel';
    let signal = payload;
    if (from === 'pet' && channel === 'pet:drag' && signal && Number.isFinite(signal.screenY) && !Number.isFinite(signal.screenX)) {
      const x = cursorX();
      if (x !== null) signal = { ...signal, screenX: x };
    }
    const actions = applyPointerSignal(gestures[from], channel, signal);
    watchGesture(from);
    for (const action of actions) {
      if (action.type === 'press' || action.type === 'drag-begin') setWash(true);
      else if (action.type === 'release') setWash(false);
      else if (action.type === 'drag-move') {
        if (from === 'pet') dragPetBy(action.dx, action.dy);
        else moveCompanionBy(action.dy);
      } else if (action.type === 'drag-end') finishDrag(from);
      else if (from === 'pet' && action.type === 'click') {
        lastPetClickAt = Date.now();
        toggleQuick();
      } else if (from === 'pet' && action.type === 'double-click') {
        lastPetClickAt = Date.now();
        showWidget('tasks');
      }
    }
    return null;
  }

  // ── 오른쪽 클릭 메뉴 ────────────────────────────────────────────────────
  const iconCache = new Map();
  function iconFor(character) {
    if (iconCache.has(character.key)) return iconCache.get(character.key);
    let icon;
    const file = path.join(assetsDir, character.portrait);
    try {
      if (fs.existsSync(file)) {
        const image = nativeImage.createFromPath(file);
        if (!image.isEmpty()) icon = menuIcon(nativeImage, image, platform);
      }
    } catch { /* 아이콘 없이 */ }
    iconCache.set(character.key, icon);
    return icon;
  }
  function showContextMenu() {
    const menu = Menu.buildFromTemplate([
      ...characterMenuTemplate({
        current: state.character,
        onNotifications: () => openMode('notifications'),
        onSelect: (key) => setCharacter(key),
        iconFor,
      }),
      { type: 'separator' },
      ...placementMenuItems(),
    ]);
    menu.popup({ window: pet.isVisible() ? pet : panel });
    return null;
  }
  function setCharacter(key) {
    if (state.setCharacter(key) && washOn) broadcast('pet:wash', washPayload());
    return state.get();
  }

  // ── 자리: 가장자리·모니터·초기화·숨기기 ────────────────────────────────
  // 떠 있던 패널은 접고 펫을 옮긴 뒤, 위젯이었으면 새 자리에서 같은 모드로 다시 연다(빠른 패널은 접힌 채).
  function relocate(bounds, nextSide) {
    const widgetMode = state.panelOpen && state.presentation === 'widget' ? state.mode : null;
    if (state.panelOpen) collapse({ resume: false });
    petDrag = null;
    setSideState(nextSide);
    placePet(bounds);
    savePosition();
    followPet();
    if (widgetMode && !petHidden) showWidget(widgetMode);
    else bubbles.pump();
    menusChanged();
    return state.get();
  }
  function setSide(next) {
    if (!C.PET_SIDES.includes(next)) return state.get();
    return relocate(G.petBoundsAt(petBounds.y, workArea(), next), next);
  }
  // 다른 모니터로: 같은 가장자리, 작업 영역 안 같은 세로 비율(높이가 다른 화면이어도 같은 높이감).
  function moveToDisplay(id) {
    const target = displays().find((d) => d.id === id);
    if (!target) return state.get();
    return relocate(G.petBoundsOnDisplay(target, side, G.petYRatio(petBounds.y, workArea())), side);
  }
  // 처음 자리(주 모니터 오른쪽 가장자리, 아래쪽 1/3)로 — 숨겨 두었으면 다시 보인다.
  function resetPosition() {
    relocate(G.defaultPetBounds(primaryDisplay().workArea, 'right'), 'right');
    return setHidden(false);
  }
  // 숨기기: 펫·패널·말풍선을 내리고(알림은 줄에서 기다린다) 다시 보일 때까지 둔다. 끄고 켜도 유지(pet.hidden).
  // 다시 보이기: 트레이·펫 메뉴 '펫 보이기', ⌃⌥M 과 빠른 기능·위젯·짧은 메시지를 여는 모든 경로.
  function setHidden(hidden) {
    const next = Boolean(hidden);
    if (next === petHidden) return state.get();
    petHidden = next;
    store.set(HIDDEN_KEY, next ? true : null);
    if (next) {
      if (state.panelOpen) collapse({ resume: false });
      cancelGesture('pet');
      bubbles.dismiss({ gap: false });
    }
    state.patch({ hidden: next });
    syncPet();
    if (!next) bubbles.pump();
    menusChanged();
    return state.get();
  }
  const placementActions = { moveToDisplay, setSide, resetPosition, setHidden };
  function placementMenuItems() {
    return petPlacementItems({
      displays: displays(),
      primaryId: primaryDisplay().id,
      displayId: petDisplay().id,
      side,
      hidden: petHidden,
    }, placementActions);
  }

  // ── 짧은 메시지 ─────────────────────────────────────────────────────────
  const fromHub = new WeakSet(); // 허브가 넘긴 알림(셸이 직접 넣은 것 — pushNotice — 은 다시 거르지 않는다)
  // 말풍선 창이 아직 페이지를 불러오는 중이면(늦게 만든 창) 다 불러온 뒤에 내용을 보내고 띄운다 — 그 사이 내리면(hide)
  // 차례 번호가 바뀌어 띄우지 않는다. 이미 불러온 창은 지금처럼 곧바로.
  let bubbleTurn = 0;
  const bubbles = createBubbleQueue({
    canShow: () => !state.panelOpen && !focusRunning() && !petHidden,
    // 허브가 넘긴 알림은 보이기 직전에 허브 목록으로 다시 거른다(줄에서 기다리는 동안 읽음·숨김·시작한 일정).
    isValid: (notice) => {
      if (!notice || !fromHub.has(notice) || !hub || typeof hub.isNoticePresentable !== 'function') return true;
      return hub.isNoticePresentable(notice.id) === true;
    },
    // 결과: 띄웠으면 true, 못 띄우면 false, 불러오는 중이면 그 결과의 Promise — 줄은 실제로 뜬 뒤부터 8초를 잰다.
    show: (notice) => {
      const win = ensureBubble();
      const turn = ++bubbleTurn;
      const present = (ok) => {
        if (ok === false || !bubblePageOk || turn !== bubbleTurn || win.isDestroyed()) return false;
        setBoundsExact(win, G.bubbleBounds(petBounds, workArea(), side));
        win.webContents.send('pet:notice', { notice: notice || null });
        win.showInactive();
        return true;
      };
      if (win.petReady) return present(true);
      return win.petLoaded.then(present);
    },
    hide: () => {
      bubbleTurn += 1;
      if (bubble && !bubble.isDestroyed()) bubble.hide();
    },
    isVisible: bubbleVisible,
  });
  function toggleBubble() {
    if (focusRunning()) return false;
    if (petHidden) setHidden(false);
    if (!bubbleVisible() && state.panelOpen) collapse({ resume: false });
    return bubbles.toggle();
  }

  // ── 집중 화면(타이머만 — 앱 전환은 막지 않는다) ─────────────────────────
  let focusEndsAt = 0;
  let focusTimer = null;
  // 중지 확인을 거둔다 — dismissRevision 을 올려 모든 집중 창(보조 모니터에서 누른 Esc 포함)이 닫게 한다.
  function dismissStopConfirm() {
    if (!state.focus.confirmStop) return;
    state.patch({ focus: { confirmStop: false, dismissRevision: (state.focus.dismissRevision || 0) + 1 } });
  }
  const escHold = createEscHold({
    onHold: () => {
      if (!focusRunning()) return;
      state.patch({ focus: { confirmStop: true, confirmRevision: state.focus.confirmRevision + 1 } });
    },
    // 확인이 떠 있을 때의 Esc 는 닫기만 하고, 그 누름은 뗄 때까지 새 1.3초를 재지 않는다.
    isConfirming: () => focusRunning() && state.focus.confirmStop === true,
    onDismiss: dismissStopConfirm,
  });

  function destroyFocusWindows() {
    const closing = focusWindows;
    focusWindows = [];
    for (const win of closing) if (!win.isDestroyed()) win.destroy();
  }

  function buildFocusWindows() {
    destroyFocusWindows();
    const primaryId = screen.getPrimaryDisplay().id;
    for (const display of screen.getAllDisplays()) {
      const primary = display.id === primaryId;
      const win = track(factory.focus(display, primary));
      win.on('close', (event) => {
        if (!quitting && focusRunning()) event.preventDefault(); // 중지는 확인을 거친다
      });
      win.on('blur', () => escHold.cancel());
      // Esc 길이는 메인이 잰다. 키는 페이지에도 그대로 간다 — 페이지는 누르는 동안 진행선을 그리고,
      // 확인이 떠 있을 때 Esc 로 그 확인을 닫는다(메인이 막으면 페이지가 Esc 를 영영 받지 못한다).
      win.webContents.on('before-input-event', (_event, input) => {
        escHoldInput(escHold, input);
      });
      setBoundsExact(win, display.bounds);
      if (primary && activate && mac) {
        win.showInactive(); // show()는 앱을 활성화해 허브 창을 올린다 — 비활성 패널은 focus()만으로 키 창이 된다
        win.focus();
      } else if (primary && activate) {
        win.show();
        win.focus();
      } else {
        win.showInactive();
      }
      // macOS 는 보이는 순간 창을 메뉴 막대 아래로 밀 수 있다 — 띄운 뒤 화면 전체(메뉴 막대·Dock 포함)로 다시 맞춘다.
      if (mac) setBoundsExact(win, display.bounds);
      focusWindows.push(win);
    }
  }

  const focusEnvelope = () => envelope('live', state.focus);

  function startFocus(minutesInput) {
    if (focusRunning()) return focusEnvelope();
    const minutes = clampFocusMinutes(minutesInput === undefined || minutesInput === null ? state.focus.minutes : minutesInput);
    if (minutes === null) return envelope('invalid', null, 'minutes');
    bubbles.dismiss();
    collapse({ resume: false });
    cancelGesture('pet');
    focusEndsAt = Date.now() + minutes * 60000;
    state.patch({ focus: { running: true, minutes, totalSec: minutes * 60, remainingSec: minutes * 60, confirmStop: false } });
    syncPet();
    buildFocusWindows();
    focusTimer = setInterval(tickFocus, FOCUS_TICK_MS);
    return focusEnvelope();
  }

  function tickFocus() {
    const remaining = remainingSeconds(focusEndsAt, Date.now());
    if (remaining !== state.focus.remainingSec) {
      state.patch({ focus: { remainingSec: remaining } }, { silent: true });
      broadcast('pet:focus-tick', { remainingSec: remaining });
    }
    if (remaining === 0) stopFocus();
  }

  function stopFocus() {
    if (!focusRunning()) return focusEnvelope();
    clearInterval(focusTimer);
    focusTimer = null;
    escHold.cancel();
    destroyFocusWindows();
    state.patch({ focus: { running: false, remainingSec: 0, totalSec: 0, confirmStop: false } });
    syncPet();
    bubbles.pump();
    return focusEnvelope();
  }

  // ── 허브 ────────────────────────────────────────────────────────────────
  function hubEmit(event, payload) {
    if (!C.PET_EVENTS.includes(event) || event === 'pet:state-changed' || event === 'pet:wash' || event === 'pet:focus-tick') return false;
    const data = asObject(payload);
    if (event === 'pet:notice') {
      // 알림 목록이 열려 있으면 새 알림을 바로 반영한다(말풍선 창은 줄이 보여 줄 때 받는다).
      if (!panel.isDestroyed()) panel.webContents.send('pet:notice', payload);
      if (data.notice && typeof data.notice === 'object') fromHub.add(data.notice);
      return bubbles.push(data.notice);
    }
    if (event === 'pet:hub-status') state.setHubStatus(data.status);
    if (event === 'pet:badge') state.setBadge(data.count);
    broadcast(event, payload);
    return true;
  }
  const hubContext = Object.freeze({
    emit: hubEmit,
    store,
    getHubUrl,
    session: session.defaultSession,
    openMainUrl,
    getState: () => state.get(),
    contract: C,
    log,
  });
  if (options.hub === undefined) hub = loadDefaultHub(hubContext, log);
  else if (typeof options.hub === 'function') hub = options.hub(hubContext) || null;
  else hub = options.hub || null;
  if (hub && typeof hub.attach === 'function') {
    try {
      hub.attach(hubContext);
    } catch (error) {
      log(`pet:hub attach failed ${error && error.message}`);
    }
  }
  const callHub = createHubBridge(() => hub);
  const initialHubStatus = () => (getHubUrl() && hub ? 'unknown' : 'not-configured');
  // 연결 상태의 정본은 허브 모델이다(세션 확인·폴링 결과). 모델이 상태를 내놓지 않으면 봉투로 짐작한다.
  const hubModelStatus = () => (hub && typeof hub.status === 'string' ? hub.status : null);
  state.patch({ hubStatus: hubModelStatus() || initialHubStatus() }, { silent: true });

  // 설정 저장마다 불린다(main.js). 주소가 그대로면 상태를 'unknown'으로 되돌리지 않는다 — 허브가 확인 뒤 상태를 다시 알린다.
  function hubUrlChanged() {
    const url = getHubUrl();
    const changed = url !== state.get().hubUrl;
    state.patch(changed ? { hubUrl: url, hubStatus: initialHubStatus() } : { hubUrl: url });
    if (hub && typeof hub.hubUrlChanged === 'function') {
      try {
        const done = hub.hubUrlChanged(url);
        if (done && typeof done.catch === 'function') done.catch((error) => log(`pet:hub url change failed ${error && error.message}`));
        return done;
      } catch (error) {
        log(`pet:hub url change failed ${error && error.message}`);
      }
    }
    return Promise.resolve();
  }

  function openHub(target) {
    const hubUrl = getHubUrl();
    if (!hubUrl) {
      showSettings();
      return { ok: false, reason: 'no-hub' };
    }
    const result = resolveMainPath(target, hubUrl);
    if (!result.ok) return { ok: false, reason: result.reason };
    openMainUrl(result.url);
    return { ok: true };
  }

  // ── IPC: 펫 창의 최상위 프레임에서 온 호출만 ─────────────────────────────
  function surfaceOf(event) {
    const frame = event.senderFrame;
    if (!frame || frame.parent) return null;
    for (const win of alive) {
      if (!win.isDestroyed() && win.webContents === event.sender) return win.petSurface;
    }
    return null;
  }

  const handlers = {
    'pet:state': () => state.get(),
    'pet:set-character': (p) => setCharacter(p.key),
    // {mode} — 모드만. 알림에서 열 때는 {mode:'calendar', date:'YYYY-MM-DD'} · {mode:'council', ownerId, scope?}
    // 로 그 날짜·그 대화를 함께 고른다(state.modeTarget 의 새 seq 로 패널에 전한다).
    'pet:set-mode': (p) => setMode(p.mode, p),
    'pet:set-presentation': (p, surface) => {
      // 펫 클릭은 메인이 이미 처리했다 — 렌더러가 같은 뜻으로 한 번 더 보내면 무시.
      if (surface === 'pet' && Date.now() - lastPetClickAt < CLICK_DEDUPE_MS) return state.get();
      if (p.presentation === 'widget') return showWidget(state.mode);
      if (p.presentation === 'quick') return state.panelOpen && state.presentation === 'quick' ? state.get() : openQuick();
      return state.get();
    },
    // 말풍선의 닫기(X)는 그 말풍선만 내린다(읽음 아님) — 패널 접기와 다르다. 보낸 창(surface)으로 가른다.
    'pet:collapse': (_p, surface) => {
      if (surface === 'bubble') {
        bubbles.dismiss();
        return state.get();
      }
      return collapse();
    },
    'pet:open-hub': (p, surface) => {
      const result = openHub(p.path);
      if (surface === 'bubble' && result.ok) bubbles.dismiss(); // 말풍선에서 연 알림은 메인 창으로 넘어갔다
      return result;
    },
    'pet:open-external': (p) => ({ ok: openExternal(p.url) }),
    'pet:drag': (p, surface) => onPointer(surface, 'pet:drag', p),
    'pet:press': (p, surface) => onPointer(surface, 'pet:press', p),
    'pet:resize-content': (p) => resizeContent(p.height),
    'pet:context-menu': () => showContextMenu(),
    'pet:store-get': (p) => (isAllowedStoreKey(p.key) ? store.get(p.key) : null),
    'pet:store-set': (p) => {
      if (!isAllowedStoreKey(p.key)) return { ok: false, reason: 'key' };
      if (p.key === CHARACTER_KEY) {
        // 캐릭터는 상태가 소유한다 — 저장소에 직접 쓰지 않고 선택을 바꾼다(저장·알림 포함).
        if (!C.CHARACTERS.some((c) => c.key === p.value)) return { ok: false, reason: 'value' };
        setCharacter(p.value);
        return { ok: true };
      }
      return store.set(p.key, p.value === undefined ? null : p.value);
    },
    'pet:focus-start': (p) => startFocus(p.minutes),
    'pet:focus-stop': () => stopFocus(),
    // 읽기. {dismissConfirm:true} 면 떠 있던 중지 확인을 거둔다('계속 집중'·확인 중 Esc) — 다음 상태 방송에 다시 뜨지 않게.
    // 지금 Esc 가 눌려 있으면(페이지가 그 Esc 로 확인을 닫았다) 뗄 때까지 새 1.3초를 재지 않는다.
    'pet:focus-state': (p) => {
      if (p.dismissConfirm === true) {
        escHold.latch();
        dismissStopConfirm();
      }
      return focusEnvelope();
    },
  };
  for (const channel of HUB_CHANNELS) {
    handlers[channel] = async (p, surface) => {
      const result = await callHub(channel, p, { surface });
      const status = hubModelStatus() || statusFromEnvelope(result, channel);
      if (status) state.setHubStatus(status);
      if (channel === 'pet:council-handoff') return openHandoff(result);
      return result;
    };
  }
  // Council 안건: 허브 모델이 만든 허브 상대 경로(조각 '#moonlight-council=…' 포함)를 메인 창에서 연다. AI 실행은 웹에서 누를 때만.
  function openHandoff(result) {
    if (result.kind !== 'live' || !result.data || typeof result.data.path !== 'string') return result;
    const opened = openHub(result.data.path);
    if (opened.ok) return { ...result, data: { ...result.data, opened: true } };
    return envelope('error', { ...result.data, opened: false }, opened.reason === 'no-hub' ? 'hub-url-missing' : 'rejected-url');
  }
  const missing = C.PET_INVOKE.filter((channel) => !handlers[channel]);
  if (missing.length) throw new Error(`pet-main: no handler for ${missing.join(', ')}`);

  for (const channel of C.PET_INVOKE) {
    ipcMain.handle(channel, async (event, payload) => {
      const surface = surfaceOf(event);
      if (!surface) throw new Error('moonlightPet: pet windows only');
      return handlers[channel](asObject(payload), surface);
    });
  }

  // ── 시스템 설정·화면 배치·단축키 ─────────────────────────────────────────
  // 재질은 불투명 여부가 바뀔 때만 다시 건다(테마만 바뀐 'updated'에서 Acrylic을 다시 켜지 않는다).
  // 아직 만들지 않은 말풍선은 만들 때 solidGlass 를 보고 건다(ensureBubble).
  function applyPrefs(prefs) {
    const solid = Boolean(prefs.reduceTransparency || prefs.highContrast);
    if (solid === solidGlass) return;
    solidGlass = solid;
    applyGlassMaterial(panel, prefs);
    if (bubble) applyGlassMaterial(bubble, prefs);
  }
  function refreshPrefs() {
    const prefs = readPrefs();
    state.patch({ prefs });
    applyPrefs(prefs);
  }
  const initialPrefs = readPrefs();
  state.patch({ prefs: initialPrefs }, { silent: true });
  applyPrefs(initialPrefs);
  nativeTheme.on('updated', refreshPrefs);

  let refitTimer = null;
  // 모니터가 붙거나 빠지거나 해상도가 바뀌면: 저장된 자리(모니터·가장자리·세로 비율)를 지금 배치에서 다시 푼다.
  // 저장된 모니터가 없으면 가장 가까운 모니터의 같은 가장자리로 가되 저장은 하지 않는다 — 그 모니터가 돌아오면 원래 자리로.
  // 아직 한 번도 옮기지 않았으면(저장 없음) 지금 자리를 기준으로 푼다.
  function refit() {
    refitTimer = null;
    const saved = asObject(store.get(POSITION_KEY));
    const fallback = { x: petBounds.x, y: petBounds.y, side };
    const placed = G.resolvePetPlacement(Object.keys(saved).length ? saved : fallback, displays(), primaryDisplay());
    setSideState(placed.side);
    placePet(placed.bounds);
    menusChanged(); // 모니터 목록이 바뀌었다
    if (focusRunning()) {
      buildFocusWindows();
      return;
    }
    const wa = workArea();
    if (state.panelOpen) {
      const frame = state.presentation === 'widget'
        ? G.widgetCompanionFrame(petBounds, glassSizeNow(), perched, wa, side)
        : G.quickCompanionFrame(petBounds, glassSizeNow(), perched, wa, side);
      layoutPanel(frame, perched);
    }
    if (bubbleVisible()) setBoundsExact(bubble, G.bubbleBounds(petBounds, wa, side));
  }
  const scheduleRefit = () => {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(refit, REFIT_DELAY_MS);
  };
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, scheduleRefit);

  if (options.registerShortcut !== false) registerShortcut(globalShortcut, PET_QUICK_ACCELERATOR, toggleQuick, (m) => log(m));

  const onBeforeQuit = () => {
    quitting = true;
    store.flush();
  };
  app.on('before-quit', onBeforeQuit);

  // 잠자기·화면 잠금 동안은 허브 폴링을 멈추고, 깨어나거나 잠금을 풀면 다시 켠다(켤 때 곧바로 한 번 확인).
  // 폴링이 돌고 있었을 때만 — 아직 켜지 않았거나(창을 그리기 전) 허브가 없으면 켜지 않는다.
  let pollingActive = false;
  let pollingPaused = false;
  function pausePolling() {
    if (!pollingActive || pollingPaused || !hub || typeof hub.stopPolling !== 'function') return;
    pollingPaused = true;
    try {
      hub.stopPolling();
    } catch (error) {
      log(`pet:hub stop polling failed ${error && error.message}`);
    }
  }
  function resumePolling() {
    if (!pollingPaused || quitting) return;
    pollingPaused = false;
    try {
      hub.startPolling();
    } catch (error) {
      log(`pet:hub polling failed ${error && error.message}`);
    }
  }
  const POWER_PAUSE = ['suspend', 'lock-screen'];
  const POWER_RESUME = ['resume', 'unlock-screen'];
  const power = powerMonitor && typeof powerMonitor.on === 'function' ? powerMonitor : null;
  if (power) {
    for (const event of POWER_PAUSE) power.on(event, pausePolling);
    for (const event of POWER_RESUME) power.on(event, resumePolling);
  }

  // 첫 화면: 펫 페이지가 그려지면 대기 얼굴을 띄운다.
  // 창이 다 그려진 뒤에 허브 폴링을 켠다 — 첫 새 알림이 아직 불러오지 않은 말풍선 페이지로 가지 않게
  // (늦게 만드는 말풍선은 show 가 불러오기를 기다린다).
  const ready = Promise.all([pet, panel, perch, bubble].filter(Boolean).map((win) => win.petLoaded)).then(() => {
    if (!pet.isDestroyed()) syncPet();
    if (hub && typeof hub.startPolling === 'function' && !quitting) {
      try {
        hub.startPolling();
        pollingActive = true;
      } catch (error) {
        log(`pet:hub polling failed ${error && error.message}`);
      }
    }
    return true;
  });

  function dispose() {
    quitting = true;
    for (const channel of C.PET_INVOKE) ipcMain.removeHandler(channel);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.removeListener(event, scheduleRefit);
    nativeTheme.removeListener('updated', refreshPrefs);
    if (power) {
      for (const event of POWER_PAUSE) power.removeListener(event, pausePolling);
      for (const event of POWER_RESUME) power.removeListener(event, resumePolling);
    }
    app.removeListener('before-quit', onBeforeQuit);
    if (options.registerShortcut !== false) globalShortcut.unregister(PET_QUICK_ACCELERATOR);
    clearInterval(focusTimer);
    clearTimeout(refitTimer);
    clearTimeout(refocusTimer);
    clearTimeout(perchFixTimer);
    clearTimeout(gestureWatch.pet);
    clearTimeout(gestureWatch.panel);
    escHold.cancel();
    activationKeeper.dispose();
    bubbles.dismiss({ gap: false });
    if (hub && typeof hub.dispose === 'function') {
      try {
        hub.dispose();
      } catch { /* 종료 중 */ }
    }
    for (const win of [...alive]) if (!win.isDestroyed()) win.destroy();
    store.flush();
  }

  return {
    ready,
    dwmReady,
    store,
    state: () => state.get(),
    toggleQuick,
    openQuick,
    showWidget,
    collapse: () => collapse(),
    openMode,
    setMode,
    setCharacter,
    resizeContent,
    toggleBubble,
    pushNotice: (notice) => bubbles.push(notice),
    startFocus,
    stopFocus,
    openHub,
    hubUrlChanged,
    pointer: onPointer,
    // 트레이 펫 묶음: 빠른 기능 항목 + 자리 항목(모니터로 옮기기·가장자리·초기화·숨기기/보이기).
    trayItems: () => [
      ...petTrayItems({ toggleQuick, showWidget, toggleBubble, openMode, openHub }),
      { type: 'separator' },
      ...placementMenuItems(),
    ],
    placementItems: placementMenuItems,
    setSide,
    moveToDisplay,
    resetPosition,
    setHidden,
    setPetHidden: setHidden,
    get side() { return side; },
    get hidden() { return petHidden; },
    // perch·bubble 은 읽으면 만든다(스모크·테스트용). 만들었는지만 보려면 created().
    windows: {
      pet,
      panel,
      get perch() { return ensurePerch(); },
      get bubble() { return ensureBubble(); },
      focus: () => focusWindows.slice(),
      created: () => ({ perch: Boolean(perch && !perch.isDestroyed()), bubble: Boolean(bubble && !bubble.isDestroyed()) }),
    },
    platform,
    get petBounds() { return { ...petBounds }; },
    dispose,
  };
}

module.exports = { install, readPrefs, menuIcon, POSITION_KEY, HIDDEN_KEY };

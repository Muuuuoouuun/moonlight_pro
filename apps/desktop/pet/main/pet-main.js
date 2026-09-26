'use strict';
// Moonlight 펫(Windows) 셸 — 창·입력·상태·트레이·단축키를 묶고, 허브 채널은 끼워 넣은 hub 객체에 넘긴다.
// main.js가 한 번 부른다: const pet = require('./pet/main/pet-main').install({ app, getHubUrl, openMainUrl, … }).
// 동작 기준: prototypes/moonlight-pet-macos WindowCoordinator + 2026-09-26 운영자 결정(재질 A·세션 공유·타이머 화면만).
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const electron = require('electron');
const C = require('../shared/contract');
const G = require('./pet-geometry');
const { createPetStore, isAllowedStoreKey, STORE_FILE } = require('./pet-store');
const { createPetState, CHARACTER_KEY } = require('./pet-state');
const { createPointerGesture, applyPointerSignal, createEscHold, escHoldInput, registerShortcut, PET_QUICK_ACCELERATOR } = require('./pet-input');
const { applyGlassFrame } = require('./pet-dwm');
const { createWindowFactory, setBoundsExact, applyGlassMaterial } = require('./pet-windows');
const { petTrayItems, characterMenuTemplate } = require('./pet-tray');
const { HUB_CHANNELS, envelope, statusFromEnvelope, createHubBridge, hubFromModule } = require('./pet-hub-bridge');
const { createBubbleQueue, clampFocusMinutes, remainingSeconds } = require('./pet-timing');
const { resolveMainPath } = require('../../widget-window');
const { isExternalOpenable } = require('../../hub-url');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const POSITION_KEY = 'pet.position';
const BLUR_GRACE_MS = 400; // 패널을 띄우는 순간의 포커스 흔들림은 "밖을 눌렀다"로 치지 않는다
const CLICK_DEDUPE_MS = 600; // 펫 클릭을 렌더러가 set-presentation으로 한 번 더 보내도 두 번 처리하지 않는다
const FOCUS_TICK_MS = 500;
const REFIT_DELAY_MS = 200;
const GESTURE_STALE_MS = 15000; // 누른 채 이만큼 신호가 없으면 잃은 포인터로 보고 취소

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

function install(options = {}) {
  const { BrowserWindow, Menu, globalShortcut, ipcMain, nativeImage, nativeTheme, screen, session, shell } = electron;
  const app = options.app || electron.app;
  const getHubUrl = options.getHubUrl || (() => '');
  const openMainUrl = options.openMainUrl || (() => {});
  const showSettings = options.showSettings || (() => {});
  const log = options.log || ((message) => console.log(message));
  const activate = options.activate !== false; // 스모크는 false — 운영자 화면의 포커스를 빼앗지 않는다
  const assetsDir = options.assetsDir || ASSETS_DIR;
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
  const factory = createWindowFactory({ pagesDir: options.pagesDir, pageFile: options.pageFile, openExternal, log });
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
  const perch = track(factory.perch(panel));
  const bubble = track(factory.bubble());
  let focusWindows = [];

  // Acrylic 창 둘(패널·말풍선)에 DWM 둥근 모서리·테두리 없음. 실패해도 계속(결과는 스모크가 본다).
  const dwmReady = applyGlassFrame([panel, bubble]).then((result) => {
    if (!result.ok) log(`pet:dwm degraded ${result.error || JSON.stringify(result.applied)}`);
    return result;
  });

  // ── 위치 ───────────────────────────────────────────────────────────────
  const displays = () => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }));
  const primaryDisplay = () => {
    const d = screen.getPrimaryDisplay();
    return { id: d.id, bounds: d.bounds, workArea: d.workArea };
  };
  let petBounds = G.resolvePetBounds(asObject(store.get(POSITION_KEY)), displays(), primaryDisplay());
  const workArea = () => screen.getDisplayMatching(petBounds).workArea;
  const savePosition = () => store.set(POSITION_KEY, { x: petBounds.x, y: petBounds.y });
  const placePet = (bounds) => {
    petBounds = bounds;
    setBoundsExact(pet, petBounds);
  };
  placePet(petBounds);

  let companion = null; // 지금 패널 덩어리(유리 + 걸친 띠)
  let contentHeight = null; // 렌더러가 pet:resize-content로 바꾼 유리 높이(모드가 바뀌면 되돌린다)
  let perched = false;
  let blurGraceUntil = 0;
  let lastPetClickAt = 0;
  let petHidden = false;

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
      setBoundsExact(perch, G.perchBounds(glass));
      if (panel.isVisible() && !perch.isVisible()) perch.showInactive();
    } else if (perch.isVisible()) {
      perch.hide();
    }
  }

  function revealPanel() {
    blurGraceUntil = Date.now() + BLUR_GRACE_MS;
    if (activate) {
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
      perch.showInactive();
      perch.moveTop();
    }
  }

  // ── 패널: 빠른 패널·지속 위젯·접기 ─────────────────────────────────────
  function openQuick() {
    if (focusRunning()) return state.get();
    // 지속 위젯에서 빠른 패널로: 먼저 위젯을 접어 펫을 위젯 위 끝에 맞춘 뒤(Mac alignPet) 그 자리에서 연다.
    if (state.panelOpen && state.presentation === 'widget') collapse({ resume: false });
    bubbles.dismiss();
    contentHeight = null;
    perched = G.isPerched({ presentation: 'quick', mode: state.mode });
    state.patch({ presentation: 'quick', pinned: false, panelOpen: true, perched });
    layoutPanel(G.quickCompanionFrame(petBounds, glassSizeNow(), perched, workArea()), perched);
    syncPet();
    revealPanel();
    return state.get();
  }

  function showWidget(mode) {
    if (focusRunning()) return state.get();
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
    layoutPanel(G.widgetCompanionFrame(petBounds, glassSizeNow(), true, workArea()), true);
    syncPet();
    revealPanel();
    return state.get();
  }

  function collapse({ resume = true } = {}) {
    if (!state.panelOpen) return state.get();
    if (state.presentation === 'widget' && companion) {
      placePet(G.petAlignedToCompanion(companion, workArea()));
      savePosition();
    }
    // 상태를 먼저 닫는다 — hide()가 곧바로 blur를 보내도 다시 접기로 들어오지 않게.
    perched = false;
    state.patch({ panelOpen: false, pinned: false, presentation: 'quick', perched: false });
    panel.hide();
    perch.hide();
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

  // 모드·높이가 바뀌면 덩어리의 오른쪽 위를 고정한 채 크기를 바꾼다(Mac resizeBar·resizeWidget).
  function relayout() {
    if (!state.panelOpen || !companion) return;
    perched = G.isPerched({ presentation: state.presentation, mode: state.mode });
    state.patch({ perched });
    const frame = G.resizedKeepingTopRight(companion, G.companionSize(glassSizeNow(), perched), workArea());
    layoutPanel(frame, perched);
    syncPet();
  }

  function setMode(mode) {
    if (!C.MODES.includes(mode) || mode === state.mode) return state.get();
    contentHeight = null;
    state.setMode(mode);
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
    if (!state.panelOpen || state.presentation !== 'quick') return;
    if (Date.now() < blurGraceUntil) return;
    collapse();
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

  function movePetBy(dy) {
    const wa = workArea();
    placePet(G.petBoundsAt(petBounds.y + dy, wa));
    if (state.panelOpen && state.presentation === 'quick') {
      layoutPanel(G.quickCompanionFrame(petBounds, glassSizeNow(), perched, wa), perched);
    }
    if (bubble.isVisible()) setBoundsExact(bubble, G.bubbleBounds(petBounds, wa));
  }

  function moveCompanionBy(dy) {
    if (!state.panelOpen || !companion) return;
    const wa = workArea();
    const previous = companion;
    const next = G.movedVertically(previous, dy, wa);
    layoutPanel(next, perched);
    if (state.presentation === 'widget') placePet(G.petAlignedToCompanion(next, wa));
    else placePet(G.petBoundsAt(petBounds.y + (next.y - previous.y), wa));
  }

  const gestures = { pet: createPointerGesture(), panel: createPointerGesture() };
  // 누른 채 신호가 끊기면(창이 사라짐·pointerup 유실) 워시가 남고 다음 누름이 옛 제스처에 섞인다.
  // 신호가 GESTURE_STALE_MS 동안 없으면 그 제스처를 클릭 없이 취소한다.
  const gestureWatch = { pet: null, panel: null };
  function cancelGesture(from) {
    clearTimeout(gestureWatch[from]);
    gestureWatch[from] = null;
    const actions = gestures[from].cancel();
    if (actions.some((a) => a.type === 'drag-end')) savePosition();
    if (!gestures.pet.isDown && !gestures.panel.isDown) setWash(false);
  }
  function watchGesture(from) {
    clearTimeout(gestureWatch[from]);
    gestureWatch[from] = gestures[from].isDown ? setTimeout(() => cancelGesture(from), GESTURE_STALE_MS) : null;
  }
  function onPointer(surface, channel, payload) {
    const from = surface === 'pet' ? 'pet' : 'panel';
    const actions = applyPointerSignal(gestures[from], channel, payload);
    watchGesture(from);
    for (const action of actions) {
      if (action.type === 'press' || action.type === 'drag-begin') setWash(true);
      else if (action.type === 'release') setWash(false);
      else if (action.type === 'drag-move') {
        if (from === 'pet') movePetBy(action.dy);
        else moveCompanionBy(action.dy);
      } else if (action.type === 'drag-end') savePosition();
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
        if (!image.isEmpty()) icon = image.resize({ width: 20, height: 20, quality: 'best' });
      }
    } catch { /* 아이콘 없이 */ }
    iconCache.set(character.key, icon);
    return icon;
  }
  function showContextMenu() {
    const menu = Menu.buildFromTemplate(characterMenuTemplate({
      current: state.character,
      onNotifications: () => openMode('notifications'),
      onSelect: (key) => setCharacter(key),
      iconFor,
    }));
    menu.popup({ window: pet.isVisible() ? pet : panel });
    return null;
  }
  function setCharacter(key) {
    if (state.setCharacter(key) && washOn) broadcast('pet:wash', washPayload());
    return state.get();
  }

  // ── 짧은 메시지 ─────────────────────────────────────────────────────────
  const fromHub = new WeakSet(); // 허브가 넘긴 알림(셸이 직접 넣은 것 — pushNotice — 은 다시 거르지 않는다)
  const bubbles = createBubbleQueue({
    canShow: () => !state.panelOpen && !focusRunning(),
    // 허브가 넘긴 알림은 보이기 직전에 허브 목록으로 다시 거른다(줄에서 기다리는 동안 읽음·숨김·시작한 일정).
    isValid: (notice) => {
      if (!notice || !fromHub.has(notice) || !hub || typeof hub.isNoticePresentable !== 'function') return true;
      return hub.isNoticePresentable(notice.id) === true;
    },
    show: (notice) => {
      setBoundsExact(bubble, G.bubbleBounds(petBounds, workArea()));
      bubble.webContents.send('pet:notice', { notice: notice || null });
      bubble.showInactive();
    },
    hide: () => bubble.hide(),
    isVisible: () => bubble.isVisible(),
  });
  function toggleBubble() {
    if (focusRunning()) return false;
    if (!bubble.isVisible() && state.panelOpen) collapse({ resume: false });
    return bubbles.toggle();
  }

  // ── 집중 화면(타이머만 — 앱 전환은 막지 않는다) ─────────────────────────
  let focusEndsAt = 0;
  let focusTimer = null;
  const escHold = createEscHold({
    onHold: () => {
      if (!focusRunning()) return;
      state.patch({ focus: { confirmStop: true, confirmRevision: state.focus.confirmRevision + 1 } });
    },
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
      if (primary && activate) {
        win.show();
        win.focus();
      } else {
        win.showInactive();
      }
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
    'pet:set-mode': (p) => setMode(p.mode),
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
    'pet:focus-state': (p) => {
      if (p.dismissConfirm === true && state.focus.confirmStop) state.patch({ focus: { confirmStop: false } });
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
  let solidGlass = false;
  function applyPrefs(prefs) {
    const solid = Boolean(prefs.reduceTransparency || prefs.highContrast);
    if (solid === solidGlass) return;
    solidGlass = solid;
    applyGlassMaterial(panel, prefs);
    applyGlassMaterial(bubble, prefs);
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
  function refit() {
    refitTimer = null;
    if (focusRunning()) {
      buildFocusWindows();
      return;
    }
    // 위젯이 떠 있으면 펫은 숨어 있고 옛 자리에 있다 — 먼저 위젯 위 끝에 맞춘 뒤 다시 잰다(위젯이 제자리에 남는다).
    if (state.panelOpen && state.presentation === 'widget' && companion) placePet(G.petAlignedToCompanion(companion, workArea()));
    placePet(G.resolvePetBounds({ x: petBounds.x, y: petBounds.y }, displays(), primaryDisplay()));
    const wa = workArea();
    if (state.panelOpen) {
      const frame = state.presentation === 'widget'
        ? G.widgetCompanionFrame(petBounds, glassSizeNow(), perched, wa)
        : G.quickCompanionFrame(petBounds, glassSizeNow(), perched, wa);
      layoutPanel(frame, perched);
    }
    if (bubble.isVisible()) setBoundsExact(bubble, G.bubbleBounds(petBounds, wa));
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

  // 첫 화면: 펫 페이지가 그려지면 대기 얼굴을 띄운다.
  // 창이 다 그려진 뒤에 허브 폴링을 켠다 — 첫 새 알림이 아직 불러오지 않은 말풍선 페이지로 가지 않게.
  const ready = Promise.all([pet.petLoaded, panel.petLoaded, perch.petLoaded, bubble.petLoaded]).then(() => {
    if (!pet.isDestroyed()) syncPet();
    if (hub && typeof hub.startPolling === 'function' && !quitting) {
      try {
        hub.startPolling();
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
    app.removeListener('before-quit', onBeforeQuit);
    if (options.registerShortcut !== false) globalShortcut.unregister(PET_QUICK_ACCELERATOR);
    clearInterval(focusTimer);
    clearTimeout(refitTimer);
    clearTimeout(gestureWatch.pet);
    clearTimeout(gestureWatch.panel);
    escHold.cancel();
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
    trayItems: () => petTrayItems({ toggleQuick, showWidget, toggleBubble, openMode, openHub }),
    setPetHidden(hidden) {
      petHidden = Boolean(hidden);
      if (petHidden) cancelGesture('pet');
      syncPet();
    },
    windows: {
      pet,
      panel,
      perch,
      bubble,
      focus: () => focusWindows.slice(),
    },
    get petBounds() { return { ...petBounds }; },
    dispose,
  };
}

module.exports = { install, readPrefs, POSITION_KEY };

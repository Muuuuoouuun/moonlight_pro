// Moonlight 데스크톱 셸 — 허브 주소 하나를 창에 띄우고, 트레이·빠른 입력 단축키만 더한다.
'use strict';
const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, screen, session, shell } = require('electron');
// 펫 스모크는 운영자 화면에서 돈다 — Electron 오류 창을 띄우지 않고 기록한 뒤 종료 코드 1로 끝낸다.
if (process.argv.includes('--smoke-pet')) {
  dialog.showErrorBox = () => {};
  const fatal = (error) => {
    console.log(`smoke:fail ${(error && error.stack) || error}`);
    app.exit(1);
  };
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
}
const fs = require('node:fs');
const path = require('node:path');
const { normalizeHubUrl, resolveHubUrl, isSameOrigin, dashboardUrl, isExternalOpenable } = require('./hub-url');
const {
  WIDGET_WIDTH,
  WIDGET_HEIGHT,
  WIDGET_CHANNELS,
  widgetUrl,
  isLoginUrl,
  mainLoginUrl,
  isWidgetPage,
  resolveMainPath,
  clampWidgetHeight,
  normalizeWidgetState,
  clampIntoWorkArea,
  resolveWidgetPosition,
  widgetToggleAction,
} = require('./widget-window');

const BACKGROUND = '#141C27';
const QUICK_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+Space';
const WIDGET_ACCELERATOR = 'CommandOrControl+Shift+M';
const SETTINGS_PAGE = path.join(__dirname, 'settings', 'index.html');

// ── 실행 인자 ─────────────────────────────────────────────────────────────
function argValue(name) {
  const hit = process.argv.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
}
const SMOKE_WIDGET = argValue('smoke-widget') !== null; // 위젯 창만 띄워 찍는 스모크
const SMOKE = argValue('smoke-test') !== null || SMOKE_WIDGET;
const SMOKE_OUT = argValue('smoke-out') || path.join(process.cwd(), 'smoke.png');
const SMOKE_CAPTURE = argValue('smoke-quick-capture') !== null; // 스모크에서 빠른 입력 경로까지 찍기
// --smoke-widget --smoke-hub=<허브 주소>: 창 규칙 검사 대신 그 허브의 실제 /widget 페이지를 찍는다(개발 서버 확인용).
const SMOKE_HUB = argValue('smoke-hub');
const SMOKE_THEME = argValue('smoke-theme'); // light | dark — 찍기 전에 허브 테마 설정(mlp.theme)을 이 값으로
// --smoke-pet: 펫 창(Acrylic + DWM)을 실제 화면에 띄워 확인하고 화면 영역을 찍는다(pet/main/pet-smoke.js).
// GPU 합성을 끄지 않는다 — Acrylic 블러는 실제 합성 경로에서만 보인다.
const SMOKE_PET = argValue('smoke-pet') !== null;
const SMOKE_PET_PAGE = argValue('smoke-pet-page'); // 펫 페이지 폴더(pet.html·panel.html…) 또는 파일 하나
const userDataDir = argValue('user-data-dir');
if (userDataDir) app.setPath('userData', path.resolve(userDataDir));
// 스모크 캡처는 GPU 합성 없이도 찍혀야 한다(CI·원격 세션에서 UnknownVizError 방지).
if (SMOKE) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

// ── 저장 파일 ─────────────────────────────────────────────────────────────
const userFile = (name) => path.join(app.getPath('userData'), name);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const appConfig = readJson(path.join(__dirname, 'app.config.json'), {});
const readSettings = () => readJson(userFile('settings.json'), {});
// 스모크가 허브 주소를 잠시 바꿔 끼울 때만 쓴다(설정 파일은 건드리지 않는다).
let hubUrlOverride = '';
const currentHubUrl = () => hubUrlOverride || resolveHubUrl(readSettings().hubUrl, appConfig.hubUrl);

function iconPath() {
  const packaged = path.join(__dirname, 'assets', 'icon-192.png');
  return fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', 'hub', 'public', 'icon-192.png');
}

// ── 창 ────────────────────────────────────────────────────────────────────
let win = null;
let tray = null;
let pet = null; // Moonlight 펫(pet/main/pet-main.js) — 트레이 항목과 허브 주소 변경을 받는다
let quitting = false;

function restoredBounds() {
  const state = readJson(userFile('window-state.json'), {});
  const bounds = { width: state.width || 1280, height: state.height || 860 };
  const onScreen = Number.isFinite(state.x) && Number.isFinite(state.y) && screen.getAllDisplays().some(({ workArea: a }) =>
    state.x >= a.x - 50 && state.y >= a.y - 50 && state.x < a.x + a.width - 100 && state.y < a.y + a.height - 100);
  if (onScreen) Object.assign(bounds, { x: state.x, y: state.y });
  return { bounds, maximized: Boolean(state.maximized) };
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  writeJson(userFile('window-state.json'), { ...win.getNormalBounds(), maximized: win.isMaximized() });
}

function createWindow() {
  const { bounds, maximized } = restoredBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 390,
    minHeight: 600,
    show: false,
    title: 'Moonlight',
    backgroundColor: BACKGROUND,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (maximized) win.maximize();
  win.once('ready-to-show', () => (SMOKE ? win.showInactive() : win.show()));
  win.on('close', (event) => {
    saveBounds();
    if (quitting || SMOKE) return;
    event.preventDefault();
    win.hide();
  });
  guardNavigation(win.webContents);
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ── 주소 정책: 허브 origin과 설정 화면만 앱 안에서, 나머지는 시스템 브라우저 ──
function isInApp(url) {
  if (url.startsWith('file:')) return decodeURIComponent(new URL(url).pathname).replace(/^\//, '').replace(/\//g, path.sep).toLowerCase() === SETTINGS_PAGE.toLowerCase();
  return isSameOrigin(url, currentHubUrl());
}

function openExternal(url) {
  if (!isExternalOpenable(url)) return;
  if (SMOKE) {
    console.log(`smoke:external ${url}`);
    return;
  }
  shell.openExternal(url);
}

// options.openSameOrigin: 같은 origin의 새 창 요청을 어디서 열지(기본은 그 창 자신).
// options.onFail: 주 프레임을 불러오지 못했을 때(기본은 설정 화면으로 실패 원인 표시).
function guardNavigation(contents, options = {}) {
  const openSameOrigin = options.openSameOrigin || ((url) => contents.loadURL(url).catch(() => {}));
  const onFail = options.onFail || ((url, reason) => showSettings({ failed: url, reason }));
  const outward = (event, url) => {
    if (isInApp(url)) return;
    event.preventDefault();
    openExternal(url);
  };
  contents.on('will-navigate', outward);
  contents.on('will-redirect', outward);
  contents.setWindowOpenHandler(({ url }) => {
    if (isSameOrigin(url, currentHubUrl())) openSameOrigin(url);
    else openExternal(url);
    return { action: 'deny' };
  });
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    // -3(ERR_ABORTED)은 다른 이동이 앞선 것이라 실패가 아니다.
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return;
    onFail(url, description);
  });
}

function loadHub() {
  const hubUrl = currentHubUrl();
  if (!hubUrl) return showSettings();
  return win.loadURL(dashboardUrl(hubUrl)).catch(() => {});
}

function showSettings(query = {}) {
  showWindow();
  return win.loadFile(SETTINGS_PAGE, { query }).catch(() => {});
}

// ── 빠른 입력 ─────────────────────────────────────────────────────────────
// 허브의 share_target(`/dashboard?title&text&url`)은 세 값이 모두 비면 아무것도 열지 않는다
// (hub-app.jsx: combined가 빈 문자열이면 무시). 빈 캡처를 열려면 허브의 전역 `C` 단축키를
// 쓴다 — 대시보드가 떠 있을 때 window에 keydown `c`를 보내면 GlobalQuickCapture가 열린다.
const OPEN_CAPTURE_SCRIPT = `new Promise((resolve) => {
  let tries = 0;
  const fire = () => {
    if (!document.querySelector('.hub-app')) {
      if (++tries > 50) return resolve(false);
      return setTimeout(fire, 200);
    }
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }));
      resolve(true);
    }, 300);
  };
  fire();
})`;

async function quickCapture() {
  const hubUrl = currentHubUrl();
  if (!hubUrl) return showSettings();
  showWindow();
  const contents = win.webContents;
  const here = contents.getURL();
  const onDashboard = isSameOrigin(here, hubUrl) && new URL(here).pathname.startsWith('/dashboard');
  if (!onDashboard) await contents.loadURL(dashboardUrl(hubUrl)).catch(() => {});
  return contents.executeJavaScript(OPEN_CAPTURE_SCRIPT).catch(() => false);
}

// ── 빠른 입력 위젯 ─────────────────────────────────────────────────────────
// 테두리 없는 작은 창에 허브의 /widget 페이지를 띄운다. 끌기 영역은 페이지가 CSS로 정하고,
// 메인은 창 위치·고정·높이·로그인 우회만 맡는다. 숨겨도 페이지는 살려 두어 다시 열 때 바로 뜬다.
let widget = null;
let widgetState = null; // { x, y, pinned } — widget-state.json
let widgetHeight = WIDGET_HEIGHT;
let widgetPainted = false;
let widgetShowAfterLoad = false;

function loadWidgetState() {
  if (!widgetState) widgetState = normalizeWidgetState(readJson(userFile('widget-state.json'), {}));
  return widgetState;
}

function saveWidgetState(patch) {
  widgetState = { ...loadWidgetState(), ...patch };
  writeJson(userFile('widget-state.json'), widgetState);
}

const widgetAlive = () => Boolean(widget && !widget.isDestroyed());
const widgetVisible = () => widgetAlive() && widget.isVisible();

// Windows에서 테두리 없는·크기 고정 창은 배율에 따라 콘텐츠가 요청보다 1px 작게 잡힌다(200% 실측:
// setBounds 380×200 → 페이지 379×200, setContentBounds도 같음). 한 번 잡고 콘텐츠 크기를 재서 모자란
// 만큼 창을 키워, 페이지가 정확히 380×높이를 받게 한다. point는 창 바깥 왼쪽 위다.
function applyWidgetBounds(point, height) {
  const want = { width: WIDGET_WIDTH, height };
  widget.setBounds({ ...point, ...want });
  const got = widget.getContentBounds();
  if (got.width === want.width && got.height === want.height) return;
  widget.setBounds({ ...point, width: want.width * 2 - got.width, height: want.height * 2 - got.height });
}

// 창 바깥 크기 = 페이지 크기 + 지금 창의 테두리 몫(위치 계산용).
function widgetOuterSize(height) {
  const outer = widget.getBounds();
  const content = widget.getContentBounds();
  return { width: WIDGET_WIDTH + outer.width - content.width, height: height + outer.height - content.height };
}

// 저장 위치(없으면 주 모니터 오른쪽 아래)를 지금 모니터 배치의 작업 영역 안으로 맞춘다.
function placeWidget() {
  const size = widgetOuterSize(widgetHeight);
  const state = loadWidgetState();
  const savedArea = state.x === null ? null : screen.getDisplayMatching({ x: state.x, y: state.y, ...size }).workArea;
  const point = resolveWidgetPosition(state, size, savedArea, screen.getPrimaryDisplay().workArea);
  applyWidgetBounds(point, widgetHeight);
}

// 아래 끝을 고정한 채 높이를 바꾼다 — 오른쪽 아래 위젯은 위로 자란다. 화면 밖으로는 밀어 넣는다.
function setWidgetHeight(value) {
  const height = clampWidgetHeight(value);
  if (height === null || !widgetAlive()) return widgetHeight;
  const current = widget.getBounds();
  const size = widgetOuterSize(height);
  const workArea = screen.getDisplayMatching(current).workArea;
  const point = clampIntoWorkArea({ x: current.x, y: current.y + current.height - size.height }, size, workArea);
  widgetHeight = height;
  applyWidgetBounds(point, height);
  return height;
}

function setWidgetPinned(pinned) {
  saveWidgetState({ pinned });
  if (widgetAlive()) widget.setAlwaysOnTop(pinned, 'floating');
  return pinned;
}

// 메인 창을 허브 주소로 열고 앞으로 가져온다(위젯의 openMain·로그인 우회·같은 origin 새 창).
function openMainUrl(url) {
  if (!win) return undefined;
  showWindow();
  return win.loadURL(url).catch(() => {});
}

function revealWidget() {
  if (!widgetAlive()) return;
  placeWidget();
  if (SMOKE) {
    widget.showInactive();
    return;
  }
  widget.show();
  widget.focus();
  widget.webContents.focus(); // 페이지가 입력 칸에 autofocus할 수 있게
}

function hideWidget() {
  widgetShowAfterLoad = false;
  if (widgetVisible()) widget.hide();
}

function maybeRevealWidget() {
  if (!widgetShowAfterLoad || !widgetPainted || !widgetAlive()) return;
  if (!isWidgetPage(widget.webContents.getURL(), currentHubUrl())) return;
  widgetShowAfterLoad = false;
  revealWidget();
}

function createWidget() {
  const { pinned } = loadWidgetState();
  widgetPainted = false;
  widget = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: widgetHeight,
    frame: false,
    roundedCorners: true,
    alwaysOnTop: pinned,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Moonlight 빠른 입력',
    backgroundColor: BACKGROUND,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'widget-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (pinned) widget.setAlwaysOnTop(true, 'floating');
  placeWidget();

  widget.once('ready-to-show', () => {
    widgetPainted = true;
    maybeRevealWidget();
  });
  widget.on('close', (event) => {
    if (quitting || SMOKE) return;
    event.preventDefault();
    hideWidget();
  });
  widget.on('closed', () => {
    widget = null;
    refreshMenus();
  });
  widget.on('moved', () => {
    if (!widgetAlive()) return;
    const { x, y } = widget.getBounds();
    saveWidgetState({ x, y });
  });
  widget.on('show', refreshMenus);
  widget.on('hide', refreshMenus);

  const contents = widget.webContents;
  // ESC는 페이지보다 먼저 받아 위젯을 숨긴다.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape') return;
    if (input.alt || input.control || input.meta || input.shift) return;
    event.preventDefault();
    hideWidget();
  });
  // 세션이 끝나 /login으로 가면 작은 창에 로그인 폼을 그리지 않고 메인 창에서 연다.
  // 메인 창은 next=/widget을 물려받지 않는다(로그인 뒤 위젯 페이지가 큰 창에 뜨지 않게 — mainLoginUrl).
  const toLogin = (event, url) => {
    const target = mainLoginUrl(url, currentHubUrl());
    if (!target) return;
    if (event) event.preventDefault();
    hideWidget();
    openMainUrl(target);
  };
  contents.on('will-navigate', toLogin);
  contents.on('will-redirect', toLogin);
  contents.on('did-navigate', (_event, url) => toLogin(null, url));
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) toLogin(null, url);
  });
  contents.on('did-finish-load', maybeRevealWidget);
  guardNavigation(contents, {
    openSameOrigin: openMainUrl,
    onFail: (url, reason) => {
      hideWidget();
      showSettings({ failed: url, reason });
    },
  });
}

function showWidget() {
  const hubUrl = currentHubUrl();
  if (!widgetAlive()) createWidget();
  const contents = widget.webContents;
  if (widgetPainted && !contents.isLoading() && isWidgetPage(contents.getURL(), hubUrl)) {
    revealWidget();
    return;
  }
  widgetShowAfterLoad = true;
  contents.loadURL(widgetUrl(hubUrl)).catch(() => {});
}

function toggleWidget() {
  const action = widgetToggleAction({ hubUrl: currentHubUrl(), visible: widgetVisible() });
  if (action === 'settings') return showSettings();
  if (action === 'hide') return hideWidget();
  return showWidget();
}

// ── 메뉴·트레이 ───────────────────────────────────────────────────────────
function quit() {
  quitting = true;
  app.quit();
}

// 위젯 항목은 지금 상태(떠 있음/숨김)를 이름으로 보여 주므로 위젯이 뜨고 숨을 때마다 다시 만든다.
function widgetMenuItem() {
  return {
    label: widgetVisible() ? '위젯 숨기기' : '위젯 열기',
    accelerator: WIDGET_ACCELERATOR,
    registerAccelerator: false,
    click: toggleWidget,
  };
}

function refreshMenus() {
  if (!tray || tray.isDestroyed()) return;
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Moonlight',
      submenu: [
        { label: '빠른 입력', accelerator: QUICK_CAPTURE_ACCELERATOR, registerAccelerator: false, click: quickCapture },
        widgetMenuItem(),
        { label: '허브 주소 바꾸기', click: () => showSettings() },
        { type: 'separator' },
        { label: '종료', accelerator: 'CommandOrControl+Q', click: quit },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '새로고침', role: 'reload' },
        { label: '강력 새로고침', role: 'forceReload' },
        { type: 'separator' },
        { label: '뒤로', accelerator: 'Alt+Left', click: () => win.webContents.navigationHistory.goBack() },
        { label: '앞으로', accelerator: 'Alt+Right', click: () => win.webContents.navigationHistory.goForward() },
        { type: 'separator' },
        { label: '실제 크기', role: 'resetZoom' },
        { label: '확대', role: 'zoomIn' },
        { label: '축소', role: 'zoomOut' },
        { type: 'separator' },
        { label: '전체 화면', role: 'togglefullscreen' },
        { label: '개발자 도구', role: 'toggleDevTools' },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: showWindow },
    { label: '빠른 입력', accelerator: QUICK_CAPTURE_ACCELERATOR, registerAccelerator: false, click: quickCapture },
    widgetMenuItem(),
    ...(pet ? [{ type: 'separator' }, ...pet.trayItems(), { type: 'separator' }] : []),
    { label: '허브 주소 바꾸기', click: () => showSettings() },
    { type: 'separator' },
    { label: '종료', click: quit },
  ]));
}

function buildMenus() {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16, quality: 'best' }));
  tray.setToolTip('Moonlight');
  tray.on('click', showWindow);
  refreshMenus();
}

// ── 설정 화면 IPC (file:// 페이지에서 온 호출만) ─────────────────────────
function fromSettingsPage(event) {
  const url = event.senderFrame ? event.senderFrame.url : '';
  if (!url.startsWith('file:') || !isInApp(url)) throw new Error('moonlight: settings IPC is local-only');
}

function registerIpc() {
  ipcMain.handle('moonlight:get-settings', (event) => {
    fromSettingsPage(event);
    return { hubUrl: currentHubUrl(), defaultHubUrl: resolveHubUrl('', appConfig.hubUrl) };
  });
  ipcMain.handle('moonlight:set-settings', (event, patch) => {
    fromSettingsPage(event);
    const result = normalizeHubUrl(patch && patch.hubUrl);
    if (!result.ok) return result;
    writeJson(userFile('settings.json'), { ...readSettings(), hubUrl: result.url });
    hideWidget(); // 위젯은 다음에 열 때 새 주소의 /widget을 다시 불러온다(isWidgetPage가 origin을 본다)
    if (pet) pet.hubUrlChanged();
    loadHub();
    return result;
  });
  ipcMain.handle('moonlight:open-external', (event, url) => {
    fromSettingsPage(event);
    openExternal(String(url || ''));
  });
  registerWidgetIpc();
}

// ── 위젯 IPC (위젯 창의 허브 페이지 최상위 프레임에서 온 호출만) ───────────
function fromWidget(event) {
  const frame = event.senderFrame;
  return Boolean(
    widgetAlive()
      && event.sender === widget.webContents
      && frame
      && !frame.parent
      && isSameOrigin(frame.url, currentHubUrl()),
  );
}

function requireWidget(event) {
  if (!fromWidget(event)) throw new Error('moonlight: widget IPC is widget-only');
}

function registerWidgetIpc() {
  ipcMain.handle(WIDGET_CHANNELS.pin, (event, pinned) => {
    requireWidget(event);
    if (typeof pinned !== 'boolean') return loadWidgetState().pinned;
    return setWidgetPinned(pinned);
  });
  ipcMain.on(WIDGET_CHANNELS.isPinned, (event) => {
    event.returnValue = fromWidget(event) ? loadWidgetState().pinned : false;
  });
  ipcMain.on(WIDGET_CHANNELS.close, (event) => {
    if (fromWidget(event)) hideWidget();
  });
  ipcMain.handle(WIDGET_CHANNELS.openMain, (event, target) => {
    requireWidget(event);
    const result = resolveMainPath(target, currentHubUrl());
    if (!result.ok) return { ok: false, reason: result.reason };
    openMainUrl(result.url);
    return { ok: true };
  });
  ipcMain.handle(WIDGET_CHANNELS.setHeight, (event, px) => {
    requireWidget(event);
    return setWidgetHeight(px);
  });
}

// ── 스모크 테스트: 첫 화면이 다 뜨면 PNG를 남기고 종료 ────────────────────
function runSmoke() {
  const contents = win.webContents;
  let timer = null;
  const giveUp = setTimeout(() => {
    console.log('smoke:fail timeout');
    app.exit(1);
  }, 45000);

  const finish = async () => {
    if (SMOKE_CAPTURE) {
      console.log(`smoke:quick-capture ${await quickCapture()}`);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    const image = await win.webContents.capturePage(undefined, { stayHidden: true });
    fs.mkdirSync(path.dirname(path.resolve(SMOKE_OUT)), { recursive: true });
    fs.writeFileSync(SMOKE_OUT, image.toPNG());
    console.log(`smoke:page ${contents.getURL()}`);
    console.log(`smoke:png ${path.resolve(SMOKE_OUT)} ${image.getSize().width}x${image.getSize().height}`);
    const hubUrl = currentHubUrl();
    if (hubUrl && isSameOrigin(contents.getURL(), hubUrl)) {
      // 외부 링크 정책 확인: 다른 origin 링크 클릭과 window.open이 창 안에서 열리지 않아야 한다.
      await contents.executeJavaScript(`(() => {
        const link = [...document.querySelectorAll('a[href]')].find((a) => new URL(a.href).origin !== location.origin);
        if (link) link.click();
        window.open('https://www.iana.org/help/example-domains', '_blank');
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const stayed = isSameOrigin(contents.getURL(), hubUrl);
      console.log(`smoke:policy ${stayed ? 'ok' : 'fail'} in-app=${contents.getURL()}`);
      if (!stayed) app.exit(1);
    }
    clearTimeout(giveUp);
    console.log('smoke:ok');
    app.exit(0);
  };

  // 설정 화면으로 되돌아가는 실패 경로까지 기다리도록, 마지막 load 뒤 잠시 조용할 때 찍는다.
  contents.on('did-finish-load', () => {
    clearTimeout(timer);
    timer = setTimeout(() => finish().catch((error) => {
      console.log(`smoke:fail ${error.message}`);
      app.exit(1);
    }), 1200);
  });
}

// ── 위젯 스모크: 창 모양·IPC·ESC·로그아웃 규칙을 확인하고 PNG를 남긴다 ─────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, label, ms = 30000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) throw new Error(`wait ${label}`);
    await sleep(100);
  }
}

// 로컬 허브 흉내: /widget은 세션 없음으로 /login에 보낸다(허브 미들웨어와 같은 모양).
function startLoggedOutHub() {
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/widget')) {
      res.writeHead(307, { Location: '/login?next=%2Fwidget' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>login</title><p>login</p>');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function runWidgetSmoke() {
  const giveUp = setTimeout(() => {
    console.log('smoke:fail timeout');
    app.exit(1);
  }, 90000);
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
  };

  // 1) 창 모양: https://example.com/widget(404 페이지)을 띄워 찍는다.
  hubUrlOverride = 'https://example.com';
  toggleWidget();
  await waitFor(widgetVisible, 'widget visible');
  await sleep(800);
  const bounds = widget.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const { workArea } = display;
  const content = () => widget.getContentBounds();
  console.log(`smoke:widget-bounds ${JSON.stringify(bounds)} content=${JSON.stringify(content())} workArea=${JSON.stringify(workArea)} scale=${display.scaleFactor}`);
  // 페이지가 받는 크기(콘텐츠 영역)가 정확히 380×200이어야 한다.
  check(content().width === WIDGET_WIDTH && content().height === WIDGET_HEIGHT, 'widget content size');
  check(bounds.x + bounds.width <= workArea.x + workArea.width && bounds.y + bounds.height <= workArea.y + workArea.height, 'widget inside work area');
  check(widget.isAlwaysOnTop(), 'widget pinned by default');
  const image = await widget.webContents.capturePage(undefined, { stayHidden: true });
  fs.mkdirSync(path.dirname(path.resolve(SMOKE_OUT)), { recursive: true });
  fs.writeFileSync(SMOKE_OUT, image.toPNG());
  console.log(`smoke:png ${path.resolve(SMOKE_OUT)} ${image.getSize().width}x${image.getSize().height} page=${widget.webContents.getURL()}`);

  // 2) 페이지 다리: window.moonlightWidget의 다섯 동작. 높이는 아래 끝을 고정한 채 위로 자란다.
  const grownTo = await widget.webContents.executeJavaScript('window.moonlightWidget && window.moonlightWidget.setHeight(300)');
  const grownBounds = widget.getBounds();
  console.log(`smoke:widget-grow ${grownTo} ${JSON.stringify(grownBounds)} content=${JSON.stringify(content())}`);
  check(grownTo === 300 && content().height === 300 && content().width === WIDGET_WIDTH, 'setHeight resizes');
  check(grownBounds.y + grownBounds.height === bounds.y + bounds.height, 'bottom edge anchored');
  const probe = await widget.webContents.executeJavaScript(`(async () => {
    const w = window.moonlightWidget;
    if (!w) return { bridge: false };
    const keys = Object.keys(w).sort().join(',');
    const pinnedBefore = w.isPinned();
    const unpinned = await w.pin(false);
    const pinnedAfter = w.isPinned();
    await w.pin(true);
    const grown = await w.setHeight(300);
    const clampedLow = await w.setHeight(20);
    const reset = await w.setHeight(${WIDGET_HEIGHT});
    const badPath = await w.openMain('//evil.example.com/x');
    const badScheme = await w.openMain('https://evil.example.com/');
    await new Promise((r) => setTimeout(r, 300));
    const inner = [window.innerWidth, window.innerHeight];
    return { bridge: true, inner, keys, pinnedBefore, unpinned, pinnedAfter, grown, clampedLow, reset, badPath, badScheme, hasRequire: typeof require };
  })()`);
  console.log(`smoke:widget-bridge ${JSON.stringify(probe)}`);
  check(probe.bridge && probe.keys === 'close,isPinned,openMain,pin,setHeight', 'bridge keys');
  check(probe.pinnedBefore === true && probe.unpinned === false && probe.pinnedAfter === false, 'pin toggle');
  check(probe.grown === 300 && probe.clampedLow === 140 && probe.reset === WIDGET_HEIGHT, 'setHeight clamp');
  check(content().height === WIDGET_HEIGHT && widget.isAlwaysOnTop(), 'bounds after bridge');
  check(probe.inner[0] === WIDGET_WIDTH && probe.inner[1] === WIDGET_HEIGHT, 'page viewport 380x200');
  check(probe.badPath.ok === false && probe.badScheme.ok === false, 'openMain validation');
  check(probe.hasRequire === 'undefined', 'no node in page');
  check(readJson(userFile('widget-state.json'), {}).pinned === true, 'pinned saved');

  // 3) ESC는 위젯을 숨기고 페이지는 살려 둔다. 다시 열면 다시 불러오지 않고 바로 뜬다.
  widget.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  widget.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(() => !widgetVisible(), 'esc hides', 5000);
  check(!widget.isDestroyed(), 'page kept alive');
  // 빠진 모니터에 있던 저장 위치는 다시 열 때 지금 작업 영역 안으로 들어온다.
  saveWidgetState({ x: -5000, y: 99999 });
  toggleWidget();
  check(widgetVisible(), 'toggle shows again immediately');
  const restored = widget.getBounds();
  const restoredArea = screen.getDisplayMatching(restored).workArea;
  console.log(`smoke:widget-clamp ${JSON.stringify(restored)}`);
  check(restored.x >= restoredArea.x && restored.y >= restoredArea.y
    && restored.x + restored.width <= restoredArea.x + restoredArea.width
    && restored.y + restored.height <= restoredArea.y + restoredArea.height, 'saved position clamped');
  toggleWidget();
  check(!widgetVisible(), 'toggle hides');
  console.log('smoke:widget-toggle ok');

  // 4) 세션 만료: /widget → /login이면 위젯은 숨은 채로, 메인 창이 로그인 주소를 연다.
  const server = await startLoggedOutHub();
  hubUrlOverride = `http://127.0.0.1:${server.address().port}`;
  toggleWidget();
  await waitFor(() => isLoginUrl(win.webContents.getURL(), hubUrlOverride), 'main at login');
  await sleep(1000);
  check(!widgetVisible(), 'widget stays hidden on login');
  check(!isLoginUrl(widget.webContents.getURL(), hubUrlOverride), 'widget never renders login');
  check(!new URL(win.webContents.getURL()).searchParams.has('next'), 'main login drops next=/widget');
  console.log(`smoke:widget-login ok main=${win.webContents.getURL()} widget=${widget.webContents.getURL() || '(blank)'}`);
  server.close();

  clearTimeout(giveUp);
  console.log('smoke:widget ok');
  app.exit(0);
}

// ── 위젯 허브 스모크: 실제 허브의 /widget을 위젯 창에 띄워 기본 모습과 Enter 뒤 영수증을 찍는다 ──
// 허브 쪽 화면 확인용이다(개발 서버에서는 loopback이 로그인을 통과한다). 결과 PNG는 --smoke-out과
// 같은 이름에 -after-enter를 붙인 것까지 둘이다. 저장이 되는 허브라면 메모가 실제로 한 건 남는다 —
// Supabase를 연결하지 않은 개발 서버에서 돌리면 preview 영수증("저장하지 않았습니다")만 찍힌다.
async function runWidgetHubSmoke() {
  const giveUp = setTimeout(() => {
    console.log('smoke:fail timeout');
    app.exit(1);
  }, 150000);
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
  };
  const target = normalizeHubUrl(SMOKE_HUB);
  check(target.ok, `smoke-hub ${SMOKE_HUB}`);
  hubUrlOverride = target.url;

  const probe = () => widget.webContents.executeJavaScript(`(() => {
    const q = (s) => document.querySelector(s);
    const card = q('.quick-widget');
    return {
      url: location.href,
      app: Boolean(q('.quick-widget-page.is-app')),
      theme: q('.quick-widget-page') ? q('.quick-widget-page').dataset.theme : null,
      pin: q('.quick-widget__pin') ? q('.quick-widget__pin').getAttribute('aria-pressed') : null,
      close: Boolean(q('[aria-label="닫기"]')),
      slot: q('.quick-widget__slot') ? q('.quick-widget__slot').dataset.slot : null,
      receipt: q('.quick-widget__receipt') ? q('.quick-widget__receipt').textContent : null,
      focused: Boolean(document.activeElement && document.activeElement.classList.contains('quick-widget__input')),
      viewport: [innerWidth, innerHeight],
      card: card ? [Math.round(card.getBoundingClientRect().width), Math.round(card.getBoundingClientRect().height)] : null,
      overflow: card ? card.scrollHeight - card.clientHeight : null,
    };
  })()`).catch(() => ({}));
  const settle = async (ready, label) => {
    const started = Date.now();
    for (;;) {
      const state = await probe();
      if (ready(state)) return state;
      if (Date.now() - started > 60000) throw new Error(`wait ${label} ${JSON.stringify(state)}`);
      await sleep(250);
    }
  };
  const capture = async (suffix) => {
    const image = await widget.webContents.capturePage(undefined, { stayHidden: true });
    const out = path.resolve(suffix ? SMOKE_OUT.replace(/(\.png)?$/i, `-${suffix}.png`) : SMOKE_OUT);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, image.toPNG());
    console.log(`smoke:png ${out} ${image.getSize().width}x${image.getSize().height}`);
  };
  const firstActionSettled = (s) => Boolean(s.slot) && s.slot !== 'loading';

  toggleWidget();
  await waitFor(widgetVisible, 'widget visible', 90000);
  if (SMOKE_THEME === 'light' || SMOKE_THEME === 'dark') {
    await widget.webContents.executeJavaScript(`localStorage.setItem('mlp.theme', ${JSON.stringify(SMOKE_THEME)})`);
    widget.webContents.reload();
    await sleep(500);
    await settle((s) => s.theme === SMOKE_THEME && firstActionSettled(s), 'theme');
  }
  const ready = await settle(firstActionSettled, 'first action');
  await sleep(600);
  console.log(`smoke:widget-page ${JSON.stringify(ready)}`);
  check(ready.app && ready.pin !== null && ready.close, 'bridge controls on the page');
  check(ready.viewport[0] === WIDGET_WIDTH && ready.viewport[1] === WIDGET_HEIGHT, 'page viewport 380x200');
  check(ready.overflow === 0, 'widget content fits 200px');
  await capture('');

  await widget.webContents.executeJavaScript(`document.querySelector('.quick-widget__input').focus()`);
  widget.webContents.insertText('위젯 스모크 메모');
  widget.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  widget.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  widget.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  const after = await settle((s) => typeof s.receipt === 'string' && !/보관합니다|저장 중/.test(s.receipt), 'receipt');
  await sleep(400);
  console.log(`smoke:widget-after-enter ${JSON.stringify(await probe())}`);
  check(!/저장됨/.test(after.receipt) || !/Preview/.test(after.receipt), 'preview never says saved');
  await capture('after-enter');

  clearTimeout(giveUp);
  console.log('smoke:widget-hub ok');
  app.exit(0);
}

// ── Moonlight 펫 ─────────────────────────────────────────────────────────
// 화면 가장자리의 작은 캐릭터와 Acrylic 빠른 패널(pet/main). 허브 호출은 메인 창과 같은 기본 세션 쿠키를 쓴다.
// 펫을 띄우지 못해도 허브 창·위젯은 그대로 동작해야 하므로 실패는 경고만 남긴다.
function installPet() {
  try {
    return require('./pet/main/pet-main').install({
      app,
      getHubUrl: currentHubUrl,
      openMainUrl,
      showSettings: () => showSettings(),
      openExternal,
    });
  } catch (error) {
    console.warn(`pet: ${error && error.message}`);
    return null;
  }
}

// ── 시작 ─────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    if (SMOKE_PET) {
      // 펫 창만 띄운다 — 메인 창·트레이·전역 단축키는 만들지 않는다.
      // --smoke-pet-activate: 패널에 실제 포커스를 주고 blur 접기까지 본다(운영자 화면의 포커스를 옮긴다).
      require('./pet/main/pet-smoke').run({ app, out: SMOKE_OUT, page: SMOKE_PET_PAGE, activate: argValue('smoke-pet-activate') !== null });
      return;
    }
    // 허브 origin의 권한 요청만 받는다(알림·클립보드 등). 그 밖은 거절.
    session.defaultSession.setPermissionRequestHandler((contents, _permission, callback, details) => {
      callback(isSameOrigin(details.requestingUrl || contents.getURL(), currentHubUrl()));
    });
    registerIpc();
    createWindow();
    buildMenus();
    if (SMOKE_WIDGET && SMOKE_HUB) {
      runWidgetHubSmoke().catch((error) => {
        console.log(`smoke:fail ${error.message}`);
        app.exit(1);
      });
    } else if (SMOKE_WIDGET) {
      hubUrlOverride = 'https://example.com';
      runWidgetSmoke().catch((error) => {
        console.log(`smoke:fail ${error.message}`);
        app.exit(1);
      });
    } else if (SMOKE) {
      runSmoke();
    } else {
      for (const [accelerator, action] of [[QUICK_CAPTURE_ACCELERATOR, quickCapture], [WIDGET_ACCELERATOR, toggleWidget]]) {
        if (!globalShortcut.register(accelerator, action)) console.warn(`shortcut ${accelerator} is taken by another app`);
      }
      pet = installPet();
      refreshMenus();
    }
    loadHub();
  });
}

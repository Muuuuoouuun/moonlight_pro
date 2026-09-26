// Moonlight 데스크톱 셸 — 허브 주소 하나를 창에 띄우고, 트레이·빠른 입력 단축키만 더한다.
'use strict';
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeHubUrl, resolveHubUrl, isSameOrigin, dashboardUrl, isExternalOpenable } = require('./hub-url');

const BACKGROUND = '#141C27';
const QUICK_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+Space';
const SETTINGS_PAGE = path.join(__dirname, 'settings', 'index.html');

// ── 실행 인자 ─────────────────────────────────────────────────────────────
function argValue(name) {
  const hit = process.argv.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
}
const SMOKE = argValue('smoke-test') !== null;
const SMOKE_OUT = argValue('smoke-out') || path.join(process.cwd(), 'smoke.png');
const SMOKE_CAPTURE = argValue('smoke-quick-capture') !== null; // 스모크에서 빠른 입력 경로까지 찍기
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
const currentHubUrl = () => resolveHubUrl(readSettings().hubUrl, appConfig.hubUrl);

function iconPath() {
  const packaged = path.join(__dirname, 'assets', 'icon-192.png');
  return fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', 'hub', 'public', 'icon-192.png');
}

// ── 창 ────────────────────────────────────────────────────────────────────
let win = null;
let tray = null;
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

function guardNavigation(contents) {
  const outward = (event, url) => {
    if (isInApp(url)) return;
    event.preventDefault();
    openExternal(url);
  };
  contents.on('will-navigate', outward);
  contents.on('will-redirect', outward);
  contents.setWindowOpenHandler(({ url }) => {
    if (isSameOrigin(url, currentHubUrl())) contents.loadURL(url);
    else openExternal(url);
    return { action: 'deny' };
  });
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    // -3(ERR_ABORTED)은 다른 이동이 앞선 것이라 실패가 아니다.
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return;
    showSettings({ failed: url, reason: description });
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

// ── 메뉴·트레이 ───────────────────────────────────────────────────────────
function quit() {
  quitting = true;
  app.quit();
}

function buildMenus() {
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Moonlight',
      submenu: [
        { label: '빠른 입력', accelerator: QUICK_CAPTURE_ACCELERATOR, registerAccelerator: false, click: quickCapture },
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

  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16, quality: 'best' }));
  tray.setToolTip('Moonlight');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: showWindow },
    { label: '빠른 입력', accelerator: QUICK_CAPTURE_ACCELERATOR, registerAccelerator: false, click: quickCapture },
    { label: '허브 주소 바꾸기', click: () => showSettings() },
    { type: 'separator' },
    { label: '종료', click: quit },
  ]));
  tray.on('click', showWindow);
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
    loadHub();
    return result;
  });
  ipcMain.handle('moonlight:open-external', (event, url) => {
    fromSettingsPage(event);
    openExternal(String(url || ''));
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

// ── 시작 ─────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    // 허브 origin의 권한 요청만 받는다(알림·클립보드 등). 그 밖은 거절.
    session.defaultSession.setPermissionRequestHandler((contents, _permission, callback, details) => {
      callback(isSameOrigin(details.requestingUrl || contents.getURL(), currentHubUrl()));
    });
    registerIpc();
    createWindow();
    buildMenus();
    if (SMOKE) runSmoke();
    else if (!globalShortcut.register(QUICK_CAPTURE_ACCELERATOR, quickCapture)) {
      console.warn(`shortcut ${QUICK_CAPTURE_ACCELERATOR} is taken by another app`);
    }
    loadHub();
  });
}

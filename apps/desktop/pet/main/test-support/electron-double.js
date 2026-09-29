'use strict';
// 테스트 전용 — pet-main.install() 이 쓰는 Electron 표면만 흉내 낸 대역. 창은 그려지지 않고 상태만 기록한다.
// 쓰는 법: const E = createElectronDouble({ userData }); useElectron(E); 그다음 require('../pet-main').
const Module = require('node:module');
const { EventEmitter } = require('node:events');

// options.displays: [{ id, bounds, workArea }] 로 여러 모니터(첫 번째가 주 모니터). 없으면 1920×1080 하나.
// screen.displays 를 바꾸고 screen.emit('display-removed') 등으로 모니터 변화를 흉내 낸다.
// screen.cursor = { x, y } 면 getCursorScreenPoint 가 그 값을 돌려준다(기본 null — 커서 없음).
function createElectronDouble(options = {}) {
  const workArea = options.workArea || { x: 0, y: 0, width: 1920, height: 1040 };
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea, scaleFactor: 1 };
  const overlap = (a, b) => {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const handlers = new Map();
  const handleCalls = [];
  const windows = [];
  const cookies = options.cookies || [];
  const popups = [];
  const shortcuts = new Map();

  class WebContents extends EventEmitter {
    constructor(win) {
      super();
      this.win = win;
      this.sent = [];
    }
    send(channel, payload) { this.sent.push([channel, payload]); }
    setWindowOpenHandler() {}
    focus() {}
    reload() {}
  }

  class BrowserWindow extends EventEmitter {
    constructor(opts = {}) {
      super();
      this.opts = opts;
      this.bounds = { x: opts.x || 0, y: opts.y || 0, width: opts.width || 100, height: opts.height || 100 };
      this.visible = false;
      this.destroyed = false;
      this.focused = false;
      this.alwaysOnTop = Boolean(opts.alwaysOnTop);
      this.material = opts.backgroundMaterial || 'none';
      this.vibrancy = opts.vibrancy || null;
      this.allWorkspaces = null; // setVisibleOnAllWorkspaces(visible, options) 마지막 호출
      this.calls = []; // show·showInactive·focus 순서(플랫폼별 띄우기 확인용)
      this.webContents = new WebContents(this);
      this.loaded = null;
      windows.push(this);
    }
    loadFile(file, opts) {
      this.loaded = { file, query: opts && opts.query };
      setImmediate(() => this.webContents.emit('did-finish-load'));
      return Promise.resolve();
    }
    loadURL(url) {
      this.loaded = { url };
      setImmediate(() => this.webContents.emit('did-finish-load'));
      return Promise.resolve();
    }
    setAlwaysOnTop(on) { this.alwaysOnTop = Boolean(on); }
    isAlwaysOnTop() { return this.alwaysOnTop; }
    isDestroyed() { return this.destroyed; }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.visible = false;
      this.emit('closed');
    }
    show() { this.visible = true; this.calls.push('show'); }
    showInactive() { this.visible = true; this.calls.push('showInactive'); }
    hide() { this.visible = false; }
    isVisible() { return this.visible && !this.destroyed; }
    focus() { this.focused = true; this.calls.push('focus'); }
    isFocused() { return this.focused; }
    isFocusable() { return this.opts.focusable !== false; }
    moveTop() {}
    setBounds(rect) { this.bounds = { ...this.bounds, ...rect }; }
    getBounds() { return { ...this.bounds }; }
    getContentBounds() { return { ...this.bounds }; }
    getNativeWindowHandle() { throw new Error('no native window in tests'); }
    setBackgroundMaterial(material) { this.material = material; }
    setVibrancy(type) { this.vibrancy = type; }
    setVisibleOnAllWorkspaces(visible, opts) { this.allWorkspaces = { visible, options: opts }; }
    isVisibleOnAllWorkspaces() { return Boolean(this.allWorkspaces && this.allWorkspaces.visible); }
    setBackgroundColor(color) { this.backgroundColor = color; }
    setIgnoreMouseEvents() {}
  }

  const ipcMain = {
    handle(channel, fn) {
      handleCalls.push(channel);
      if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
      handlers.set(channel, fn);
    },
    removeHandler(channel) { handlers.delete(channel); },
  };

  const app = new EventEmitter();
  app.getPath = () => options.userData;
  app.focusCalls = [];
  app.focus = (opts) => { app.focusCalls.push(opts); };

  const electron = {
    app,
    BrowserWindow,
    ipcMain,
    Menu: { buildFromTemplate: (template) => ({ template, popup: (o) => popups.push({ template, o }) }) },
    globalShortcut: {
      register: (accelerator, fn) => { shortcuts.set(accelerator, fn); return true; },
      unregister: (accelerator) => { shortcuts.delete(accelerator); },
    },
    nativeImage: {
      createFromPath: () => ({ isEmpty: () => true, resize: () => null }),
      createEmpty: () => {
        const reps = [];
        return { reps, addRepresentation: (r) => reps.push(r), isEmpty: () => reps.length === 0 };
      },
    },
    nativeTheme: Object.assign(new EventEmitter(), { prefersReducedTransparency: false, shouldUseHighContrastColors: false }),
    // 잠자기·화면 잠금 — 테스트가 powerMonitor.emit('suspend' | 'resume' | 'lock-screen' | 'unlock-screen')로 흉내 낸다.
    powerMonitor: new EventEmitter(),
    screen: Object.assign(new EventEmitter(), {
      displays: options.displays ? options.displays.map((d) => ({ scaleFactor: 1, ...d })) : [display],
      cursor: null,
      getAllDisplays() { return this.displays; },
      getPrimaryDisplay() { return this.displays[0]; },
      // 가장 많이 겹치는 화면, 없으면 주 화면(Electron 은 가장 가까운 화면 — 테스트는 겹치는 경우만 쓴다).
      getDisplayMatching(rect) {
        let best = this.displays[0];
        let area = 0;
        for (const d of this.displays) {
          const a = overlap(rect, d.bounds);
          if (a > area) { best = d; area = a; }
        }
        return best;
      },
      getCursorScreenPoint() { return this.cursor; },
    }),
    session: {
      defaultSession: {
        cookies: {
          get: async ({ url }) => cookies.filter((c) => url.startsWith(c.origin)).map(({ name, value }) => ({ name, value })),
          set: async () => {},
          remove: async () => {},
        },
      },
    },
    shell: { openExternal: () => Promise.resolve() },
    systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: false }) },
  };

  // 렌더러 창에서 온 IPC 호출처럼 부른다(최상위 프레임).
  async function invoke(channel, win, payload) {
    const fn = handlers.get(channel);
    if (!fn) throw new Error(`no handler ${channel}`);
    return fn({ sender: win.webContents, senderFrame: { parent: null, url: 'file:///pet' } }, payload);
  }

  return { electron, windows, handlers, handleCalls, invoke, popups, shortcuts, display, cookies };
}

// require('electron') 을 이 대역으로 바꾼다(테스트 파일 한 프로세스 안에서만).
function useElectron(double) {
  const load = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return double.electron;
    return load.call(this, request, parent, isMain);
  };
  return () => { Module._load = load; };
}

module.exports = { createElectronDouble, useElectron };

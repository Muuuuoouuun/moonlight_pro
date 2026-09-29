'use strict';
// `--smoke-pet` — 펫 셸을 실제 화면에 띄워 확인하고 실제 화면 영역을 PNG로 남긴 뒤 종료한다.
//   npx electron . --smoke-pet --smoke-out=pet.png --user-data-dir=<빈 폴더> [--smoke-pet-page=<폴더|파일>]
// macOS 는 DWM 대신 vibrancy·비활성 패널·모든 Space 를 보고, 집중 화면이 메뉴 막대·Dock 까지 덮는지 본다.
// --smoke-pet-eager: 걸친 캐릭터·말풍선 창을 미리 만든다(늦게 만들기와 대기 중 프로세스·메모리를 비교할 때).
// 확인: Acrylic 창 + DWM 두 속성, 펫·빠른 패널·걸친 캐릭터·말풍선·집중 화면의 크기·자리, 클릭 모델(한 번 → 빠른 패널,
// 두 번 → 위젯), 세로 끌기, 프리로드 다리(허용 채널·거절·Node 없음), Esc 1.3초. 창은 찍는 동안만 화면에 둔다.
// 운영자 화면의 포커스를 빼앗지 않도록 패널은 비활성으로 띄운다(Acrylic이 비활성에서도 블러를 유지하는지도 같이 본다).
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, desktopCapturer, powerMonitor, screen } = require('electron');
const C = require('../shared/contract');
const G = require('./pet-geometry');
const { install } = require('./pet-main');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, label, ms = 10000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) throw new Error(`wait ${label}`);
    await sleep(50);
  }
}

function check(ok, label, detail) {
  if (!ok) throw new Error(`${label}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
}

const union = (rects, margin, bounds) => {
  const x0 = Math.min(...rects.map((r) => r.x)) - margin;
  const y0 = Math.min(...rects.map((r) => r.y)) - margin;
  const x1 = Math.max(...rects.map((r) => r.x + r.width)) + margin;
  const y1 = Math.max(...rects.map((r) => r.y + r.height)) + margin;
  const x = Math.max(bounds.x, x0);
  const y = Math.max(bounds.y, y0);
  return { x, y, width: Math.min(bounds.x + bounds.width, x1) - x, height: Math.min(bounds.y + bounds.height, y1) - y };
};

// 실제 화면(주 화면)을 찍어 rect(DIP) 부분만 PNG로.
// macOS 는 화면 기록 권한이 없으면 desktopCapturer 가 'Failed to get sources'로 거절한다 — 그때는 실패로 치지 않고
// smoke:warn 만 남긴다(창 크기·자리·다리 검사는 그대로 돈다). --smoke-pet-hold=<ms> 면 찍는 자리마다 그만큼 창을 둔다
// (권한 있는 다른 도구로 화면을 찍을 때).
const HOLD_MS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--smoke-pet-hold='));
  const ms = arg ? Number(arg.split('=')[1]) : 0;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 30000) : 0;
})();

async function captureRegion(rect, file) {
  await sleep(700); // 합성·블러가 자리 잡을 시간
  if (HOLD_MS) {
    console.log(`smoke:hold ${path.basename(file)} ${JSON.stringify(rect)}`);
    await sleep(HOLD_MS);
  }
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor;
  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.bounds.width * scale), height: Math.round(display.bounds.height * scale) },
    });
  } catch (error) {
    if (process.platform !== 'darwin') throw error;
    console.log(`smoke:warn capture unavailable (${error && error.message ? error.message : String(error)}) — macOS 화면 기록 권한이 필요하다: ${path.basename(file)}`);
    return false;
  }
  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source) throw new Error('no screen source');
  const image = source.thumbnail;
  const k = image.getSize().width / display.bounds.width;
  const crop = image.crop({
    x: Math.round((rect.x - display.bounds.x) * k),
    y: Math.round((rect.y - display.bounds.y) * k),
    width: Math.round(rect.width * k),
    height: Math.round(rect.height * k),
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, crop.toPNG());
  console.log(`smoke:png ${file} ${crop.getSize().width}x${crop.getSize().height}`);
  return true;
}

const suffixed = (out, suffix) => (suffix ? out.replace(/(\.png)?$/i, `-${suffix}.png`) : out);

// 대기 중 프로세스 수·메모리(app.getAppMetrics). 렌더러 하나가 펫 창 하나다.
function logMetrics(app, label) {
  const metrics = app.getAppMetrics();
  const byType = {};
  let kb = 0;
  for (const m of metrics) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    kb += (m.memory && m.memory.workingSetSize) || 0;
  }
  console.log(`smoke:metrics ${label} processes=${metrics.length} ${JSON.stringify(byType)} workingSetMB=${Math.round(kb / 1024)}`);
  return { processes: metrics.length, byType, mb: Math.round(kb / 1024) };
}

async function run({ app, out, page, activate = false }) {
  const giveUp = setTimeout(() => {
    console.log('smoke:fail timeout');
    app.exit(1);
  }, 150000);
  if (powerMonitor.getSystemIdleState(1) === 'locked') console.log('smoke:warn session locked — captures will be blank');

  let pageOptions = {};
  if (page) {
    const resolved = path.resolve(page);
    pageOptions = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
      ? { pagesDir: resolved, assetsDir: path.join(resolved, 'assets') }
      : { pageFile: resolved, assetsDir: path.join(path.dirname(resolved), 'assets') };
  }
  const opened = [];
  const pet = install({
    app,
    getHubUrl: () => '',
    openMainUrl: (url) => opened.push(url),
    showSettings: () => opened.push('settings'),
    openExternal: (url) => console.log(`smoke:external ${url}`),
    registerShortcut: false,
    activate,
    lazyWindows: process.argv.includes('--smoke-pet-eager') ? false : undefined,
    // 허브는 기본 경로(pet-main loadDefaultHub → pet-hub.js)로 만든다 — 패키지(asar) 안의 허브 모듈이 실제로 읽히는지 본다.
    // 주소가 비어 있어 네트워크에는 나가지 않는다.
    log: (message) => console.log(message),
    ...pageOptions,
  });
  const w = pet.windows;
  const outFile = path.resolve(out);

  try {
    await pet.ready;
    const dwm = await pet.dwmReady;
    const mac = pet.platform === 'darwin';
    console.log(`smoke:dwm ${JSON.stringify(dwm)}`);
    if (mac) {
      // DWM 은 Windows 전용 — 프로세스를 띄우지 않고 건너뛴다. 대신 vibrancy·비활성 패널·모든 Space.
      check(dwm.error === 'platform', 'dwm skipped on macOS', dwm);
      const material = { panel: w.panel.petMaterial, type: w.panel.petPlatform, allSpaces: [w.pet, w.panel].map((x) => x.isVisibleOnAllWorkspaces()) };
      console.log(`smoke:mac-material ${JSON.stringify(material)}`);
      check(material.panel === 'hud' && material.allSpaces.every(Boolean), 'vibrancy + all Spaces', material);
    } else {
      check(dwm.ok, 'dwm attributes', dwm);
    }
    await sleep(1500); // 렌더러가 자리 잡은 뒤 잰다
    logMetrics(app, 'idle');
    console.log(`smoke:lazy ${JSON.stringify(w.created())}`);

    // 1) 대기 펫: 56×56, 오른쪽 가장자리 8px, 아래쪽 1/3, 포커스 없음.
    await waitFor(() => w.pet.isVisible(), 'pet visible');
    // macOS 는 메뉴 막대·Dock 이 움직이면 작업 영역이 1pt 씩 바뀐다 — 단계마다 다시 읽는다(freshWorkArea).
    const freshWorkArea = () => screen.getDisplayMatching(w.pet.getBounds()).workArea;
    let wa = freshWorkArea();
    const petBox = w.pet.getBounds();
    console.log(`smoke:pet-bounds ${JSON.stringify(petBox)} content=${JSON.stringify(w.pet.getContentBounds())} workArea=${JSON.stringify(wa)}`);
    check(petBox.width === C.PET_SIZE && petBox.height === C.PET_SIZE, 'pet 56x56', petBox);
    check(petBox.x === wa.x + wa.width - C.PET_SIZE - C.PET_EDGE_INSET, 'pet 8px from right edge', petBox);
    check(petBox.y > wa.y + wa.height / 2, 'pet in lower half', petBox);
    check(!w.pet.isFocusable(), 'pet not focusable');
    check(w.pet.isAlwaysOnTop(), 'pet always on top');

    // 2) 한 번 클릭 → 빠른 패널(할 일) 바로.
    pet.pointer('pet', 'pet:press', { pressed: true, source: 'pet' });
    pet.pointer('pet', 'pet:drag', { phase: 'begin', screenY: petBox.y + 20 });
    pet.pointer('pet', 'pet:drag', { phase: 'end', screenY: petBox.y + 21 });
    pet.pointer('pet', 'pet:press', { pressed: false, source: 'pet' });
    await waitFor(() => w.panel.isVisible(), 'quick panel visible');
    let s = pet.state();
    check(s.panelOpen && s.presentation === 'quick' && s.mode === 'tasks', 'click opens quick tasks', s);
    const glass = w.panel.getContentBounds();
    const want = G.panelGlassSize('tasks');
    console.log(`smoke:quick ${JSON.stringify(w.panel.getBounds())} content=${JSON.stringify(glass)}`);
    check(glass.width === want.width && glass.height === want.height, 'quick glass = contract.glassSize(tasks)', glass);
    check(glass.x + glass.width === petBox.x - C.PANEL_GAP, 'quick panel 10px left of pet', glass);
    check(Math.abs((glass.y + glass.height / 2) - (petBox.y + C.PET_SIZE / 2)) <= 1 || glass.y === wa.y + G.SAFE_INSET
      || glass.y + glass.height === wa.y + wa.height - G.SAFE_INSET, 'quick panel vertically centred on pet', glass);
    check(!w.perch.isVisible() && w.pet.isVisible(), 'quick tasks: no perch, pet stays');

    // 다리: 허용 채널, 거절, Node 없음, 허브 주소 없음 = not-configured(허브 모델이 답한다: 'hub-url-missing').
    const pageUrl = w.panel.webContents.getURL();
    if (pageUrl.startsWith('file:')) {
      const probe = await w.panel.webContents.executeJavaScript(`(async () => {
        const b = window.moonlightPet;
        if (!b) return { bridge: false };
        const state = await b.invoke('pet:state');
        const tasks = await b.invoke('pet:tasks-list', {});
        let rejected = false;
        try { await b.invoke('moonlight-widget:pin', true); } catch { rejected = true; }
        let badEvent = false;
        try { b.on('pet:tasks-list', () => {}); } catch { badEvent = true; }
        const store = await b.invoke('pet:store-set', { key: 'petPreview.taskDraft', value: '스모크' });
        const back = await b.invoke('pet:store-get', { key: 'petPreview.taskDraft' });
        const denied = await b.invoke('pet:store-set', { key: 'other', value: 1 });
        const hub = await b.invoke('pet:open-hub', { path: '/dashboard' });
        const focus = await b.invoke('pet:focus-state', {});
        return { bridge: true, keys: Object.keys(b).sort().join(','), character: state.character, characters: state.characters.length,
          hubStatus: state.hubStatus, tasks, rejected, badEvent, store, back, denied, hub, focus: focus.kind,
          hasRequire: typeof require, hasProcess: typeof process, viewport: [innerWidth, innerHeight] };
      })()`);
      console.log(`smoke:pet-bridge ${JSON.stringify(probe)}`);
      check(probe.bridge && probe.keys === 'invoke,on', 'bridge keys', probe);
      check(probe.character === 'silver' && probe.characters === 9, 'default character silver', probe);
      check(probe.hubStatus === 'not-configured' && probe.tasks.kind === 'not-configured', 'no hub → not-configured', probe);
      check(probe.tasks.error === 'hub-url-missing', 'hub model loaded (pet-hub.js answered, not the no-hub fallback)', probe);
      check(probe.rejected && probe.badEvent, 'unknown channels rejected', probe);
      check(probe.store.ok && probe.back === '스모크' && probe.denied.ok === false, 'store allowlist', probe);
      check(probe.hub.ok === false && probe.hub.reason === 'no-hub' && opened.includes('settings'), 'open-hub without hub → settings', probe);
      check(probe.focus === 'live', 'focus-state envelope', probe);
      check(probe.hasRequire === 'undefined' && probe.hasProcess === 'undefined', 'no node in page', probe);
      check(probe.viewport[0] === want.width && probe.viewport[1] === want.height, 'page viewport = glass', probe);
    } else {
      console.log(`smoke:pet-bridge skipped (page ${pageUrl.slice(0, 40)})`);
    }
    await captureRegion(union([w.panel.getBounds(), w.pet.getBounds()], 24, screen.getPrimaryDisplay().bounds), outFile);
    // 화면 캡처와 별개로 패널 페이지 자체(재질 없이 CSS 층만)도 남긴다 — 잠긴 세션에서도 페이지는 확인된다.
    const pageImage = await w.panel.webContents.capturePage(undefined, { stayHidden: true });
    fs.writeFileSync(suffixed(outFile, 'panel-page'), pageImage.toPNG());
    console.log(`smoke:png ${suffixed(outFile, 'panel-page')} ${pageImage.getSize().width}x${pageImage.getSize().height}`);

    // 2b) --smoke-pet-activate: 패널이 실제로 포커스를 받고, 다른 창으로 가면 빠른 패널이 접히는지(포커스를 옮긴다).
    if (activate) {
      pet.collapse();
      pet.openQuick();
      await waitFor(() => w.panel.isFocused(), 'quick panel focused', 3000);
      await sleep(500); // 띄우는 순간의 포커스 유예(400ms)가 지나야 blur를 "밖을 눌렀다"로 친다
      const helper = new BrowserWindow({ x: 4, y: 4, width: 24, height: 24, frame: false, skipTaskbar: true, show: false, thickFrame: false });
      helper.show();
      helper.focus();
      await waitFor(() => !pet.state().panelOpen, 'blur collapses quick panel', 3000);
      helper.destroy();
      console.log('smoke:pet-blur ok');
    }

    // 3) 두 번 클릭(500ms 안) → 지속 위젯: 펫 숨김, 걸친 캐릭터, 덩어리 오른쪽 위 = 펫 오른쪽 위.
    //    Mac과 같이 첫 클릭이 빠른 패널을 바로 열고, 500ms 안의 두 번째 클릭이 위젯으로 바꾼다.
    pet.collapse();
    await sleep(600);
    // 숨은 패널이 페이지에 어떻게 보이는지 기록만 한다(backgroundThrottling:false 면 숨어도 'visible').
    if (w.panel.webContents.getURL().startsWith('file:')) {
      console.log(`smoke:hidden-panel visibilityState=${await w.panel.webContents.executeJavaScript('document.visibilityState')}`);
    }
    pet.pointer('pet', 'pet:press', { pressed: true, source: 'pet' });
    pet.pointer('pet', 'pet:press', { pressed: false, source: 'pet' });
    check(pet.state().panelOpen && pet.state().presentation === 'quick', 'first click of a double click opens quick at once');
    pet.pointer('pet', 'pet:press', { pressed: true, source: 'pet' });
    pet.pointer('pet', 'pet:press', { pressed: false, source: 'pet' });
    await waitFor(() => pet.state().presentation === 'widget', 'double click → widget', 3000);
    await waitFor(() => w.perch.isVisible() && !w.pet.isVisible(), 'widget perch shown, pet hidden');
    s = pet.state();
    check(s.pinned && s.perched && s.mode === 'tasks', 'widget state', s);
    const wGlass = w.panel.getContentBounds();
    const perchBox = w.perch.getBounds();
    const pet2 = pet.petBounds;
    console.log(`smoke:widget glass=${JSON.stringify(wGlass)} perch=${JSON.stringify(perchBox)} pet=${JSON.stringify(pet2)}`);
    // 덩어리(유리 + 54px 띠)의 오른쪽 위 = 펫의 오른쪽 위, 화면 아래로 넘치면 작업 영역 안으로 밀린다.
    wa = freshWorkArea();
    const expected = G.glassFromCompanion(G.widgetCompanionFrame(pet2, G.panelGlassSize('tasks'), true, wa), true);
    check(wGlass.x + wGlass.width === pet2.x + pet2.width, 'widget right = pet right', { wGlass, pet2 });
    check(JSON.stringify(wGlass) === JSON.stringify(expected), 'widget glass under 54px strip, anchored at pet top-right', { wGlass, expected });
    check(expected.y - C.PERCH_STRIP === pet2.y || expected.y + expected.height === wa.y + wa.height - G.SAFE_INSET, 'widget top at pet top unless fitted', expected);
    check(JSON.stringify(perchBox) === JSON.stringify(G.perchBounds(wGlass)), 'perch 20px in, 54px up', { perchBox, wGlass });
    await sleep(400); // 늦게 만든 걸친 창(macOS)이 캐릭터를 그릴 시간
    await captureRegion(union([w.panel.getBounds(), perchBox], 24, screen.getPrimaryDisplay().bounds), suffixed(outFile, 'widget'));

    // 4) 위젯에서 모드 바꾸기(메모) — 오른쪽 위 고정, 걸친 캐릭터가 따라온다.
    pet.setMode('memo');
    const mGlass = w.panel.getContentBounds();
    const memo = G.panelGlassSize('memo');
    console.log(`smoke:memo glass=${JSON.stringify(mGlass)} perch=${JSON.stringify(w.perch.getBounds())}`);
    check(mGlass.width === memo.width && mGlass.height === memo.height, 'memo glass size', mGlass);
    check(mGlass.x + mGlass.width === wGlass.x + wGlass.width && mGlass.y === wGlass.y, 'resize keeps top-right', { mGlass, wGlass });
    check(JSON.stringify(w.perch.getBounds()) === JSON.stringify(G.perchBounds(mGlass)), 'perch follows resize');
    await captureRegion(union([w.panel.getBounds(), w.perch.getBounds()], 24, screen.getPrimaryDisplay().bounds), suffixed(outFile, 'memo'));

    // 5) 패널 손잡이 끌기: 3px 전엔 그대로, 넘으면 덩어리·걸친 캐릭터가 세로로만 같이.
    wa = freshWorkArea();
    const before = w.panel.getBounds();
    pet.pointer('panel', 'pet:drag', { phase: 'begin', screenY: 500 });
    pet.pointer('panel', 'pet:drag', { phase: 'move', screenY: 502 });
    check(JSON.stringify(w.panel.getBounds()) === JSON.stringify(before), 'drag threshold 3px');
    check(pet.state().panelOpen, 'press does not collapse');
    pet.pointer('panel', 'pet:drag', { phase: 'move', screenY: 460 });
    pet.pointer('panel', 'pet:drag', { phase: 'end', screenY: 460 });
    const after = w.panel.getBounds();
    console.log(`smoke:panel-drag ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    check(after.x === before.x && after.y === Math.max(before.y - 40, wa.y + G.SAFE_INSET + C.PERCH_STRIP), 'panel moved up 40px, x fixed', { before, after });
    check(JSON.stringify(w.perch.getBounds()) === JSON.stringify(G.perchBounds(w.panel.getContentBounds())), 'perch moves with panel');

    // 6) 접기 → 펫이 위젯 오른쪽 위 자리로 돌아온다.
    pet.collapse();
    await waitFor(() => w.pet.isVisible() && !w.panel.isVisible() && !w.perch.isVisible(), 'collapse restores pet');
    const back = w.pet.getBounds();
    check(back.y === G.petBoundsAt(after.y - C.PERCH_STRIP, wa).y && back.x + back.width === after.x + after.width, 'pet returns to widget top-right', { back, after });
    check(JSON.stringify(pet.store.get('pet.position')) === JSON.stringify({ x: back.x, y: back.y }), 'position saved');

    // 7) 펫 세로 끌기: x 고정, y만, 저장.
    pet.pointer('pet', 'pet:drag', { phase: 'begin', screenY: 300 });
    pet.pointer('pet', 'pet:drag', { phase: 'move', screenY: 360 });
    pet.pointer('pet', 'pet:drag', { phase: 'end', screenY: 360 });
    pet.pointer('pet', 'pet:press', { pressed: false });
    const moved = w.pet.getBounds();
    console.log(`smoke:pet-drag ${JSON.stringify(back)} → ${JSON.stringify(moved)}`);
    check(moved.x === back.x && moved.y === Math.min(back.y + 60, wa.y + wa.height - G.SAFE_INSET - C.PET_SIZE), 'pet dragged vertically', { back, moved });
    check(!pet.state().panelOpen, 'drag is not a click');
    check(pet.store.get('pet.position').y === moved.y, 'drag position saved');

    // 8) 짧은 메시지: 비활성으로 뜨고, 패널이 열리면 바로 내려간다.
    pet.pushNotice({ id: 'smoke-1', kind: 'event', title: '스모크 말풍선', body: '셸 확인', at: new Date().toISOString() });
    await waitFor(() => w.bubble.isVisible(), 'bubble visible');
    const bubbleBox = w.bubble.getContentBounds();
    console.log(`smoke:bubble ${JSON.stringify(bubbleBox)} focused=${w.bubble.isFocused()}`);
    check(bubbleBox.width === C.BUBBLE_SIZE.width && bubbleBox.height === C.BUBBLE_SIZE.height, 'bubble 326x130', bubbleBox);
    check(!w.bubble.isFocused() && !w.bubble.isFocusable(), 'bubble never takes focus');
    if (mac) check(w.bubble.petMaterial === 'hud' && w.bubble.isVisibleOnAllWorkspaces(), 'bubble vibrancy + all Spaces');
    check(bubbleBox.x + bubbleBox.width === moved.x - C.PANEL_GAP, 'bubble left of pet', bubbleBox);
    await captureRegion(union([w.bubble.getBounds(), w.pet.getBounds()], 24, screen.getPrimaryDisplay().bounds), suffixed(outFile, 'bubble'));
    pet.openQuick();
    await waitFor(() => !w.bubble.isVisible(), 'bubble hides when a panel opens');
    pet.pushNotice({ id: 'smoke-2', kind: 'event', title: '대기' });
    await sleep(1300);
    check(!w.bubble.isVisible(), 'no bubble while panel open');
    pet.collapse();
    await waitFor(() => w.bubble.isVisible(), 'queued bubble after collapse', 4000);
    pet.toggleBubble();
    await waitFor(() => !w.bubble.isVisible(), 'toggle hides bubble');

    // 9) 집중 화면: 화면마다 불투명 창 하나, 펫 숨김, Esc 1.3초 → 중지 확인, 중지 → 원래대로.
    const started = pet.startFocus(1);
    check(started.kind === 'live' && started.data.running && started.data.remainingSec === 60, 'focus started', started);
    const focusWins = w.focus();
    check(focusWins.length === screen.getAllDisplays().length, 'one focus window per display', focusWins.length);
    await waitFor(() => focusWins.every((f) => f.isVisible()) && !w.pet.isVisible(), 'focus windows up, pet hidden');
    for (const f of focusWins) {
      const d = screen.getDisplayMatching(f.getBounds());
      // macOS: display.bounds 는 메뉴 막대·Dock 을 포함한다 — 같으면 둘 다 덮은 것이다.
      console.log(`smoke:focus-bounds ${JSON.stringify(f.getContentBounds())} display=${JSON.stringify(d.bounds)} workArea=${JSON.stringify(d.workArea)}`);
      check(JSON.stringify(f.getContentBounds()) === JSON.stringify(d.bounds), 'focus covers display', { f: f.getContentBounds(), d: d.bounds });
      if (mac) check(f.isVisibleOnAllWorkspaces(), 'focus on all Spaces');
    }
    const primaryFocus = focusWins.find((f) => screen.getDisplayMatching(f.getBounds()).id === screen.getPrimaryDisplay().id);
    check(/primary=1/.test(primaryFocus.webContents.getURL()) || !primaryFocus.webContents.getURL().startsWith('file:'), 'primary display has the controls');
    const b0 = screen.getPrimaryDisplay().bounds;
    await captureRegion({ x: b0.x + b0.width / 2 - 360, y: b0.y + b0.height / 2 - 260, width: 720, height: 520 }, suffixed(outFile, 'focus'));
    primaryFocus.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await sleep(700);
    primaryFocus.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await sleep(900);
    check(!pet.state().focus.confirmStop, 'short Esc does nothing');
    primaryFocus.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await sleep(1500);
    primaryFocus.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    check(pet.state().focus.confirmStop && pet.state().focus.confirmRevision === 1, 'Esc held 1.3s → stop confirmation', pet.state().focus);
    const stopped = pet.stopFocus();
    check(!stopped.data.running, 'focus stopped');
    await waitFor(() => w.focus().length === 0 && w.pet.isVisible(), 'focus windows closed, pet back');
    check(focusWins.every((f) => f.isDestroyed()), 'focus windows destroyed');

    clearTimeout(giveUp);
    console.log('smoke:pet ok');
    pet.dispose();
    app.exit(0);
  } catch (error) {
    console.log(`smoke:fail ${error && error.message ? error.message : String(error)}`);
    try {
      pet.dispose();
    } catch { /* 종료 */ }
    app.exit(1);
  }
}

module.exports = { run, captureRegion };

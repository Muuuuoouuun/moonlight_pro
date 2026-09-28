// 빠른 패널 셸 — 헤더(제목·날짜·⋯·고정)·탭·끌기 손잡이·키보드·캐릭터 색을 맡고, 본문은 모드 모듈(modes/*.js)에 맡긴다.
// 창 크기·위치·빠른/위젯 판단은 메인(셸 패키지)이 한다. 이 페이지는 사용자의 뜻을 다리로 알리기만 한다.
'use strict';
(function () {
  const C = window.PetContract;
  const B = window.PetBridge;
  const U = window.PetUI;
  const M = window.PetModel;
  const P = M.panel;
  const $ = (id) => document.getElementById(id);

  const els = {
    glass: $('glass'), wash: $('wash'), handle: $('handle'), header: $('header'), title: $('title'), date: $('date'),
    headerTabs: $('header-tabs'), more: $('more'), pin: $('pin'), tabsRow: $('tabs-row'), root: $('mode-root'),
  };

  let state = null;
  let mode = 'tasks';
  let view = 'mode'; // 'mode' | 'hub-status'
  let instance = null;
  let pendingMode = null;
  let tabs = null; // { place, key, el }
  let dateOverride = null;
  let seenTargetSeq = 0; // 셸이 알린 마지막 목적지(state.modeTarget.seq)

  function normalizeState(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      character: s.character || C.DEFAULT_CHARACTER,
      characters: Array.isArray(s.characters) && s.characters.length ? s.characters : C.CHARACTERS,
      mode: C.MODES.includes(s.mode) ? s.mode : 'tasks',
      presentation: s.presentation === 'widget' ? 'widget' : 'quick',
      pinned: !!s.pinned,
      hubUrl: typeof s.hubUrl === 'string' ? s.hubUrl : '',
      hubStatus: s.hubStatus || 'unknown',
      badge: Number(s.badge) || 0,
      prefs: s.prefs || {},
      focus: s.focus || { running: false, remainingSec: 0, minutes: M.focus.DEFAULT },
      modeTarget: s.modeTarget && typeof s.modeTarget === 'object' ? s.modeTarget : null,
    };
  }

  // ── 모드 모듈에 주는 문맥 ─────────────────────────────
  const ctx = {
    C, B, U, M,
    get state() { return state; },
    get mode() { return mode; },
    setMode,
    openHub: (path) => B.invoke('pet:open-hub', { path }),
    showHubStatus,
    collapse,
    togglePresentation,
    setDateLine(text) { dateOverride = text; renderDate(); },
    handleAction(action, retry) {
      if (!action) return;
      if (action.kind === 'retry' && retry) retry();
      else if (action.kind === 'login') B.invoke('pet:open-hub', { path: '/login' });
      else if (action.kind === 'main') B.invoke('pet:open-hub', { path: '/dashboard' });
      else if (action.kind === 'status') showHubStatus();
    },
  };

  // ── 헤더 ─────────────────────────────────────────────
  function renderDate() {
    const showDate = view === 'mode' && P.showsDate(mode);
    els.date.hidden = !showDate;
    if (showDate) els.date.textContent = mode === 'calendar' && dateOverride ? dateOverride : M.calendar.dateLabel(new Date());
  }

  function renderHeader() {
    const current = view === 'hub-status' ? 'hub-status' : mode;
    els.title.textContent = P.titleFor(current);
    els.title.classList.toggle('large', P.isLargeTitle(current));
    renderDate();
    const widget = state.presentation === 'widget';
    U.clear(els.pin).append(U.icon(widget ? 'pinFilled' : 'pin', 17));
    els.pin.setAttribute('aria-pressed', String(widget));
    els.pin.setAttribute('aria-label', widget ? '빠른 기능으로 되돌리기' : '위젯으로 고정');
    els.pin.title = widget ? '빠른 기능으로 되돌리기' : '위젯으로 고정';
    els.pin.hidden = view === 'mode' && mode === 'memo';
    renderTabs();
  }

  function renderTabs() {
    const spec = view === 'mode' ? P.tabsFor(mode) : null;
    const key = spec ? `${spec.place}:${spec.modes.join(',')}` : '';
    if (tabs && tabs.key === key) { tabs.el.select(mode); return; }
    U.clear(els.headerTabs);
    U.clear(els.tabsRow);
    els.tabsRow.hidden = !spec || spec.place !== 'below';
    els.headerTabs.hidden = !spec || spec.place !== 'header';
    tabs = null;
    if (!spec) return;
    const el = U.segmented(spec.modes.map((m) => ({ value: m, label: C.MODE_LABEL[m], title: `${C.MODE_LABEL[m]} · ${P.hotkeyLabel(m)}` })), mode, setMode);
    (spec.place === 'header' ? els.headerTabs : els.tabsRow).append(el);
    tabs = { key, el };
  }

  // ── 모드 전환 ─────────────────────────────────────────
  function mount() {
    if (instance && instance.destroy) instance.destroy();
    instance = null;
    dateOverride = null;
    U.closeMenu();
    const root = U.clear(els.root);
    root.className = `mode-root mode-${view === 'hub-status' ? 'hub-status' : mode}`;
    const factory = view === 'hub-status' ? window.PetModes['hub-status'] : window.PetModes[mode];
    if (factory) {
      instance = factory.create(ctx);
      root.append(instance.el);
      instance.el.classList.add('enter');
      requestAnimationFrame(() => requestAnimationFrame(() => instance && instance.el.classList.remove('enter')));
    }
    renderHeader();
    if (document.hasFocus() && instance && instance.focus) instance.focus();
  }

  function setMode(next) {
    if (!C.MODES.includes(next)) return;
    const changed = next !== mode || view !== 'mode';
    mode = next;
    view = 'mode';
    if (changed) mount();
    pendingMode = next;
    B.invoke('pet:set-mode', { mode: next }).finally(() => { if (pendingMode === next) pendingMode = null; });
  }

  function showHubStatus() {
    if (view === 'hub-status') return;
    view = 'hub-status';
    mount();
  }
  function leaveHubStatus() {
    if (view !== 'hub-status') return;
    view = 'mode';
    mount();
  }

  function collapse() { U.closeMenu(); B.invoke('pet:collapse', {}); }
  function togglePresentation() {
    B.invoke('pet:set-presentation', { presentation: state.presentation === 'widget' ? 'quick' : 'widget' });
  }

  function openMainMenu() {
    const own = view === 'mode' && instance && instance.menuItems ? instance.menuItems() : [];
    const items = [...own];
    if (items.length) items.push({ divider: true });
    for (const m of C.MODE_HOTKEY_ORDER) {
      items.push({ label: C.MODE_LABEL[m], icon: U.MODE_ICON[m], hint: P.hotkeyLabel(m), checked: view === 'mode' && mode === m, onSelect: () => setMode(m) });
    }
    items.push({ divider: true });
    items.push(view === 'hub-status'
      ? { label: '빠른 기능으로 돌아가기', onSelect: leaveHubStatus }
      : { label: 'Hub 연결 상태', icon: 'globe', onSelect: showHubStatus });
    items.push({ label: '펫으로 접기', hint: 'Esc', onSelect: collapse });
    U.openMenu(els.more, items, { label: '빠른 기능 더보기' });
  }

  // ── 상태·이벤트 ───────────────────────────────────────
  // 알림에서 연 목적지: 모드 모듈이 다음 create 에서 그 날짜(그 날이 든 주)·그 담당·범위 대화로 연다.
  function takeModeTarget() {
    const step = P.modeTargetStep(seenTargetSeq, state.modeTarget, state.mode);
    seenTargetSeq = step.seen;
    const t = step.target;
    if (!t) return false;
    const Modes = window.PetModes || {};
    if (t.mode === 'calendar' && t.date && Modes.calendar && Modes.calendar.selectDate) Modes.calendar.selectDate(t.date);
    if (t.mode === 'council' && t.ownerId && Modes.council && Modes.council.selectSession) Modes.council.selectSession({ ownerId: t.ownerId, scope: t.scope || 'all' });
    pendingMode = null; // 목적지가 모드를 정했다
    return true;
  }

  function onState(raw) {
    const prev = state;
    state = normalizeState(raw);
    U.applyPrefs(state.prefs);
    const retarget = takeModeTarget();
    const nextMode = pendingMode && state.mode !== pendingMode ? mode : state.mode;
    if (nextMode !== mode || retarget) {
      mode = nextMode;
      view = 'mode';
      mount();
    } else {
      renderHeader();
      if (instance && instance.onState) instance.onState(state, prev);
    }
    if (prev && prev.hubStatus !== state.hubStatus) onHubStatus(state.hubStatus, prev.hubStatus);
  }

  function onHubStatus(status, before) {
    if (instance && instance.onHubStatus) instance.onHubStatus(status, before);
  }

  function setWash(w) {
    const on = !!(w && w.on);
    if (w && w.color) els.wash.style.setProperty('--wash-color', w.color);
    if (w && typeof w.opacity === 'number') els.wash.style.setProperty('--wash-opacity', String(w.opacity));
    els.wash.classList.toggle('on', on);
  }

  // 누름: 패널 어디든 눌렀다 떼는 동안 메인이 캐릭터 색을 켠다(pet:wash 로 돌아온다).
  let pressed = false;
  function press(on) {
    if (pressed === on) return;
    pressed = on;
    B.invoke('pet:press', { pressed: on, source: 'panel' });
  }

  // 끌기 손잡이: 세로로만. 3px 문턱과 화면 맞춤은 메인이 한다.
  function wireHandle() {
    let dragging = false;
    let lastY = 0;
    let frame = 0;
    const flush = () => { frame = 0; if (dragging) B.invoke('pet:drag', { phase: 'move', screenY: lastY }); };
    els.handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      els.handle.setPointerCapture(e.pointerId);
      dragging = true;
      lastY = e.screenY;
      els.handle.classList.add('dragging');
      B.invoke('pet:drag', { phase: 'begin', screenY: e.screenY });
    });
    els.handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      lastY = e.screenY;
      if (!frame) frame = requestAnimationFrame(flush);
    });
    const end = (e, cancelled) => {
      if (!dragging) return;
      dragging = false;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      els.handle.classList.remove('dragging');
      if (cancelled) B.invoke('pet:drag', { phase: 'cancel' });
      else B.invoke('pet:drag', { phase: 'end', screenY: e && typeof e.screenY === 'number' ? e.screenY : lastY });
    };
    els.handle.addEventListener('pointerup', (e) => end(e, false));
    els.handle.addEventListener('pointercancel', (e) => end(e, true));
    els.handle.addEventListener('lostpointercapture', (e) => end(e, true));
    // 키보드: 위아래 화살표로 24px 씩.
    els.handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const base = window.screenY + 10;
      const delta = e.key === 'ArrowUp' ? -24 : 24;
      B.invoke('pet:drag', { phase: 'begin', screenY: base })
        .then(() => B.invoke('pet:drag', { phase: 'move', screenY: base + delta }))
        .then(() => B.invoke('pet:drag', { phase: 'end', screenY: base + delta }));
    });
  }

  function onKey(e) {
    // 한글 조합 중의 Esc·Ctrl+S·Ctrl+Enter 는 입력기의 것이다(조합 확정·취소) — 패널 동작으로 읽지 않는다.
    if (e.isComposing || e.keyCode === 229) return;
    const act = P.keyAction(e);
    if (!act) return;
    if (act.type === 'collapse') {
      if (U.closeMenu()) { e.preventDefault(); return; }
      if (instance && instance.onEscape && instance.onEscape()) { e.preventDefault(); return; }
      e.preventDefault();
      collapse();
      return;
    }
    e.preventDefault();
    if (act.type === 'mode') setMode(act.mode);
    else if (act.type === 'save') { if (view === 'mode' && instance && instance.save) instance.save(); }
    else if (act.type === 'primary') { if (instance && instance.primary) instance.primary(); }
  }

  async function boot() {
    U.applyPrefs();
    state = normalizeState(await B.invoke('pet:state'));
    U.applyPrefs(state.prefs);
    takeModeTarget();
    mode = state.mode;
    els.more.append(U.icon('dots', 18));
    els.more.addEventListener('click', openMainMenu);
    els.pin.addEventListener('click', togglePresentation);
    wireHandle();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', (e) => { if (e.button === 0) press(true); }, true);
    window.addEventListener('pointerup', () => press(false), true);
    window.addEventListener('pointercancel', () => press(false), true);
    window.addEventListener('blur', () => press(false));
    window.addEventListener('focus', () => { if (instance && instance.onWindowFocus) instance.onWindowFocus(); if (instance && instance.focus) instance.focus(); });
    B.on('pet:state-changed', onState);
    B.on('pet:wash', setWash);
    B.on('pet:hub-status', (p) => {
      if (!p || !p.status || !state || p.status === state.hubStatus) return;
      const before = state.hubStatus;
      state = { ...state, hubStatus: p.status };
      onHubStatus(p.status, before);
    });
    B.on('pet:focus-tick', (p) => { if (instance && instance.onFocusTick) instance.onFocusTick(p); });
    B.on('pet:chat-reply', (p) => { if (instance && instance.onChatReply) instance.onChatReply(p); });
    B.on('pet:notice', (p) => { if (instance && instance.onNotice) instance.onNotice(p); });
    B.on('pet:badge', (p) => { if (instance && instance.onBadge) instance.onBadge(p); });
    setInterval(renderDate, 60 * 1000);
    mount();
    document.documentElement.dataset.ready = '1';
  }

  window.PetPanel = { get state() { return state; }, get mode() { return mode; }, get view() { return view; } };
  boot();
})();

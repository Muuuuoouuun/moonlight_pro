// 펫 창 공용 DOM 도구 — 요소 만들기, 선 아이콘, 버튼, 세그먼트, 봉투 안내, 스켈레톤, 창 안 메뉴, 접근성 설정.
// 모든 글자·아이콘은 흰 계열이고 뒤에 어두운 판을 두지 않는다(글자 그림자는 glass.css 가 맡는다).
'use strict';
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    const a = attrs || {};
    for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  // 24 격자 선 아이콘. currentColor 하나만 쓴다.
  const PATHS = {
    dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    pin: '<path d="M9 3.5h6"/><path d="M10 3.5v5.2L7 12.6v1.4h10v-1.4l-3-3.9V3.5"/><path d="M12 14v6.5"/>',
    pinFilled: '<path d="M9 3.5h6"/><path d="M10 3.5v5.2L7 12.6v1.4h10v-1.4l-3-3.9V3.5z" fill="currentColor"/><path d="M12 14v6.5"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    minus: '<path d="M5 12h14"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowUpRight: '<path d="M7 17 17 7M9 7h8v8"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    tray: '<path d="M4 13.5 6.6 5.5h10.8L20 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M4 13.5h4.6l1.2 2.2h4.4l1.2-2.2H20"/>',
    bubble: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.2" r=".9" fill="currentColor" stroke="none"/>',
    partial: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" opacity=".55"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.2h-4.2"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6M9.5 2.8h5"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    mappin: '<path d="M12 20.5s6-5.4 6-10.2a6 6 0 0 0-12 0c0 4.8 6 10.2 6 10.2z"/><circle cx="12" cy="10.3" r="2.2"/>',
    building: '<rect x="5" y="3.5" width="10" height="17" rx="1.5"/><path d="M15 9h3.5a.5.5 0 0 1 .5.5v11H15M8 7.5h4M8 11h4M8 14.5h4M9.5 20.5v-2.5h1v2.5"/>',
    people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="16.8" cy="9.5" r="2.6"/><path d="M15.6 14.2a4.6 4.6 0 0 1 5.4 4.8"/>',
    pencil: '<path d="M4 20l1-4.2L15.8 5a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19z"/><path d="M13.8 7l3.2 3.2"/>',
    list: '<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10"/><path d="M4.2 6.5l1 1 1.8-2M4.2 12l1 1 1.8-2"/><circle cx="5.3" cy="17.5" r="1.1"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
    filter: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
  };
  const MODE_ICON = { tasks: 'list', memo: 'pencil', calendar: 'calendar', office: 'building', council: 'people', focus: 'timer', notifications: 'bell' };

  function icon(name, size, extraClass) {
    const s = size || 16;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', `g${extraClass ? ` ${extraClass}` : ''}`);
    svg.innerHTML = PATHS[name] || PATHS.info;
    return svg;
  }

  // 완료 체크: 속이 찬 원에 체크를 도려낸다(글자색 하나로 두 상태를 구분 — 초록 없음).
  let maskSeq = 0;
  function checkGlyph(done, size) {
    const s = size || 20;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'g check');
    if (done) {
      const id = `pet-knock-${++maskSeq}`;
      svg.innerHTML = `<defs><mask id="${id}"><rect width="20" height="20" fill="#fff"/><path d="M5.8 10.3l2.8 2.8 5.6-6" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><circle cx="10" cy="10" r="9.5" fill="currentColor" mask="url(#${id})"/>`;
    } else {
      svg.innerHTML = '<circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1"/>';
    }
    return svg;
  }

  function action(label, opts) {
    const o = opts || {};
    const btn = h('button', {
      type: 'button',
      class: `action${o.compact ? ' compact' : ''}${o.wide ? ' wide' : ''}${o.className ? ` ${o.className}` : ''}`,
      title: o.title, 'aria-label': o.ariaLabel, 'aria-pressed': o.pressed == null ? null : String(!!o.pressed),
      disabled: !!o.disabled, onclick: o.onClick,
    });
    btn.append(h('span', { class: 'mini-rim rim-65', 'aria-hidden': 'true' }));
    if (o.icon && o.iconFirst) btn.append(icon(o.icon, o.iconSize || 13));
    if (label) btn.append(h('span', { class: 'label', text: label }));
    if (o.icon && !o.iconFirst) btn.append(icon(o.icon, o.iconSize || 12));
    return btn;
  }

  function quiet(label, opts) {
    const o = opts || {};
    const btn = h('button', {
      type: 'button', class: `quiet${o.className ? ` ${o.className}` : ''}`, title: o.title,
      'aria-label': o.ariaLabel || (label ? null : o.title), 'aria-pressed': o.pressed == null ? null : String(!!o.pressed),
      'aria-haspopup': o.menu ? 'menu' : null, disabled: !!o.disabled, onclick: o.onClick,
    });
    if (o.icon && !o.iconAfter) btn.append(icon(o.icon, o.iconSize || 16));
    if (label) btn.append(h('span', { class: 'label', text: label }));
    if (o.icon && o.iconAfter) btn.append(icon(o.icon, o.iconSize || 16));
    return btn;
  }

  // 세그먼트: 3px 트랙 + 미끄러지는 알약(반경 10). 선택은 aria-pressed 하나가 정본.
  function segmented(options, value, onSelect, extraClass) {
    const track = h('div', { class: `seg${extraClass ? ` ${extraClass}` : ''}`, role: 'group' });
    track.append(h('span', { class: 'mini-rim rim-20', 'aria-hidden': 'true' }));
    const pill = h('span', { class: 'seg-pill', 'aria-hidden': 'true' }, h('span', { class: 'mini-rim rim-50' }));
    track.append(pill);
    const buttons = options.map((opt) => h('button', {
      type: 'button', class: 'seg-btn', text: opt.label, 'aria-pressed': String(opt.value === value), title: opt.title,
      onclick: () => { if (opt.value !== track.dataset.value) onSelect(opt.value); },
    }));
    buttons.forEach((b) => track.append(b));
    function place(v, animate) {
      track.dataset.value = v;
      const i = Math.max(0, options.findIndex((o) => o.value === v));
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      if (!animate) pill.classList.add('no-anim');
      pill.style.width = `calc((100% - 6px - ${(options.length - 1) * 2}px) / ${options.length})`;
      pill.style.transform = `translateX(calc(${i} * (100% + 2px)))`;
      if (!animate) requestAnimationFrame(() => pill.classList.remove('no-anim'));
    }
    place(value, false);
    track.select = (v) => place(v, true);
    return track;
  }

  function skeleton(rows) {
    const box = h('div', { class: 'skeleton', role: 'status', 'aria-label': '불러오는 중' });
    for (let i = 0; i < (rows || 3); i += 1) {
      box.append(h('div', { class: 'sk-row' }, h('span', { class: 'sk-dot' }), h('span', { class: 'sk-lines' },
        h('span', { class: 'sk-line', style: { width: `${[72, 58, 66, 50][i % 4]}%` } }),
        h('span', { class: 'sk-line short', style: { width: `${[38, 30, 44, 26][i % 4]}%` } }))));
    }
    return box;
  }

  const STATE_GLYPH = {
    partial: 'partial', preview: 'globe', unauthorized: 'lock', 'not-configured': 'info', conflict: 'alert', error: 'alert', invalid: 'alert', loading: 'refresh', empty: 'info',
  };

  // 봉투 안내. view = envelope.describeRead/describeWrite 결과 또는 { state, label, message, action }.
  function notice(view, onAction, opts) {
    const o = opts || {};
    const tone = view.state === 'error' || view.state === 'invalid' || view.kind === 'error' ? 'danger' : 'neutral';
    const box = h('div', {
      class: `notice notice--${view.state || view.kind || 'info'}${o.compact ? ' compact' : ''}`,
      role: tone === 'danger' ? 'alert' : 'status', dataset: { tone },
    });
    box.append(icon(o.glyph || STATE_GLYPH[view.state || view.kind] || 'info', 16, 'notice-glyph'));
    const body = h('div', { class: 'notice-body' });
    if (view.label) body.append(h('div', { class: 'notice-label', text: view.label }));
    if (view.message) body.append(h('div', { class: 'notice-text', text: view.message }));
    if (view.action && onAction) {
      // 짧은 안내(일부만 확인 등)는 줄을 늘리지 않게 글자 링크로, 막힌 상태는 버튼으로.
      body.append(o.compact
        ? h('div', { class: 'notice-link' }, h('button', { type: 'button', class: 'linkish', text: view.action.label, onclick: () => onAction(view.action) }))
        : h('div', { class: 'notice-actions' }, action(view.action.label, { className: 'small', onClick: () => onAction(view.action) })));
    }
    box.append(body);
    return box;
  }

  // ── 창 안 메뉴 ─────────────────────────────────────────────────────────
  // items: { label, hint, checked, disabled, danger, onSelect, submenu: () => items | Promise<items> } | { divider: true } | { heading }
  let openState = null;
  function layer() {
    let el = document.getElementById('menu-layer');
    if (!el) { el = h('div', { id: 'menu-layer' }); document.body.append(el); }
    return el;
  }
  function closeMenu() {
    if (!openState) return false;
    const { el, restore } = openState;
    openState = null;
    el.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    if (restore && restore.focus) restore.focus();
    return true;
  }
  function onOutside(e) {
    if (openState && !openState.el.contains(e.target)) closeMenu();
  }
  function renderItems(menu, items, stack) {
    clear(menu);
    if (stack.length) {
      menu.append(h('button', {
        type: 'button', class: 'menu-item back', role: 'menuitem',
        onclick: () => { const prev = stack.pop(); renderItems(menu, prev, stack); focusFirst(menu); },
      }, icon('chevronLeft', 13), h('span', { text: '뒤로' })));
      menu.append(h('div', { class: 'menu-divider', role: 'separator' }));
    }
    if (!items.length) menu.append(h('div', { class: 'menu-empty', text: '고를 항목이 없어요' }));
    for (const item of items) {
      if (item.divider) { menu.append(h('div', { class: 'menu-divider', role: 'separator' })); continue; }
      if (item.heading) { menu.append(h('div', { class: 'menu-heading', text: item.heading })); continue; }
      const btn = h('button', {
        type: 'button', class: `menu-item${item.danger ? ' danger' : ''}`, role: item.checked == null ? 'menuitem' : 'menuitemcheckbox',
        'aria-checked': item.checked == null ? null : String(!!item.checked), disabled: !!item.disabled, title: item.title,
      });
      btn.append(h('span', { class: 'menu-check', 'aria-hidden': 'true' }, item.checked ? icon('check', 13) : null));
      if (item.icon) btn.append(icon(item.icon, 14, 'menu-icon'));
      btn.append(h('span', { class: 'menu-label', text: item.label }));
      if (item.hint) btn.append(h('span', { class: 'menu-hint mono', text: item.hint }));
      if (item.submenu) btn.append(icon('chevronRight', 12, 'menu-sub'));
      btn.addEventListener('click', async () => {
        if (item.submenu) {
          const sub = await item.submenu();
          stack.push(items);
          renderItems(menu, sub || [], stack);
          focusFirst(menu);
          return;
        }
        closeMenu();
        if (item.onSelect) item.onSelect();
      });
      menu.append(btn);
    }
  }
  function focusFirst(menu) {
    const first = menu.querySelector('.menu-item:not([disabled])');
    if (first) first.focus();
  }
  function moveFocus(menu, dir) {
    const list = [...menu.querySelectorAll('.menu-item:not([disabled])')];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    list[(i + dir + list.length) % list.length].focus();
  }
  // anchor: 요소(아래·오른쪽 정렬) 또는 { x, y }(우클릭 위치).
  function openMenu(anchor, items, opts) {
    closeMenu();
    const o = opts || {};
    const menu = h('div', { class: 'menu', role: 'menu', 'aria-label': o.label || '메뉴' });
    menu.append(h('span', { class: 'mini-rim rim-50', 'aria-hidden': 'true' }));
    const inner = h('div', { class: 'menu-inner' });
    menu.append(inner);
    renderItems(inner, items, []);
    layer().append(menu);
    const vw = window.innerWidth; const vh = window.innerHeight;
    const r = menu.getBoundingClientRect();
    let x; let y;
    if (anchor instanceof Element) {
      const a = anchor.getBoundingClientRect();
      x = a.right - r.width; y = a.bottom + 4;
      if (y + r.height > vh - 8) y = Math.max(8, a.top - r.height - 4);
    } else { x = anchor.x; y = anchor.y; }
    x = Math.min(Math.max(8, x), vw - r.width - 8);
    y = Math.min(Math.max(8, y), vh - r.height - 8);
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
    menu.style.maxHeight = `${vh - 16}px`;
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(inner, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(inner, -1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
      else if (e.key === 'Tab') { e.preventDefault(); moveFocus(inner, e.shiftKey ? -1 : 1); }
    });
    openState = { el: menu, restore: anchor instanceof Element ? anchor : document.activeElement };
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
    focusFirst(inner);
    return menu;
  }
  const menuOpen = () => !!openState;

  // ── 접근성 설정: 투명도 줄이기·대비 높이기 → 불투명 테마, 동작 줄이기 → 전환 즉시 완료 ───────────
  const MQ = {
    contrast: window.matchMedia('(prefers-contrast: more)'),
    forced: window.matchMedia('(forced-colors: active)'),
    transparency: window.matchMedia('(prefers-reduced-transparency: reduce)'),
    motion: window.matchMedia('(prefers-reduced-motion: reduce)'),
  };
  let lastPrefs = {};
  function applyPrefs(prefs) {
    if (prefs) lastPrefs = prefs;
    const p = lastPrefs || {};
    const opaque = !!(p.reduceTransparency || p.highContrast || MQ.contrast.matches || MQ.forced.matches || MQ.transparency.matches);
    const root = document.documentElement;
    root.classList.toggle('opaque', opaque);
    root.classList.toggle('high-contrast', !!(p.highContrast || MQ.contrast.matches || MQ.forced.matches));
    root.classList.toggle('reduce-motion', !!(p.reduceMotion || MQ.motion.matches));
  }
  Object.values(MQ).forEach((m) => m.addEventListener('change', () => applyPrefs()));
  const isOpaque = () => document.documentElement.classList.contains('opaque');
  const reduceMotion = () => document.documentElement.classList.contains('reduce-motion');

  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  function assetUrl(file) { return `../assets/${file}`; }

  window.PetUI = Object.freeze({
    h, append, clear, icon, checkGlyph, action, quiet, segmented, skeleton, notice,
    openMenu, closeMenu, menuOpen, applyPrefs, isOpaque, reduceMotion, clock, assetUrl, MODE_ICON,
  });
})();

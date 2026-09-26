// 짧은 메시지 — 평소엔 두 줄 상태 + ‘빠른 기능 열기’ + ‘알림 N’, pet:notice 가 오면 그 알림(제목·내용·내용 보기·닫기).
// 셸은 이 페이지를 숨긴 채 살려 두고 알림을 보낼 때 창을 보여 준다. 닫기는 읽음 처리가 아니다.
'use strict';
(function () {
  const C = window.PetContract;
  const B = window.PetBridge;
  const U = window.PetUI;
  const N = window.PetModel.notices;
  const h = U.h;
  const body = document.getElementById('body');
  const face = document.getElementById('face');
  const badge = document.getElementById('badge');

  let state = { character: C.DEFAULT_CHARACTER, hubStatus: 'unknown', badge: 0 };
  let notice = null;

  function openQuick() { B.invoke('pet:set-presentation', { presentation: 'quick' }); }
  function openNotifications() {
    B.invoke('pet:set-mode', { mode: 'notifications' }).then(openQuick);
  }
  function dismiss() {
    notice = null;
    render();
    B.invoke('pet:collapse', { surface: 'bubble' });
  }
  function openNotice(n) {
    if (!n.read) B.invoke('pet:notices-read', { id: n.id });
    const t = N.resolveTarget(n);
    if (t.kind === 'hub') B.invoke('pet:open-hub', { path: t.path });
    else if (t.kind === 'external') B.invoke('pet:open-external', { url: t.url });
    else B.invoke('pet:set-mode', { mode: t.mode }).then(openQuick);
    notice = null;
    render();
  }

  function render() {
    const c = C.characterByKey(state.character);
    const src = `../assets/${c.portrait}`;
    if (!face.src.endsWith(src.slice(2))) face.src = src;
    const text = N.badgeText(state.badge);
    badge.hidden = !text;
    badge.textContent = text;
    badge.setAttribute('aria-label', text ? `알림 ${state.badge}개` : '');
    U.clear(body);
    if (notice) {
      const info = N.kindInfo(notice.kind);
      body.append(
        h('div', { class: 'n-head' }, h('span', { class: 't', text: notice.title }),
          U.quiet(null, { icon: 'x', iconSize: 13, ariaLabel: '말풍선 닫기', title: '알림은 목록에 남아 있어요', onClick: dismiss })),
        h('div', { class: 'n-kind', text: `${info.label} · ${N.relativeTime(notice.at)}` }),
        notice.body ? h('div', { class: 'n-text', text: notice.body }) : null,
        h('div', { class: 'links' }, h('button', { type: 'button', onclick: () => openNotice(notice) }, h('span', { text: '내용 보기' }), U.icon('arrowUpRight', 11))));
      return;
    }
    body.append(
      h('div', { class: 'eyebrow', text: 'Moonlight' }),
      h('div', { class: 'line', text: N.bubbleSummary(state) }),
      h('div', { class: 'links' },
        h('button', { type: 'button', text: '빠른 기능 열기', onclick: openQuick }),
        state.badge > 0 ? h('button', { type: 'button', text: `알림 ${N.badgeText(state.badge)}`, onclick: openNotifications }) : null));
  }

  function onState(s) {
    if (!s) return;
    state = { ...state, ...s };
    U.applyPrefs(s.prefs);
    render();
  }

  // 말풍선은 포커스를 가져오지 않는다 — 버튼이 눌려도 포커스를 잡지 않게.
  document.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  U.applyPrefs();
  render();
  B.invoke('pet:state').then(onState);
  B.on('pet:state-changed', onState);
  B.on('pet:badge', (p) => { state = { ...state, badge: Number(p && p.count) || 0 }; render(); });
  B.on('pet:hub-status', (p) => { if (p && p.status) { state = { ...state, hubStatus: p.status }; render(); } });
  B.on('pet:notice', (p) => { if (p && p.notice && p.notice.title) { notice = p.notice; render(); } });
  window.PetBubble = { get notice() { return notice; } };
  document.documentElement.dataset.ready = '1';
})();

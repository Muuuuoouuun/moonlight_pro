// 알림 — 문의·다가오는 일정·담당자 답변. 눌러서 목적지를 열고, 행마다 확인·숨기기, 전체 확인.
// ‘숨기기’는 이 PC 목록에만 적용되고 Hub 읽음 상태를 바꾸지 않는다. 연결 실패는 빈 알림함과 구별한다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});

  Modes.notifications = {
    create(ctx) {
      const { B, U, M } = ctx;
      const N = M.notices;
      const E = M.envelope;
      const h = U.h;
      // 기기 명사 — 문구는 ‘이 PC’ 로 쓰고 mac 에서는 ‘이 Mac’ 으로 바꿔 보인다.
      const L = (text) => M.platform.localize(text);

      let notices = [];
      let unread = 0;
      let view = null;
      let loading = false;
      let loaded = false;
      let alive = true;
      let seq = 0;

      const head = h('span', { class: 'grow num' });
      const refreshBtn = U.quiet(null, { icon: 'refresh', iconSize: 15, title: 'Hub에서 다시 확인', ariaLabel: '알림 새로고침', onClick: () => load() });
      const list = h('div', { class: 'notice-list', role: 'list' });
      const scroll = h('div', { class: 'scroll' }, list);
      const footStatus = h('span', { class: 'status' });
      const readAllBtn = U.action('모두 확인', { className: 'small', onClick: readAll });
      const el = h('section', { class: 'mode notifications', 'aria-label': '알림' },
        h('div', { class: 'meta-row' }, head, refreshBtn), scroll,
        h('div', { class: 'notif-footer' }, footStatus, readAllBtn));

      async function load() {
        const mySeq = ++seq;
        loading = true;
        render();
        const res = await B.invoke('pet:notices-list', {});
        if (!alive || mySeq !== seq) return;
        loading = false;
        view = E.describeRead(res, '알림');
        if (view.showData) {
          const list = N.listFrom(res);
          if (list) {
            notices = list.notices;
            unread = list.unreadCount;
            loaded = true;
          } else view = E.describeRead({ kind: 'invalid' }, '알림');
        }
        render();
      }

      function render() {
        const shown = N.visibleNotices(notices);
        head.textContent = N.headerLabel({ loading: loading && !loaded, failed: view && !view.showData, unreadCount: unread, total: shown.length });
        refreshBtn.disabled = loading;
        readAllBtn.disabled = !unread || !(view && view.showData);
        U.clear(list);
        if (loading && !loaded) { list.append(U.skeleton(3)); }
        else {
          if (view && view.state !== 'live') list.append(U.notice(view, (a) => ctx.handleAction(a, load), { compact: view.state === 'partial' }));
          if (loaded && !shown.length && view && view.showData) {
            list.append(U.notice({ state: 'empty', message: L('이 PC에 표시할 알림이 없어요.') }, null, { glyph: 'bell' }));
          }
          const now = new Date();
          for (const n of shown) list.append(row(n, now));
        }
        footStatus.textContent = view && !view.showData && loaded ? `${view.label} · 이전 목록` : '문의 · 다가오는 일정 · 답변';
      }

      function row(n, now) {
        const info = N.kindInfo(n.kind);
        const open = h('button', { type: 'button', class: 'n-open', 'aria-label': `${n.title}${n.body ? `, ${n.body}` : ''}, 내용 보기` },
          U.icon(info.glyph, 15),
          h('span', { class: 'n-body' },
            h('span', { class: 'n-title', text: n.title }),
            n.body ? h('span', { class: 'n-text', text: n.body }) : null,
            h('span', { class: 'n-meta' }, !n.read ? h('span', { class: 'unread', text: '새 알림' }) : null,
              h('span', { text: info.label }), h('span', { text: N.relativeTime(n.at, now) }))));
        open.addEventListener('click', () => openNotice(n));
        const more = U.quiet(null, { icon: 'dots', iconSize: 15, ariaLabel: `${n.title} 알림 메뉴`, title: L('숨기기는 이 PC의 목록에만 적용돼요'), menu: true });
        more.addEventListener('click', () => U.openMenu(more, [
          { label: '내용 보기', onSelect: () => openNotice(n) },
          { label: '확인함', disabled: !!n.read, onSelect: () => mark(n, 'pet:notices-read') },
          { label: L('이 PC에서 숨기기'), onSelect: () => mark(n, 'pet:notices-hide') },
        ], { label: `${n.title} 알림 메뉴` }));
        return h('div', { class: `n-row${n.read ? ' read' : ''}`, role: 'listitem' }, open, more);
      }

      // 확인·숨기기의 응답은 허브 모델이 센 새 목록이다 — 그대로 쓴다('이 PC에서 숨기기'는 읽음이 아니다).
      async function mark(n, channel) {
        const res = await B.invoke(channel, { id: n.id });
        if (!alive) return;
        const w = E.describeWrite(res, '알림');
        const list = w.ok ? N.listFrom(res) : null;
        if (list) {
          notices = list.notices;
          unread = list.unreadCount;
          render();
        } else if (w.ok) {
          load();
        } else {
          view = { state: w.kind, showData: true, label: w.label, message: w.message, action: w.action };
          render();
        }
      }

      async function openNotice(n) {
        if (!n.read) mark(n, 'pet:notices-read');
        const t = N.resolveTarget(n);
        if (t.kind === 'hub') ctx.openHub(t.path);
        else if (t.kind === 'external') B.invoke('pet:open-external', { url: t.url });
        else if (t.kind === 'mode') {
          if (t.mode === 'calendar' && t.date && window.PetModes.calendar.selectDate) window.PetModes.calendar.selectDate(t.date);
          if (t.mode === 'council' && t.ownerId && window.PetModes.council.selectSession) window.PetModes.council.selectSession({ ownerId: t.ownerId, scope: t.scope || 'all' });
          ctx.setMode(t.mode);
        }
      }

      async function readAll() {
        const res = await B.invoke('pet:notices-read-all', {});
        if (!alive) return;
        const w = E.describeWrite(res, '알림');
        const list = w.ok ? N.listFrom(res) : null;
        if (list) { notices = list.notices; unread = list.unreadCount; render(); }
        else if (w.ok) load();
        else { view = { state: w.kind, showData: true, label: w.label, message: w.message, action: w.action }; render(); }
      }

      load();

      return {
        el,
        focus() { refreshBtn.focus(); },
        primary() { ctx.openHub(ctx.C.HUB_PATHS.notifications); },
        menuItems() {
          return [
            { label: L('이 PC의 알림 모두 확인'), disabled: !unread, onSelect: readAll },
            { label: '다시 불러오기', icon: 'refresh', onSelect: load },
            { label: 'Hub에서 문의 열기', icon: 'arrowUpRight', onSelect: () => ctx.openHub(ctx.C.HUB_PATHS.notifications) },
          ];
        },
        onNotice() { load(); },
        onBadge() { load(); },
        onHubStatus(s, before) { if (s === 'connected' && before !== 'connected') load(); },
        destroy() { alive = false; },
      };
    },
  };
})();

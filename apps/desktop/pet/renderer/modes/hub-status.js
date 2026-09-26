// Hub 연결 상태 — 로그인 폼이 없다. 펫은 메인 창의 세션을 함께 쓰므로 로그인은 메인 창에서 한다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});

  Modes['hub-status'] = {
    create(ctx) {
      const { B, U, M } = ctx;
      const P = M.panel;
      const h = U.h;
      let checking = false;
      let checkView = null;
      let alive = true;
      const el = h('section', { class: 'mode hub-status', 'aria-label': 'Hub 연결 상태' });

      function render() {
        const s = ctx.state;
        const v = P.hubStatusView(s.hubStatus);
        U.clear(el);
        el.append(h('div', { class: 'state-line', role: 'status' }, U.icon(v.glyph, 16), h('span', { text: v.label })));
        el.append(h('div', { class: 'detail', text: v.detail }));
        el.append(h('div', { class: 'url' }, h('span', { class: 'k', text: 'Hub 주소' }),
          h('span', { class: `v${s.hubUrl ? ' mono' : ''}`, text: s.hubUrl || '아직 없어요' })));
        el.append(h('div', { class: 'explain', text: '비밀번호는 펫에 입력하지 않아요. 메인 창에서 로그인하면 같은 세션으로 할 일·메모·일정을 불러와요.' }));
        if (checkView) el.append(h('div', { class: 'check-result' }, U.notice(checkView, (a) => ctx.handleAction(a, check), { compact: true, glyph: checkView.state === 'live' ? 'check' : undefined })));
        el.append(h('div', { class: 'spacer', style: { flex: '1' } }));
        const btns = h('div', { class: 'btns' });
        btns.append(U.action(checking ? '확인 중…' : '연결 다시 확인', { className: 'small', icon: 'refresh', iconFirst: true, iconSize: 13, disabled: checking, onClick: check }));
        if (s.hubStatus === 'unauthorized' || (checkView && checkView.state === 'unauthorized')) {
          btns.append(U.action('메인 창에서 로그인', { className: 'small', icon: 'arrowUpRight', iconSize: 12, onClick: () => ctx.openHub('/login') }));
        } else {
          btns.append(U.action('메인 창 열기', { className: 'small', icon: 'arrowUpRight', iconSize: 12, onClick: () => ctx.openHub('/dashboard') }));
        }
        el.append(btns);
      }

      async function check() {
        checking = true;
        render();
        const res = await B.invoke('pet:hub-session', {});
        if (!alive) return;
        checking = false;
        const data = (res && res.data) || {};
        if (res && res.kind === 'live' && data.status === 'authenticated') {
          checkView = { state: 'live', label: '연결됨', message: '메인 창의 로그인 세션으로 Hub에 닿았어요.' };
        } else if (res && res.kind === 'live' && data.status === 'anonymous') {
          checkView = M.envelope.describeRead({ kind: 'unauthorized' });
        } else {
          checkView = M.envelope.describeRead(res, 'Hub 연결');
        }
        render();
      }

      render();
      return {
        el,
        focus() { const b = el.querySelector('.action'); if (b) b.focus(); },
        primary() { check(); },
        onState() { render(); },
        onHubStatus() { render(); },
        destroy() { alive = false; },
      };
    },
  };
})();

// Office — 실행 카드. Office 보드와 상세 업무는 메인 창(Hub)에서 이어진다. 펫 안에서 일을 만들지 않는다.
// 로그인 필요·주소 없음이면 같은 자리의 버튼이 그 해결 동작으로 바뀐다(카드 높이를 늘리지 않는다).
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});

  Modes.office = {
    create(ctx) {
      const { C, U } = ctx;
      const h = U.h;
      const who = h('div', { class: 'who' });
      const statusBox = h('div', {});
      const bottom = h('div', { class: 'bottom' });
      const el = h('section', { class: 'mode office', 'aria-label': 'Office' },
        h('p', { class: 'lead', text: '함께 진행할 작업을 열어요.' }),
        h('p', { class: 'sub', text: '메인 창의 Office 보드에서 이어져요. 펫은 여는 길만 맡아요.' }),
        who, statusBox, h('div', { class: 'spacer' }), bottom);

      function render(state) {
        const c = C.characterByKey(state.character);
        U.clear(statusBox);
        U.clear(bottom);
        const blocked = state.hubStatus === 'unauthorized' ? { label: '로그인 필요', message: '메인 창에서 로그인하면 Office 보드가 열려요.', button: '메인 창에서 로그인', path: '/login', glyph: 'lock' }
          : state.hubStatus === 'not-configured' && state.hubUrl ? { label: 'Hub 로그인 미설정', message: 'Hub 서버에 운영자 로그인 설정이 아직 없어요.', button: '메인 창 열기', path: '/dashboard', glyph: 'info' }
          : state.hubStatus === 'not-configured' ? { label: 'Hub 주소 필요', message: '메인 창에서 Hub 주소를 먼저 정해 주세요.', button: '메인 창 열기', path: '/dashboard', glyph: 'info' }
            : null;
        who.hidden = !!blocked;
        if (!blocked) {
          U.clear(who).append(h('img', { src: U.assetUrl(c.portrait), alt: '' }), h('span', { text: `지금 펫 · ${c.name} ${c.role}` }));
          bottom.append(U.action('Office 열기', { icon: 'arrowUpRight', iconSize: 12, onClick: () => ctx.openHub(C.HUB_PATHS.office) }));
        } else {
          statusBox.append(U.notice({ state: state.hubStatus, label: blocked.label, message: blocked.message }, null, { compact: true, glyph: blocked.glyph }));
          bottom.append(U.action(blocked.button, { icon: 'arrowUpRight', iconSize: 12, onClick: () => ctx.openHub(blocked.path) }));
        }
      }
      render(ctx.state);

      return {
        el,
        focus() { const b = bottom.querySelector('.action'); if (b) b.focus(); },
        primary() { ctx.openHub(C.HUB_PATHS.office); },
        onState(state) { render(state); },
        onHubStatus() { render(ctx.state); },
      };
    },
  };
})();

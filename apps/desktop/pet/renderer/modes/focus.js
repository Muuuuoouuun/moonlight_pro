// 집중(패널) — 시간 고르기(15·25·50 + 1~120 조절)와 시작. 진행 중이면 남은 시간·진행선·중지(확인)를 보여 준다.
// 실제 집중 화면(모니터마다 불투명 전체 창)은 메인이 focus.html 로 띄운다. 앱 전환 차단은 하지 않는다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});

  Modes.focus = {
    create(ctx) {
      const { B, U, M } = ctx;
      const F = M.focus;
      const h = U.h;

      let minutes = F.clampMinutes((ctx.state.focus && ctx.state.focus.minutes) || F.DEFAULT);
      let focus = { ...(ctx.state.focus || {}) };
      let confirming = false;
      let starting = false;
      let error = null;
      const el = h('section', { class: 'mode focus-setup', 'aria-label': '집중' });

      function render() {
        U.clear(el);
        if (focus.running) return renderRunning();
        const presets = h('div', { class: 'presets' });
        for (const m of F.PRESETS) {
          presets.append(U.action(`${m}분`, { className: 'small', pressed: minutes === m, onClick: () => { minutes = m; render(); } }));
        }
        presets.append(h('span', { class: 'grow' }));
        const val = h('span', { class: 'val mono', text: `${minutes}분`, 'aria-live': 'polite' });
        presets.append(h('div', { class: 'stepper', role: 'group', 'aria-label': `집중 시간 ${minutes}분` },
          U.action(null, { compact: true, icon: 'minus', iconSize: 13, ariaLabel: '1분 줄이기', disabled: minutes <= F.MIN, onClick: () => step(-1) }),
          val,
          U.action(null, { compact: true, icon: 'plus', iconSize: 13, ariaLabel: '1분 늘리기', disabled: minutes >= F.MAX, onClick: () => step(1) })));
        el.append(h('p', { class: 'lead', text: '잠깐, 한 가지에만 집중해요.' }), presets, h('div', { class: 'spacer' }));
        if (error) el.append(U.notice({ state: 'error', label: '시작하지 못했어요', message: error }, null, { compact: true }));
        el.append(U.action(starting ? '시작하는 중…' : F.startLabel(minutes), { wide: true, icon: 'timer', iconFirst: true, iconSize: 14, disabled: starting, onClick: start }));
        el.append(h('div', { class: 'focus-note', text: '중지 버튼 · Esc 1.3초 길게 눌러 해제' }));
      }

      function renderRunning() {
        const run = h('div', { class: 'focus-run' },
          h('div', { class: 'timer', text: F.formatRemaining(focus.remainingSec), 'aria-label': `남은 시간 ${F.formatRemaining(focus.remainingSec)}` }),
          h('div', { class: 'progress', role: 'progressbar', 'aria-label': '집중 진행', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(F.progress(focus.remainingSec, focus.minutes) * 100)) },
            h('i', { style: { width: `${F.progress(focus.remainingSec, focus.minutes) * 100}%` } })));
        if (confirming) {
          run.append(h('div', { class: 'confirm' }, h('div', { class: 'q', text: '집중을 중지할까요?' }),
            h('div', { class: 'btns' }, U.action('계속 집중', { onClick: () => { confirming = false; render(); } }), U.action('중지', { onClick: stop }))));
        } else {
          run.append(U.action('중지', { icon: 'stop', iconFirst: true, iconSize: 13, onClick: () => { confirming = true; render(); } }));
        }
        el.append(run);
      }

      function step(d) { minutes = F.clampMinutes(minutes + d); render(); }

      async function start() {
        if (starting) return;
        starting = true;
        error = null;
        render();
        const res = await B.invoke('pet:focus-start', { minutes });
        starting = false;
        if (res && res.ok === false) error = res.error || '집중 화면을 열지 못했어요.';
        render();
      }
      function stop() { confirming = false; B.invoke('pet:focus-stop', {}); }

      render();
      B.invoke('pet:focus-state', {}).then((s) => { if (s && typeof s === 'object' && 'running' in s) { focus = { ...focus, ...s }; render(); } });

      return {
        el,
        focus() { const b = el.querySelector('.action.wide, .focus-run .action'); if (b) b.focus(); },
        primary() { if (!focus.running) start(); },
        onState(state) {
          const next = state.focus || {};
          if (!!next.running !== !!focus.running) confirming = false;
          focus = { ...focus, ...next };
          render();
        },
        onFocusTick(p) {
          if (!p || typeof p.remainingSec !== 'number') return;
          focus = { ...focus, running: true, remainingSec: p.remainingSec };
          const t = el.querySelector('.timer');
          const bar = el.querySelector('.progress > i');
          if (t && bar) {
            t.textContent = F.formatRemaining(p.remainingSec);
            bar.style.width = `${F.progress(p.remainingSec, focus.minutes) * 100}%`;
          } else render();
        },
      };
    },
  };
})();

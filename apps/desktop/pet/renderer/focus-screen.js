// 집중 화면(모니터마다 한 창). 주 모니터 창만 타이머·중지를 그리고, 나머지는 ?controls=0 으로 한 줄만.
// 중지는 확인을 거친다. Esc 를 1.3초 누르고 있으면 중지 확인이 열린다 — 길이는 메인이 재고(state.focus.confirmStop·
// confirmRevision), 이 페이지는 누르는 동안 진행선만 그린다. 확인이 떠 있을 때 Esc 는 확인을 닫는다('계속 집중'과 같다).
// 앱 전환 차단은 하지 않는다(운영자 결정 2026-09-26).
'use strict';
(function () {
  const C = window.PetContract;
  const B = window.PetBridge;
  const F = window.PetModel.focus;
  const $ = (id) => document.getElementById(id);
  const controlsOn = new URLSearchParams(location.search).get('controls') !== '0';

  let focus = { running: false, remainingSec: 0, minutes: F.DEFAULT };
  let confirming = false;
  let seenRevision = 0;
  let seenDismiss = 0;
  let escLatched = false; // 이번 Esc 누름으로 확인을 닫았다 — 뗄 때까지 진행선을 다시 그리지 않는다

  if (!controlsOn) {
    $('stack').hidden = true;
    $('minimal').hidden = false;
  }

  function button(label, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn${cls ? ` ${cls}` : ''}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderControls() {
    const box = $('controls');
    box.textContent = '';
    if (confirming) {
      const q = document.createElement('div');
      q.className = 'q';
      q.textContent = '집중을 중지할까요?';
      const row = document.createElement('div');
      row.className = 'row';
      const keep = button('계속 집중', '', keepFocus);
      row.append(keep, button('중지', '', stop));
      box.append(q, row);
      box.classList.add('fade');
      keep.focus();
    } else {
      const s = button('중지', 'stop', () => { confirming = true; renderControls(); });
      box.append(s);
    }
  }

  function renderTime() {
    $('timer').textContent = F.formatRemaining(focus.remainingSec);
    $('timer').setAttribute('aria-label', `남은 시간 ${F.formatRemaining(focus.remainingSec)}`);
    const p = F.progress(focus.remainingSec, focus.minutes);
    $('bar').style.width = `${p * 100}%`;
    $('progress').setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  function stop() {
    confirming = false;
    renderControls();
    B.invoke('pet:focus-stop', {});
  }

  // 확인 닫기 — 메인의 confirmStop 도 거둔다(다음 상태 방송에 다시 뜨지 않게).
  function keepFocus() {
    confirming = false;
    renderControls();
    B.invoke('pet:focus-state', { dismissConfirm: true });
  }

  function applyFocus(next) {
    const wasConfirming = confirming;
    focus = { ...focus, ...next };
    const view = F.confirmAfterState({ confirming, seenRevision, seenDismiss }, focus);
    confirming = view.confirming;
    seenRevision = view.seenRevision;
    seenDismiss = view.seenDismiss;
    renderTime();
    // 메인이 확인을 거뒀다(확인 중 Esc — 그 keydown 이 이 페이지에 닿기 전일 수 있다): 그 누름으로 진행선을 새로 그리지 않는다.
    if (wasConfirming && !confirming && focus.running) escLatched = true;
    if (confirming !== wasConfirming) { stopHold(); renderControls(); }
  }

  function onState(s) {
    if (!s) return;
    const prefersReduced = !!(s.prefs && s.prefs.reduceMotion);
    document.documentElement.classList.toggle('reduce-motion', prefersReduced);
    const c = C.characterByKey(s.character);
    $('perched').src = `../assets/${c.cutout}`;
    if (s.focus) applyFocus(s.focus);
  }

  // Esc: 확인이 떠 있으면 닫고, 아니면 누르는 동안 1.3초 진행선(확인을 여는 것은 메인의 판정).
  // 확인을 닫은 누름은 뗄 때까지 잠긴다 — 메인도 같은 누름을 keyUp 까지 재지 않는다(pet-input createEscHold).
  function stopHold() { $('hold').classList.remove('run'); }
  function releaseEsc() { stopHold(); escLatched = false; }
  document.addEventListener('keydown', (e) => {
    if (!controlsOn || e.key !== 'Escape') return;
    e.preventDefault();
    const action = F.escDownAction({ repeat: e.repeat, composing: e.isComposing, confirming, latched: escLatched });
    if (action === 'dismiss') { escLatched = true; keepFocus(); return; }
    if (action !== 'hold') return;
    const hold = $('hold');
    hold.classList.remove('run');
    void hold.offsetWidth;
    hold.classList.add('run');
  });
  document.addEventListener('keyup', (e) => { if (e.key === 'Escape') releaseEsc(); });
  window.addEventListener('blur', releaseEsc);
  window.addEventListener('focus', releaseEsc); // 다른 모니터 창의 Esc 로 닫혔으면 이 창의 다음 누름은 새로

  renderControls();
  renderTime();
  B.invoke('pet:state').then((st) => onState(st || { character: C.DEFAULT_CHARACTER }));
  B.invoke('pet:focus-state', {}).then((res) => { const f = F.focusFrom(res); if (f) applyFocus(f); });
  B.on('pet:state-changed', onState);
  B.on('pet:focus-tick', (p) => { if (p && typeof p.remainingSec === 'number' && focus.running !== false) { focus.remainingSec = p.remainingSec; renderTime(); } });
  window.PetFocusScreen = { get confirming() { return confirming; } };
  document.documentElement.dataset.ready = '1';
})();

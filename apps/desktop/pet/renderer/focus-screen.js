// 집중 화면(모니터마다 한 창). 주 모니터 창만 타이머·중지를 그리고, 나머지는 ?controls=0 으로 한 줄만.
// 중지는 확인을 거친다. Esc 를 1.3초 누르고 있으면 중지 확인이 열린다. 앱 전환 차단은 하지 않는다(운영자 결정 2026-09-26).
'use strict';
(function () {
  const C = window.PetContract;
  const B = window.PetBridge;
  const F = window.PetModel.focus;
  const $ = (id) => document.getElementById(id);
  const controlsOn = new URLSearchParams(location.search).get('controls') !== '0';

  let focus = { running: false, remainingSec: 0, minutes: F.DEFAULT };
  let confirming = false;
  let holdTimer = 0;

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
      const keep = button('계속 집중', '', () => { confirming = false; renderControls(); });
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

  function onState(s) {
    if (!s) return;
    const prefersReduced = !!(s.prefs && s.prefs.reduceMotion);
    document.documentElement.classList.toggle('reduce-motion', prefersReduced);
    const c = C.characterByKey(s.character);
    $('perched').src = `../assets/${c.cutout}`;
    if (s.focus) { focus = { ...focus, ...s.focus }; renderTime(); }
  }

  // Esc 1.3초 길게 누르기 → 중지 확인.
  document.addEventListener('keydown', (e) => {
    if (!controlsOn) return;
    if (e.key !== 'Escape' || e.repeat) { if (e.key === 'Escape') e.preventDefault(); return; }
    e.preventDefault();
    if (confirming) { confirming = false; renderControls(); return; }
    const hold = $('hold');
    hold.classList.remove('run');
    void hold.offsetWidth;
    hold.classList.add('run');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { confirming = true; renderControls(); hold.classList.remove('run'); }, F.HOLD_MS);
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Escape') return;
    clearTimeout(holdTimer);
    $('hold').classList.remove('run');
  });
  window.addEventListener('blur', () => { clearTimeout(holdTimer); $('hold').classList.remove('run'); });

  renderControls();
  renderTime();
  onState({ character: C.DEFAULT_CHARACTER });
  B.invoke('pet:state').then(onState);
  B.invoke('pet:focus-state', {}).then((s) => { if (s && typeof s === 'object' && 'remainingSec' in s) { focus = { ...focus, ...s }; renderTime(); } });
  B.on('pet:state-changed', onState);
  B.on('pet:focus-tick', (p) => { if (p && typeof p.remainingSec === 'number') { focus.remainingSec = p.remainingSec; renderTime(); } });
  window.PetFocusScreen = { get confirming() { return confirming; } };
  document.documentElement.dataset.ready = '1';
})();

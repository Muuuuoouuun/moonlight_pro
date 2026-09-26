// 유리 위에 걸친 캐릭터(72px 투명 창). 누름·끌기는 패널과 같이 알리고(source 'panel' — 캐릭터 색·패널 이동),
// 움직이지 않고 떼면 Mac 과 같이 펫으로 접는다.
'use strict';
(function () {
  const C = window.PetContract;
  const B = window.PetBridge;
  const perch = document.getElementById('perch');
  const img = document.getElementById('cutout');

  function onState(s) {
    if (!s) return;
    window.PetDrag.applyMotionPref(s.prefs);
    const c = C.characterByKey(s.character);
    const src = `../assets/${c.cutout}`;
    if (!img.src.endsWith(src.slice(2))) img.src = src;
    perch.setAttribute('aria-label', `${c.name} · 펫으로 접기`);
  }

  window.PetDrag.wirePressDrag(perch, { source: 'panel', onTap: () => B.invoke('pet:collapse', {}) });
  perch.addEventListener('contextmenu', (e) => { e.preventDefault(); B.invoke('pet:context-menu', {}); });
  window.PetDrag.applyMotionPref(null);
  onState({ character: C.DEFAULT_CHARACTER });
  B.invoke('pet:state').then(onState);
  B.on('pet:state-changed', onState);
  document.documentElement.dataset.ready = '1';
})();

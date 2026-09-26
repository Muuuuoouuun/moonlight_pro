// 대기 펫 — 얼굴·배지만 그리고, 누름/끌기/우클릭을 다리로 알린다. 클릭 판단은 메인 몫이라 onTap 을 두지 않는다.
'use strict';
(function () {
  const C = window.PetContract;
  const B = window.PetBridge;
  const N = window.PetModel.notices;
  const pet = document.getElementById('pet');
  const img = document.getElementById('portrait');
  const badge = document.getElementById('badge');
  let character = null;
  let count = 0;

  function setCharacter(key) {
    const c = C.characterByKey(key);
    if (character === c.key) return;
    const first = character === null;
    character = c.key;
    const apply = () => {
      img.src = `../assets/${c.portrait}`;
      img.classList.remove('swap');
      label();
    };
    if (first) apply();
    else { img.classList.add('swap'); setTimeout(apply, 120); }
  }

  function setBadge(n) {
    count = Math.max(0, Math.floor(Number(n) || 0));
    const text = N.badgeText(count);
    badge.hidden = !text;
    badge.textContent = text;
    label();
  }

  function label() {
    const c = C.characterByKey(character);
    pet.setAttribute('aria-label', `Moonlight ${c.name} 펫 · 누르면 빠른 기능, 두 번 누르면 위젯, 우클릭하면 캐릭터 선택${count ? ` · 알림 ${count}개` : ''}`);
    pet.title = `${c.name} · ${c.role}`;
  }

  function onState(s) {
    if (!s) return;
    window.PetDrag.applyMotionPref(s.prefs);
    setCharacter(s.character);
    setBadge(s.badge);
  }

  window.PetDrag.wirePressDrag(pet, { source: 'pet' });
  pet.addEventListener('contextmenu', (e) => { e.preventDefault(); B.invoke('pet:context-menu', {}); });
  pet.addEventListener('dragstart', (e) => e.preventDefault());

  window.PetDrag.applyMotionPref(null);
  setCharacter(C.DEFAULT_CHARACTER);
  B.invoke('pet:state').then(onState);
  B.on('pet:state-changed', onState);
  B.on('pet:badge', (p) => setBadge(p && p.count));
  document.documentElement.dataset.ready = '1';
})();

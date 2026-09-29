// 펫·걸친 캐릭터 공용 — 누름과 끌기를 다리로 알리기만 한다(펫은 가로·세로, 패널 손잡이·걸친 캐릭터는 세로만).
// 한 번/두 번 누름 판단(빠른 기능 vs 위젯)과 3px 끌기 문턱·화면 맞춤은 메인이 한다. 여기서는 클릭을 지연시키지 않는다.
// 표시용 끌기 상태(scale .97)만 같은 3px 문턱으로 로컬에서 켠다.
'use strict';
(function () {
  const B = window.PetBridge;
  const THRESHOLD = 3;

  // opts: { source: 'pet'|'panel', onTap?: () => void }
  function wirePressDrag(el, opts) {
    const o = opts || {};
    const free = (o.source || 'pet') === 'pet'; // 펫만 가로로도 끈다 — 놓으면 메인이 가까운 가장자리·모니터로 붙인다
    let down = null; // { id, startX, startY, lastX, lastY, moved }
    const at = (x, y) => (free ? { screenX: x, screenY: y } : { screenY: y });
    let frame = 0;

    const flush = () => { frame = 0; if (down) B.invoke('pet:drag', { phase: 'move', ...at(down.lastX, down.lastY) }); };

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || down) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* 캡처 실패해도 누름은 알린다 */ }
      down = { id: e.pointerId, startX: e.screenX, startY: e.screenY, lastX: e.screenX, lastY: e.screenY, moved: false };
      el.classList.add('pressed');
      B.invoke('pet:press', { pressed: true, source: o.source || 'pet' });
      B.invoke('pet:drag', { phase: 'begin', ...at(e.screenX, e.screenY) });
    });
    el.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      down.lastX = e.screenX;
      down.lastY = e.screenY;
      const dist = free ? Math.max(Math.abs(e.screenX - down.startX), Math.abs(e.screenY - down.startY)) : Math.abs(e.screenY - down.startY);
      if (!down.moved && dist > THRESHOLD) {
        down.moved = true;
        el.classList.remove('pressed');
        el.classList.add('dragging');
      }
      if (!frame) frame = requestAnimationFrame(flush);
    });
    const finish = (e, cancelled) => {
      if (!down || (e && e.pointerId !== undefined && e.pointerId !== down.id)) return;
      const d = down;
      down = null;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      el.classList.remove('pressed', 'dragging');
      // 포인터를 잃었으면(pointercancel·lostpointercapture·창 blur) 'cancel' — 메인이 클릭으로 치지 않는다.
      if (cancelled) B.invoke('pet:drag', { phase: 'cancel' });
      else {
        const has = e && typeof e.screenY === 'number';
        B.invoke('pet:drag', { phase: 'end', ...at(has ? e.screenX : d.lastX, has ? e.screenY : d.lastY) });
      }
      B.invoke('pet:press', { pressed: false, source: o.source || 'pet' });
      if (!cancelled && !d.moved && o.onTap) o.onTap();
    };
    el.addEventListener('pointerup', (e) => finish(e, false));
    el.addEventListener('pointercancel', (e) => finish(e, true));
    el.addEventListener('lostpointercapture', (e) => finish(e, true));
    window.addEventListener('blur', () => finish(null, true));

    // 키보드: Enter/Space 는 눌렀다 떼기와 같다(메인이 한 번 누름으로 읽는다).
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        B.invoke('pet:press', { pressed: true, source: o.source || 'pet' })
          .then(() => B.invoke('pet:press', { pressed: false, source: o.source || 'pet' }));
        if (o.onTap) o.onTap();
      } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        B.invoke('pet:context-menu', {});
      }
    });
  }

  function applyMotionPref(prefs) {
    const reduce = !!(prefs && prefs.reduceMotion) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.toggle('reduce-motion', reduce);
  }

  window.PetDrag = Object.freeze({ wirePressDrag, applyMotionPref, THRESHOLD });
})();

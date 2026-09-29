"use client";

import React from 'react';
import { Button } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { PROJECT_INDEX_SORT_OPTIONS, normalizeProjectIndexPreferences, sortProjectIndex, moveProjectIndex } from '@/lib/project-index-order';
import styles from './project-index-controls.module.css';

// These are local view preferences, like the existing brand/folder order. Never PATCH
// project records to change their visual order or rewrite dates to simulate rank.
export function useProjectIndexControls(projects, storageKey, allProjects = projects) {
  const [stored, setStored] = React.useState({ key: null, value: normalizeProjectIndexPreferences(null) });
  const [notice, setNotice] = React.useState('');
  const [menu, setMenu] = React.useState(null);
  const [drag, setDrag] = React.useState(null);
  const gesture = React.useRef(null);
  const suppressClick = React.useRef(null);
  const listRef = React.useRef(null);
  const flip = React.useRef(null);
  const preferences = stored.key === storageKey ? stored.value : normalizeProjectIndexPreferences(null);
  const ordered = React.useMemo(() => sortProjectIndex(projects, preferences), [projects, preferences]);
  const latest = React.useRef(null);
  latest.current = { ordered, preferences, storageKey, allProjects };

  React.useEffect(() => {
    let value = normalizeProjectIndexPreferences(null);
    try { value = normalizeProjectIndexPreferences(JSON.parse(localStorage.getItem(storageKey))); }
    catch { setNotice('목록 설정을 읽지 못했습니다. 직접 정렬로 표시합니다.'); }
    setStored({ key: storageKey, value });
    setMenu(null);
  }, [storageKey]);

  function save(value, message) {
    setStored({ key: storageKey, value });
    try { localStorage.setItem(storageKey, JSON.stringify(value)); setNotice(message); }
    catch { setNotice('순서는 이 화면에만 적용됐습니다. 브라우저 설정을 저장하지 못했습니다.'); }
  }
  function move(sourceId, targetId, placement) {
    const current = latest.current;
    const ids = current.ordered.map(item => item.id);
    if (!ids.includes(sourceId) || !ids.includes(targetId) || sourceId === targetId) return false;
    const base = normalizeProjectIndexPreferences({ order: [...current.preferences.order, ...current.allProjects.map(item => item.id)] }).order;
    const order = moveProjectIndex(base, ids, sourceId, targetId, placement);
    snapshot();
    save({ sort: 'manual', order }, '순서 저장됨 · 이 브라우저');
    return true;
  }
  function openMenu(event, kind, project) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const context = event.type === 'contextmenu' && (event.clientX || event.clientY);
    if (!context && menu?.kind === kind && menu.returnFocus === event.currentTarget) { closeMenu(); return; }
    const alignEnd = !context && kind !== 'project';
    setMenu({ kind, project, alignEnd, x: context ? event.clientX : alignEnd ? rect.right : rect.left, y: context ? event.clientY : rect.bottom,
      returnFocus: event.currentTarget.matches('button') ? event.currentTarget : event.currentTarget.querySelector('button') });
  }
  function closeMenu(restore = true) {
    const element = menu?.returnFocus;
    setMenu(null);
    if (restore && element?.isConnected) element.focus({ preventScroll: true });
  }
  // Sortable preview: the lifted row follows the pointer and the rows it passes slide aside,
  // so the drop slot is visible before release. All of this is direct style on the row
  // wrappers (they carry no React style prop), never re-rendering the list per frame.
  function rowElements() {
    const list = listRef.current;
    return list ? [...list.querySelectorAll(':scope > [data-project-index-id]')] : [];
  }
  function activate(state) {
    const list = listRef.current;
    if (!list) return;
    const listTop = list.getBoundingClientRect().top - list.scrollTop;
    state.rows = rowElements().map(el => {
      const rect = el.getBoundingClientRect();
      return { id: el.dataset.projectIndexId, el, top: rect.top - listTop, height: rect.height };
    });
    state.from = state.rows.findIndex(row => row.id === state.id);
    if (state.from < 0) return;
    state.startScroll = list.scrollTop;
    state.active = true;
    setDrag({ id: state.id });
  }
  function layout() {
    const state = gesture.current;
    const list = listRef.current;
    if (!state?.active || !list || state.from < 0) return;
    const dragged = state.rows[state.from];
    const dy = state.y - state.startY + (list.scrollTop - state.startScroll);
    dragged.el.style.transform = `translate3d(0, ${dy}px, 0)`;
    const center = dragged.top + dragged.height / 2 + dy;
    const others = state.rows.filter((_, index) => index !== state.from);
    const slot = others.filter(row => row.top + row.height / 2 < center).length;
    state.rows.forEach((row, index) => {
      if (index === state.from) return;
      const shift = index > state.from && index <= slot ? -dragged.height : index < state.from && index >= slot ? dragged.height : 0;
      row.el.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
    });
    state.target = slot === state.from ? null
      : slot < others.length ? { id: others[slot].id, placement: 'before' } : { id: others[others.length - 1].id, placement: 'after' };
  }
  function snapshot() {
    if (flip.current) return;
    flip.current = new Map(rowElements().map(el => [el.dataset.projectIndexId, el.getBoundingClientRect().top]));
  }
  function playFlip() {
    const before = flip.current;
    flip.current = null;
    if (!before) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const moved = [];
    for (const el of rowElements()) {
      el.style.transition = 'none';
      el.style.transform = '';
      const top = before.get(el.dataset.projectIndexId);
      const delta = top === undefined ? 0 : top - el.getBoundingClientRect().top;
      el.style.transform = delta && !reduce ? `translate3d(0, ${delta}px, 0)` : '';
      if (delta && !reduce) moved.push(el);
    }
    if (!moved.length) { rowElements().forEach(el => { el.style.transition = ''; }); return; }
    // Reading layout flushes the inverted position, so the transition plays from it.
    moved[0].getBoundingClientRect();
    for (const el of rowElements()) { el.style.transition = ''; el.style.transform = ''; }
  }
  function finish(commit = false) {
    const state = gesture.current;
    if (!state) return;
    gesture.current = null;
    clearTimeout(state.timer);
    if (state.active) suppressClick.current = state.id;
    try { state.element?.releasePointerCapture?.(state.pointerId); } catch { /* already released */ }
    setDrag(null);
    if (!state.active) return;
    snapshot();
    const moved = commit && state.key === latest.current.storageKey && state.target
      && move(state.id, state.target.id, state.target.placement);
    if (!moved) playFlip();
  }
  function pointerDown(event, id) {
    if (event.button !== 0 || !event.isPrimary || event.target.closest('[data-project-menu-trigger]')) return;
    finish();
    suppressClick.current = null;
    const element = event.target.closest('button');
    const handle = Boolean(event.target.closest('[data-project-drag-handle]'));
    const state = { id, key: storageKey, element, pointerId: event.pointerId, pointerType: event.pointerType, handle,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, target: null, rows: [], from: -1 };
    gesture.current = state;
    try { element?.setPointerCapture?.(event.pointerId); } catch { /* synthetic pointer */ }
    state.timer = setTimeout(() => {
      if (gesture.current !== state) return;
      activate(state);
    }, 280);
  }
  function pointerMove(event) {
    const state = gesture.current;
    if (!state || event.pointerId !== state.pointerId) return;
    state.x = event.clientX; state.y = event.clientY;
    const distance = Math.hypot(state.x - state.startX, state.y - state.startY);
    // Touching the row keeps native scrolling; the visible handle owns touch drag.
    if (!state.active && distance > 7) {
      if (state.pointerType === 'touch' && !state.handle) { finish(); return; }
      clearTimeout(state.timer);
      activate(state);
    }
    if (state.active) { event.preventDefault(); layout(); }
  }
  React.useLayoutEffect(() => { playFlip(); }, [ordered]);
  React.useEffect(() => {
    if (!drag) return undefined;
    let frame;
    const scroll = () => {
      const state = gesture.current;
      const list = listRef.current;
      if (!state?.active || !list) return;
      const rect = list.getBoundingClientRect();
      if (state.x >= rect.left && state.x <= rect.right && state.y >= rect.top - 24 && state.y <= rect.bottom + 24) {
        const delta = state.y < rect.top + 32 ? -10 : state.y > rect.bottom - 32 ? 10 : 0;
        if (delta) { list.scrollTop += delta; layout(); }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [Boolean(drag)]);
  React.useEffect(() => {
    const cancel = event => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); finish(); setNotice('순서 변경을 취소했습니다.'); } };
    const blur = () => finish();
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', cancel); window.removeEventListener('blur', blur); finish(); };
  }, [storageKey]);

  return { ordered, preferences, notice, dismissNotice: () => setNotice(''), menu, drag, listRef, move, openMenu, closeMenu,
    sortLabel: PROJECT_INDEX_SORT_OPTIONS.find(option => option.value === preferences.sort)?.label,
    setSort: sort => { save({ ...preferences, sort }, '정렬 설정 저장됨 · 이 브라우저'); closeMenu(); },
    rowEvents: id => ({
      onContextMenu: event => { finish(); openMenu(event, 'project', projects.find(item => item.id === id)); },
      onKeyDown: event => { if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') openMenu(event, 'project', projects.find(item => item.id === id)); },
      onPointerDown: event => pointerDown(event, id), onPointerMove: pointerMove,
      onPointerUp: event => { if (gesture.current?.pointerId === event.pointerId) { layout(); finish(true); } },
      onPointerCancel: () => finish(), onLostPointerCapture: () => finish(),
      onClickCapture: event => { if (event.detail > 0 && suppressClick.current === id) { event.preventDefault(); event.stopPropagation(); suppressClick.current = null; } },
    }),
  };
}

export function ProjectIndexMenu({ controls, onEdit, onDelete, canWrite, onMonthlyReview, onShowAll, onManageDelivery }) {
  const { menu, closeMenu } = controls;
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!menu || !element) return undefined;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x - (menu.alignEnd ? rect.width : 0), window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    (element.querySelector('[aria-checked="true"]') || element.querySelector('[role^="menuitem"]:not(:disabled)'))?.focus();
    const outside = event => { if (!element.contains(event.target) && !menu.returnFocus?.contains(event.target)) closeMenu(false); };
    const close = event => { if (!element.contains(event.target)) closeMenu(false); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', close); document.removeEventListener('scroll', close, true); };
  }, [menu]);
  if (!menu) return null;
  const position = controls.ordered.findIndex(item => item.id === menu.project?.id);
  const move = direction => {
    const neighbor = controls.ordered[position + direction];
    if (neighbor) controls.move(menu.project.id, neighbor.id, direction < 0 ? 'before' : 'after');
    closeMenu();
  };
  return <div ref={ref} className={styles.menu} style={{ left: menu.x, top: menu.y }} role="menu"
    aria-label={menu.kind === 'sort' ? '프로젝트 정렬' : menu.kind === 'manage' ? '프로젝트 관리' : `${menu.project?.name} 메뉴`} data-shortcut-overlay="true"
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
      else if (event.key === 'Tab') closeMenu();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const items = [...ref.current.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
        const current = items.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
    {menu.kind === 'sort' ? <>
      <p className={styles.menuHeading}>프로젝트 정렬</p>
      {PROJECT_INDEX_SORT_OPTIONS.map((option, index) => <React.Fragment key={option.value}>
        {[1, 3, 5, 7].includes(index) && <div className={styles.divider} role="separator" />}
        <Button className={styles.menuItem} variant="ghost" role="menuitemradio"
          aria-checked={controls.preferences.sort === option.value} onClick={() => controls.setSort(option.value)}>
          <Iconed name={option.value === 'manual' ? 'drag' : option.value.startsWith('due') ? 'calendar' : option.value.startsWith('updated') ? 'clock' : option.value.endsWith('asc') ? 'arrowUp' : 'arrowDown'} size={14} />
          <span>{option.label}</span>
          <span className={styles.check}>{controls.preferences.sort === option.value && <Iconed name="check" size={13} />}</span>
        </Button>
      </React.Fragment>)}
      <p className={styles.menuHint}>드래그하면 직접 정렬로 전환됩니다.<br />이 브라우저에 저장됩니다.</p>
    </> : menu.kind === 'manage' ? <>
      <p className={styles.menuHeading}>프로젝트 관리</p>
      <Button className={styles.menuItem} variant="ghost" role="menuitem" icon="calendar" onClick={() => { closeMenu(); onMonthlyReview(); }}>이번 달 평가</Button>
      {onShowAll && <Button className={styles.menuItem} variant="ghost" role="menuitem" icon="menu" onClick={() => { closeMenu(); onShowAll(); }}>전체 목록 보기</Button>}
      {menu.project && <Button className={styles.menuItem} variant="ghost" role="menuitem" icon="flag" onClick={() => { closeMenu(); onManageDelivery(menu.project); }}>결과·완료 기준</Button>}
      {menu.project && menu.project.statusKey !== 'archived' && <>
        <div className={styles.divider} role="separator" />
        <Button className={styles.menuItem} variant="danger" role="menuitem" icon="trash" disabled={!canWrite} onClick={() => { closeMenu(); onDelete(menu.project); }}>프로젝트 삭제…</Button>
      </>}
    </> : <>
      <p className={styles.menuHeading}>{menu.project?.name}</p>
      <Button className={styles.menuItem} variant="ghost" role="menuitem" icon="edit" disabled={!canWrite} onClick={() => { closeMenu(); onEdit(menu.project); }}>프로젝트 편집</Button>
      <Button className={styles.menuItem} variant="ghost" role="menuitem" icon="arrowUp" disabled={position <= 0} onClick={() => move(-1)}>위로 이동</Button>
      <Button className={styles.menuItem} variant="ghost" role="menuitem" icon="arrowDown" disabled={position < 0 || position === controls.ordered.length - 1} onClick={() => move(1)}>아래로 이동</Button>
      <div className={styles.divider} />
      <Button className={styles.menuItem} variant="danger" role="menuitem" icon="trash" disabled={!canWrite} onClick={() => { closeMenu(); onDelete(menu.project); }}>프로젝트 삭제…</Button>
      <p className={styles.menuHint}>삭제 전 연결 기록과 복원 방법을 확인합니다.</p>
    </>}
  </div>;
}

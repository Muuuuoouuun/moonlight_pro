"use client";

import React from 'react';
import { Button, IconButton } from '../hub-primitives';
import styles from './project-direct-work.module.css';

const signature = group => JSON.stringify(group?.items.map(item => [item.id, item.updatedAt, item.done]) || []);

// A handle owns the pointer gesture; the row keeps normal scrolling and editing.
// Groups separate open/done tasks and each task's checklist, so dragging never reparents.
export function useProjectWorkOrder({ projectId, root, groups, onNotice }) {
  const [drag, setDrag] = React.useState(null);
  const [menu, setMenu] = React.useState(null);
  const menuRef = React.useRef(null);
  const gesture = React.useRef(null);
  const suppressClick = React.useRef(false);
  const saving = React.useRef(false);
  const latest = React.useRef(null);
  latest.current = { projectId, groups, onNotice };

  function closeMenu(restore = true) {
    if (restore && menu?.anchor?.isConnected) menu.anchor.focus({ preventScroll: true });
    setMenu(null);
  }
  async function move(groupId, sourceId, targetId, placement) {
    const current = latest.current;
    const group = current.groups[groupId];
    if (saving.current || group?.disabled || !group?.items.some(item => item.id === sourceId)
      || !group.items.some(item => item.id === targetId) || sourceId === targetId) return;
    saving.current = true;
    try {
      const result = await group.onMove(sourceId, targetId, placement);
      if (latest.current.projectId === current.projectId) current.onNotice(result);
    } catch {
      if (latest.current.projectId === current.projectId) current.onNotice({ ok: false, message: '순서를 저장하지 못했습니다. 다시 시도하세요.' });
    } finally { saving.current = false; }
  }
  function finish(commit = false) {
    const state = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!state) return;
    suppressClick.current = state.active;
    try { state.anchor.releasePointerCapture(state.pointerId); } catch { /* pointer already released */ }
    if (commit && state.active && state.target && state.projectId === latest.current.projectId
      && state.signature === signature(latest.current.groups[state.groupId])) {
      void move(state.groupId, state.id, state.target.id, state.target.placement);
    }
  }
  function locate(state) {
    const rows = [...(root.current?.querySelectorAll('[data-order-group]') || [])]
      .filter(row => row.dataset.orderGroup === state.groupId && row.dataset.orderId !== state.id);
    const bounds = root.current?.getBoundingClientRect();
    const inside = bounds && state.x >= bounds.left && state.x <= bounds.right && state.y >= bounds.top && state.y <= bounds.bottom;
    const target = inside && (rows.find(row => { const rect = row.getBoundingClientRect(); return state.y < rect.top + rect.height / 2; }) || rows.at(-1));
    state.target = target ? { id: target.dataset.orderId, placement: state.y < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? 'before' : 'after' } : null;
    setDrag(current => current?.groupId === state.groupId && current.id === state.id
      && current.target?.id === state.target?.id && current.target?.placement === state.target?.placement
      ? current : { groupId: state.groupId, id: state.id, target: state.target });
  }
  function start(event, groupId, item) {
    const group = latest.current.groups[groupId];
    if (event.button !== 0 || event.isPrimary === false || group.disabled || saving.current) return;
    finish();
    closeMenu(false);
    suppressClick.current = false;
    const anchor = event.currentTarget;
    anchor.setPointerCapture?.(event.pointerId);
    gesture.current = { projectId, groupId, id: item.id, signature: signature(group), anchor, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
  }
  function pointerMove(event) {
    const state = gesture.current;
    if (!state || event.pointerId !== state.pointerId) return;
    state.x = event.clientX; state.y = event.clientY;
    if (!state.active && Math.hypot(state.x - state.startX, state.y - state.startY) < 5) return;
    state.active = true;
    event.preventDefault();
    locate(state);
  }
  React.useEffect(() => {
    const cancel = event => {
      if (event.key === 'Escape' && gesture.current) {
        event.preventDefault(); finish(); latest.current.onNotice({ ok: true, message: '순서 변경을 취소했습니다.' });
      }
    };
    const blur = () => finish();
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', cancel); window.removeEventListener('blur', blur); finish(); };
  }, [projectId]);
  React.useEffect(() => { closeMenu(false); }, [projectId]);
  React.useEffect(() => {
    if (!drag) return;
    let frame;
    const scroll = () => {
      const state = gesture.current;
      if (!state?.active) return;
      let scroller = state.anchor.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      scroller ||= document.scrollingElement;
      if (scroller) {
        const rect = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
        const delta = state.y < rect.top + 32 ? -8 : state.y > rect.bottom - 32 ? 8 : 0;
        if (delta) { scroller.scrollTop += delta; locate(state); }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [Boolean(drag)]);
  React.useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const element = menuRef.current;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    element.querySelector('button:not(:disabled)')?.focus();
    const outside = event => { if (!element.contains(event.target) && !menu.anchor.contains(event.target)) closeMenu(false); };
    const hide = () => closeMenu(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, [menu]);

  const group = menu && groups[menu.groupId];
  const index = group?.items.findIndex(item => item.id === menu.id) ?? -1;
  const shift = direction => {
    const target = group?.items[index + direction];
    if (target) void move(menu.groupId, menu.id, target.id, direction < 0 ? 'before' : 'after');
    closeMenu();
  };
  return {
    rowProps: (groupId, id) => ({ 'data-order-group': groupId, 'data-order-id': id,
      'data-dragging': drag?.groupId === groupId && drag.id === id ? 'true' : undefined,
      'data-drop': drag?.groupId === groupId && drag.target?.id === id ? drag.target.placement : undefined }),
    handle: (groupId, item) => <IconButton icon="drag" size={30} className={styles.orderHandle}
      tooltip={`${item.title} 순서 변경${groups[groupId].onEdit ? '·편집' : ''}`} aria-haspopup="menu" aria-expanded={menu?.id === item.id && menu?.groupId === groupId}
      disabled={groups[groupId].onEdit ? groups[groupId].editDisabled : groups[groupId].disabled} onPointerDown={event => start(event, groupId, item)} onPointerMove={pointerMove}
      onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }}
      onPointerCancel={() => finish()} onLostPointerCapture={() => finish()}
      onClick={event => {
        if (suppressClick.current && event.detail > 0) { suppressClick.current = false; return; }
        if (menu?.anchor === event.currentTarget) { closeMenu(); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        setMenu({ groupId, id: item.id, title: item.title, anchor: event.currentTarget, x: rect.left, y: rect.bottom });
      }} onKeyDown={event => {
        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const current = groups[groupId];
          const position = current.items.findIndex(row => row.id === item.id);
          const direction = event.key === 'ArrowUp' ? -1 : 1;
          const neighbor = current.items[position + direction];
          if (neighbor) void move(groupId, item.id, neighbor.id, direction < 0 ? 'before' : 'after');
        }
      }} />,
    menu: menu && index >= 0 && <div ref={menuRef} className={styles.orderMenu} role="menu" aria-label={`${menu.title} 순서 변경`}
      style={{ left: menu.x, top: menu.y }} data-shortcut-overlay="true" onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
        if (event.key === 'Tab') closeMenu();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')];
          const position = buttons.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (position + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      <Button variant="ghost" role="menuitem" icon="arrowUp" disabled={group.disabled || index <= 0} onClick={() => shift(-1)}>위로 이동</Button>
      <Button variant="ghost" role="menuitem" icon="arrowDown" disabled={group.disabled || index === group.items.length - 1} onClick={() => shift(1)}>아래로 이동</Button>
      {group.onEdit && <Button variant="ghost" role="menuitem" icon="edit" disabled={group.editDisabled} onClick={() => { closeMenu(); group.onEdit(group.items[index]); }}>상세 편집</Button>}
      <p>드래그 또는 Alt + ↑↓</p>
    </div>,
  };
}

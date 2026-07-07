"use client";

// Shared selection + keyboard model for the Revenue CRM surfaces (Leads/Deals).
// `useCrmSelection` tracks a single "focused" row/card (j/k/e/1-5) plus a multi-select
// Set (Phase 4 bulk). `useCrmKeyboard` binds the keys, scoped so it never fires while the
// operator is typing in a field or a drawer is open (drawers own ⌘Enter/Esc themselves).

import React from "react";

export function useCrmSelection(items) {
  const [selectedId, setSelectedId] = React.useState(null);
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const ids = React.useMemo(() => (items || []).map((i) => i.id), [items]);

  const moveSelection = React.useCallback((dir) => {
    setSelectedId((cur) => {
      if (!ids.length) return null;
      const i = ids.indexOf(cur);
      if (i === -1) return ids[0];
      const next = dir === "down" ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
      return ids[next];
    });
  }, [ids]);

  const toggleSelected = React.useCallback((id) => {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const clearSelected = React.useCallback(() => setSelectedIds(new Set()), []);

  return { selectedId, setSelectedId, moveSelection, selectedIds, setSelectedIds, toggleSelected, clearSelected };
}

// Is the user currently typing, or is a drawer/modal open? If so we yield the keyboard.
function shouldYield() {
  if (typeof document === "undefined") return true;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) {
    return true;
  }
  if (document.querySelector('[data-drawer-open="true"]')) return true;
  return false;
}

export function useCrmKeyboard({ enabled = true, selection, onNew, onEditSelected, onSearchFocus, onStageMove, onHelp, onToggleSelect }) {
  React.useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave ⌘K etc. alone
      if (shouldYield()) return;
      const k = e.key;
      if (k === "j") { e.preventDefault(); selection.moveSelection("down"); }
      else if (k === "k") { e.preventDefault(); selection.moveSelection("up"); }
      else if (k === "e" && selection.selectedId != null) { e.preventDefault(); onEditSelected?.(selection.selectedId); }
      else if (k === "n") { e.preventDefault(); onNew?.(); }
      else if (k === "/") { e.preventDefault(); onSearchFocus?.(); }
      else if (k === "?") { e.preventDefault(); onHelp?.(); }
      else if (k === "x" && selection.selectedId != null && onToggleSelect) { e.preventDefault(); onToggleSelect(selection.selectedId); }
      else if (/^[1-5]$/.test(k) && onStageMove) { e.preventDefault(); onStageMove(Number(k) - 1); }
      else if (k === "Escape") { selection.setSelectedId(null); selection.clearSelected(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, selection, onNew, onEditSelected, onSearchFocus, onStageMove, onHelp, onToggleSelect]);
}

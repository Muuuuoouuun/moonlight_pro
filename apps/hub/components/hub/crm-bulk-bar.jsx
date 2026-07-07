"use client";

// Bulk-action bar + saved filter views for the Revenue CRM lists.
// BulkBar: bottom-centered floating bar shown while rows are multi-selected; the caller passes
//   the action controls as children so each surface keeps its own bulk semantics.
// SavedViews: persists filter combos to localStorage (personal cockpit — no migration).

import React from "react";
import { Badge, Button } from "./hub-primitives";

export function BulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 50,
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: "var(--surface-3)", border: "1px solid var(--line)",
      borderRadius: 999, boxShadow: "var(--shadow-pop)",
    }}>
      <Badge tone="moon" size="sm">{count} 선택</Badge>
      {children}
      <button onClick={onClear} aria-label="선택 해제" style={{
        fontSize: 15, lineHeight: 1, color: "var(--fg-faint)", background: "transparent",
        border: "none", cursor: "pointer", marginLeft: 2,
      }}>×</button>
    </div>
  );
}

export function SavedViews({ viewKey, current, onApply }) {
  const storageKey = `mlp.revenue.views.${viewKey}`;
  const [views, setViews] = React.useState([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setViews(JSON.parse(raw));
    } catch { /* ignore corrupt storage */ }
  }, [storageKey]);

  const persist = (next) => {
    setViews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const save = () => {
    const name = typeof window !== "undefined" ? window.prompt("뷰 이름") : null;
    const trimmed = name && name.trim();
    if (!trimmed) return;
    persist([...views.filter(v => v.name !== trimmed), { name: trimmed, filter: current }]);
  };

  const remove = (name) => persist(views.filter(v => v.name !== name));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {views.map(v => (
        <span key={v.name} style={{ display: "inline-flex", alignItems: "center" }}>
          <button onClick={() => onApply(v.filter)} style={{
            fontSize: 11.5, padding: "3px 9px", borderRadius: "999px 0 0 999px",
            border: "1px solid var(--line-soft)", borderRight: "none",
            background: "var(--surface-2)", color: "var(--fg-muted)", cursor: "pointer",
          }}>{v.name}</button>
          <button onClick={() => remove(v.name)} aria-label={`${v.name} 삭제`} style={{
            fontSize: 11, padding: "3px 7px", borderRadius: "0 999px 999px 0",
            border: "1px solid var(--line-soft)", background: "var(--surface-2)",
            color: "var(--fg-faint)", cursor: "pointer",
          }}>×</button>
        </span>
      ))}
      <Button variant="ghost" size="xs" icon="plus" onClick={save}>뷰 저장</Button>
    </div>
  );
}

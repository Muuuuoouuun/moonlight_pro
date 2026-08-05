"use client";

// Keyboard shortcut cheat-sheet for the Revenue CRM surfaces. Opened with `?` (wired via
// useCrmKeyboard onHelp). Mirrors the CommandPalette overlay shell; tokens only.

import React from "react";
import { Kbd } from "./hub-primitives";
import { isTopEscLayer, popEscLayer, pushEscLayer } from "./esc-layers";

const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "명령 팔레트 (이동)" },
  { keys: ["J", "K"], label: "위/아래 선택 이동 (목록)" },
  { keys: ["E"], label: "선택 항목 편집" },
  { keys: ["N"], label: "새 항목 생성" },
  { keys: ["/"], label: "검색 포커스" },
  { keys: ["1", "–", "5"], label: "선택 딜 스테이지 이동 (Deals)" },
  { keys: ["⌘", "Z"], label: "완료 직후 되돌리기 (할 일)" },
  { keys: ["⌘", "↵"], label: "드로어 저장" },
  { keys: ["Esc"], label: "닫기 / 선택 해제" },
  { keys: ["?"], label: "이 도움말" },
];

export function ShortcutOverlay({ open, onClose }) {
  // ESC 레이어 스택 참여 — 드로어 위에서 열려도 ESC가 이 오버레이만 닫는다.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return undefined;
    const layer = pushEscLayer();
    const onKey = (e) => { if (e.key === "Escape" && isTopEscLayer(layer)) onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); popEscLayer(layer); };
  }, [open]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "oklch(0 0 0 / 0.6)", backdropFilter: "blur(6px)",
      display: "flex", justifyContent: "center", paddingTop: "16vh",
      animation: "mlFadeUp .15s ease-out",
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="키보드 단축키"
        data-shortcut-overlay="true"
        onClick={(e) => e.stopPropagation()}
        style={{
        width: 380, maxWidth: "90vw", height: "fit-content",
        background: "var(--surface-2)", border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-pop)", padding: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", marginBottom: 12 }}>키보드 단축키</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SHORTCUTS.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--fg-muted)" }}>
              <span style={{ display: "inline-flex", gap: 3, minWidth: 82 }}>
                {s.keys.map((k, j) => <Kbd key={j}>{k}</Kbd>)}
              </span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 11, color: "var(--fg-faint)", textAlign: "right" }}>
          <Kbd>Esc</Kbd> 닫기
        </div>
      </div>
    </div>
  );
}

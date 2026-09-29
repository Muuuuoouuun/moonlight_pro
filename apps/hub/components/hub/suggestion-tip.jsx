"use client";

// SuggestionTip — 작은 인라인 제안 팁. 2026-09-24 영업·매출 라운드 2.
//
// 운영자 결정: "내가 생각한 넛지는 디자인 요소나 아니면 추천 팁 혹은 제안 같은 쪽으로 가야
// 돼" — 별도 섹션/패널이 아니라, 그 대상(행·카드·드로어)에 붙는 조용한 제안 한 줄이다.
// 문법은 DESIGN.md §5.3 certainty의 "recommended"를 그대로 쓴다: 점선 1px 테두리 + 다이아몬드
// 마커 + 직접 라벨("제안") — 색 fill 없음, danger·success·warning·info 금지, whole-component
// opacity 금지. 마커·라벨은 CertaintyBadge를 그대로 재사용한다(label="제안"으로 override).
//
// compact(고객 목록 행처럼 이미 클릭 가능한 컨테이너 — role="button" — 안에 놓일 때)는 버튼을
// 전혀 렌더링하지 않는다. role="button" div 안에 실제 <button>을 중첩하면 키보드·스크린리더
// 포커스 순서가 꼬인다 — 목록 행은 이미 전체가 클릭 가능해 같은 결과(고객 열기)로 이어지므로
// compact는 정보만 보여주고, 실제 액션·나중에·숨기기 버튼은 펼쳐진 곳(드로어·오늘 연락 행)에서만 준다.
//
// 예산(DESIGN.md 이번 결정): 고객·거래 하나당 팁은 최대 하나 — 호출부가 보여줄 팁을 골라서
// 이 컴포넌트에는 이미 결정된 팁 하나만 넘긴다. 이 컴포넌트 자신은 여러 개를 쌓지 않는다.

import React from "react";
import { Button, CertaintyBadge, IconButton, TextField } from "./hub-primitives";

export function SuggestionTip({ reason, action, onAction, onSnooze, onDismiss, compact = false, style }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [choosingDate, setChoosingDate] = React.useState(false);
  const [until, setUntil] = React.useState("");

  if (!reason) return null;

  if (compact) {
    // 정보만 — 행 전체가 이미 클릭 가능하므로 여기엔 버튼을 두지 않는다.
    return (
      <div
        className="suggestion-tip suggestion-tip--compact"
        style={{
          display: "flex", alignItems: "center", gap: 5, minWidth: 0,
          fontSize: 11, color: "var(--fg-muted)",
          ...style,
        }}
      >
        <CertaintyBadge state="recommended" label="제안" style={{ padding: "1px 5px", fontSize: 10 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{reason}</span>
      </div>
    );
  }

  const hasOverflow = Boolean(onSnooze || onDismiss);
  const closeMenu = () => { setMenuOpen(false); setChoosingDate(false); setUntil(""); };
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="suggestion-tip"
      style={{
        display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 6,
        padding: "6px 8px",
        border: "1px dashed var(--line)",
        borderRadius: "var(--r-sm)",
        ...style,
      }}
      onClick={stop}
    >
      <CertaintyBadge state="recommended" label="제안" style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: 12, color: "var(--fg-muted)", overflowWrap: "anywhere" }}>
        {reason}
      </span>
      {action && onAction && (
        <Button variant="ghost" size="xs" onClick={onAction}>{action}</Button>
      )}
      {hasOverflow && (
        <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
          <IconButton
            icon="more"
            size={24}
            iconSize={12}
            tooltip="더 보기"
            aria-label="제안 더 보기"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          />
          {menuOpen && (
            <div
              role="menu"
              aria-label="제안 처리"
              style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 5,
                display: "flex", flexDirection: "column", gap: 4, minWidth: 148,
                padding: 6,
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-sm)",
                boxShadow: "var(--shadow-pop)",
              }}
            >
              {onSnooze && !choosingDate && (
                <Button variant="ghost" size="xs" onClick={() => setChoosingDate(true)}>나중에</Button>
              )}
              {onSnooze && choosingDate && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <TextField
                    label="다시 볼 날짜"
                    type="date"
                    className="mono"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                  <Button variant="outline" size="xs" disabled={!until} onClick={() => { onSnooze(until); closeMenu(); }}>
                    그때 다시
                  </Button>
                </div>
              )}
              {onDismiss && (
                <Button variant="ghost" size="xs" onClick={() => { onDismiss(); closeMenu(); }}>숨기기</Button>
              )}
            </div>
          )}
        </span>
      )}
    </div>
  );
}

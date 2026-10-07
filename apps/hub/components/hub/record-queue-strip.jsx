"use client";

// 넓은 기록창의 머리 아래 한 줄 — 오늘 연락에서 '저장하고 다음'으로 이어 쓰는 동안 서는 줄이다
// (2026-09-30 넓은 기록창 ④ · Q-CR8, 권장 · 화면 확인 뒤 확정).
//
//   다음 — 주 버튼(저장하고 다음)이 데려갈 사람. 저장하지 못한 기록이 남아 있으면 그 사람이다.
//   이전 — 앞 사람의 저장이 어디까지 갔는지: 기록 중(되돌리기) → 저장 중 → 저장됨 hh:mm. 창이 이미 다음
//          사람으로 넘어갔으므로 이 줄이 되돌리기와 실패를 든다 — 아래 토스트는 저장 줄을 가린다.
// "저장됨"은 서버가 답한 뒤에만 선다(DESIGN §8.1). 빨강은 저장하지 못한 줄의 1px 레일과 제목 한 곳뿐이다
// (§5.2) — 기록 칸의 실패 원인 줄(RecordSaveLine)과 같은 표식을 같은 방식(인라인)으로 그린다. 원인 문장과
// 쓰던 글은 돌아간 창이 보인다. 무엇을 보일지는 순수 규칙(lib/sales-os/record-queue.js)이 정하고 여기는 그리기만 한다.
//
// 줄의 높이는 저장이 진행돼도 그대로다 — 되돌리기 · 돌아가기 버튼이 나타났다 사라질 때 쓰는 칸이 밀리면, 이미
// 다음 사람의 글을 쓰고 있는 손 밑에서 화면이 움직인다. 그래서 글자뿐인 줄도 버튼의 높이로 선다(스타일시트:
// 줄 높이 = 작은 버튼, 누르는 곳이 44px인 화면(touch)에서는 44px).
// 휴대폰 시트(compact)는 한 줄이다: 앞 사람의 영수증이 있으면 그것이 '다음' 자리에 서고(덧말은 뺀다 — 전부는
// 돌아간 창이 말한다), 보조 버튼('저장만')의 자리(secondaryRef)는 그 줄의 끝이다 — 머리에는 주 버튼 하나만 둔다.

import React from "react";
import { Button } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import { RecordReceipt } from "./record-context-column";
import { recordNextLabel } from "@/lib/sales-os/record-queue";
import "./record-window.css";

const FAILED_ITEM = { paddingLeft: 10, boxShadow: "inset 1px 0 0 var(--danger)", color: "var(--fg)" };
const FAILED_TITLE = { display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500, color: "var(--danger)" };

// stop: recordNextStop(...)의 결과(없으면 마지막 사람 — '다음'을 말하지 않는다). items: trailItems(trail).
// onUndo(id) · onReturn(id): 그 줄의 되돌리기 · 돌아가기. inset: 여백이 있는 본문 안에 놓인다(고객을 고르는 동안).
// compact: 휴대폰 시트 — 한 줄. touch: 누르는 곳이 44px로 서는 화면(터치 플로어).
export function RecordQueueStrip({ stop = null, items = [], onUndo, onReturn, secondaryRef = null, inset = false, compact = false, touch = false }) {
  if (!stop && items.length === 0) return null;
  // 휴대폰 시트의 첫 줄에는 앞 사람의 영수증이 선다 — 그때 '다음'은 말하지 않는다(주 버튼이 '저장하고 다음'이고,
  // 돌아갈 기록이 있으면 그 영수증이 바로 그 기록이다).
  const lead = compact && items.length > 0 ? items[0] : null;
  const rest = lead ? items.slice(1) : items;
  const renderItem = (item) => (
    <span
      key={item.id}
      className="record-window__strip-item"
      data-phase={item.phase}
      data-lead={item === lead ? "true" : undefined}
      data-noted={item.note ? "true" : undefined}
      role={item.receipt ? undefined : item.tone === "error" ? "alert" : "status"}
      style={item.tone === "error" ? FAILED_ITEM : undefined}
    >
      <span className="record-window__strip-who">이전 · {item.name}</span>
      {item.receipt ? <RecordReceipt receipt={compact ? { ...item.receipt, detail: "" } : item.receipt} /> : (
        <>
          {item.tone === "error"
            ? <><span style={FAILED_TITLE}><Iconed name="x" size={11} />{item.label}</span>{item.detail && !compact && <span>{item.detail}</span>}</>
            : <span>{item.label}{item.detail && !compact ? ` · ${item.detail}` : ""}</span>}
        </>
      )}
      {/* 저장 뒤의 덧말(실제 연락 시각을 남기지 못했다) — 기록은 저장됐으므로 위급 색을 쓰지 않는다. */}
      {item.note && <span className="record-window__strip-note" role="status">{item.note}</span>}
      {item.canUndo && <Button variant="ghost" size="xs" onClick={() => onUndo?.(item.id)}>되돌리기</Button>}
      {item.canReturn && (
        <Button variant="ghost" size="xs" icon="chevronL" aria-label={`${item.name} 기록으로 돌아가기`} onClick={() => onReturn?.(item.id)}>돌아가기</Button>
      )}
    </span>
  );
  return (
    <div
      className="record-window__strip"
      data-inset={inset ? "true" : undefined}
      data-layout={compact ? "sheet" : undefined}
      data-touch={touch ? "true" : undefined}
      role="group"
      aria-label="이어 쓰기 · 다음 사람과 앞 사람의 저장"
    >
      {stop && !lead && (
        <span className="record-window__strip-next">
          {recordNextLabel(stop)} <b>{stop.name}</b>
        </span>
      )}
      {lead && renderItem(lead)}
      {/* 휴대폰 시트의 보조 버튼 자리는 첫 줄의 끝에 선다 — 풀리지 않은 기록이 더 있어 줄이 늘어도 버튼은 제자리다. */}
      {secondaryRef && <span ref={secondaryRef} className="record-window__strip-slot" />}
      {rest.map(renderItem)}
    </div>
  );
}

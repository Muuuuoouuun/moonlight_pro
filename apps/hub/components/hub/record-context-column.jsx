"use client";

// 넓은 기록창의 오른쪽 읽기 칸 — 쓰는 동안 읽던 내용이 옆에 남는다(2026-09-30 넓은 기록창 ②,
// 권장 · 화면 확인 뒤 확정). 약속 한 장 + 최근 기록 다섯 줄, 읽기만 한다.
//
// 이 칸은 아무것도 저장하지 않고 새 읽기도 만들지 않는다 — 드로어가 이미 읽어 둔 약속 · 기록 줄기 ·
// 읽기 상태를 받아 그린다. 약속 바꾸기 · 기록 삭제 · 메모 열기는 '고객 정보로'(쉬는 드로어)의 몫이라
// 버튼이 없다. 제안 팁도 이유만 보인다(한 사람에 팁 하나 — 무엇을 보일지는 호출처가 이미 골랐다).
// 기록 줄은 누르면 그 자리에서 펼쳐진다: 쓰던 글을 떠나지 않는다.
//
// 한 줄기, 모양으로 나눈다(Q-CR6): 연락은 원, 메모는 네모 + '메모 · 연락 아님', 그 밖은 흐린 원. 거르기
// (전체 · 연락 · 메모)는 이 칸 안의 보기 상태일 뿐이다 — 새로 읽지 않고, 받은 줄기를 걸러 최근 다섯 줄을 보인다.
// 거른 자리가 비었을 때 "메모가 아직 없어요"는 연결 메모를 읽었을 때만 말한다 — 읽는 중이면 Skeleton, 못
// 읽었으면 못 읽었다고 한다(recordEmptyPlan · truth.memos). 읽기 실패를 빈 상태로 그리지 않는다.
//
// 방금 남긴 기록은 맨 윗줄이 영수증이다(RecordReceipt) — 기록 중 → 저장 중 → 저장됨 hh:mm.
// "저장됨"은 서버가 답한 뒤에만 선다(DESIGN §8.1 Save envelope). 무엇을 보일지는 순수 규칙
// (lib/sales-os/record-context.js · contact-record.js의 recordReceipt)이 정하고 여기는 그리기만 한다.

import React from "react";
import { Button, SegmentedControl, Skeleton, TruthBadge } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import { SuggestionTip } from "./suggestion-tip";
import { promiseReadout } from "@/lib/sales-os/customer-list";
import { RECORD_CONTEXT_LIMIT, RECORD_FILTERS, filterRecordStream, recordContextRows, recordEmptyPlan } from "@/lib/sales-os/record-context";
import "./record-window.css";

// 기록 줄 영수증 — 고객 드로어의 기록 줄과 이 칸이 같이 쓴다. receipt는 recordReceipt(row)의 결과다.
// 저장 중은 TruthBadge의 syncing을 그대로 쓴다(새 알약을 만들지 않는다). 초록은 없다 — 저장됨은
// 체크 글리프 + 글자 + 시각(mono)이다.
// 일부 저장의 표식은 반만 찬 원이다(§5.3 partial의 split-circle) — 색은 글자색 그대로, 빨강은 쓰지
// 않는다(원인과 다시 저장은 기록 칸의 레일 줄이 든다). 기록 칸이 닫힌 뒤에는 이 줄이 유일한 흔적이라
// 저장됨과 같은 또렷함(--fg)으로 선다.
function HalfMark() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M6 1.5a4.5 4.5 0 0 0 0 9z" fill="currentColor" />
    </svg>
  );
}

export function RecordReceipt({ receipt }) {
  if (!receipt) return null;
  if (receipt.phase === "sending") return <TruthBadge state="syncing" label={receipt.label} />;
  return (
    <span className="record-receipt" data-receipt={receipt.phase} role="status">
      {receipt.phase === "saved" && <Iconed name="check" size={11} />}
      {receipt.phase === "partial" && <HalfMark />}
      {receipt.phase === "pending" && <Iconed name="pause" size={11} />}
      <span>
        {receipt.label}
        {receipt.time && <> <span className="mono">{receipt.time}</span></>}
        {receipt.detail && ` · ${receipt.detail}`}
      </span>
    </span>
  );
}

function ContextRow({ row, open, onToggle }) {
  const content = (
    <>
      {open
        ? <span className="record-ctx__full">{row.full}</span>
        : <span className="record-ctx__title">{row.title}</span>}
      <span className="record-ctx__meta">
        {row.typeLabel && <span>{row.typeLabel}</span>}
        {row.note && <span>{row.note}</span>}
        {row.reactionLabel && <span>{row.reactionLabel}</span>}
        {row.receipt ? <RecordReceipt receipt={row.receipt} /> : row.when && <span className="mono">{row.when}</span>}
        {row.expandable && (
          <span className="record-ctx__open">
            {open ? "접기" : row.openLabel === "lines" ? <>자세히 <span className="num">{row.lineCount}</span>줄</> : "펼치기"}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className="record-ctx__item" data-shape={row.shape} data-receipt={row.receipt?.phase}>
      <span className="record-ctx__dot" aria-hidden="true"><Iconed name={row.icon} size={11} /></span>
      {row.expandable ? (
        <button type="button" className="hub-row record-ctx__body" aria-expanded={open} onClick={onToggle}>{content}</button>
      ) : (
        <div className="record-ctx__body">{content}</div>
      )}
    </li>
  );
}

// name: 누구의 맥락인지(접근 가능한 이름). promise: customerPromise(row, today)의 결과.
// tipReason: 이 사람에게 이미 고른 제안 팁의 이유(없으면 빈 값). rows: 기록 줄기(활동 + 연결 메모, 최신순).
// truth: recordContextTruth(...)의 결과. onRetry(which): "activities" | "memos" 읽기를 다시.
export function RecordContextColumn({ name = "", promise, tipReason = "", rows = [], today, truth, onRetry }) {
  const [opened, setOpened] = React.useState(() => new Set());
  const [filter, setFilter] = React.useState("all");
  const toggle = (key) => setOpened((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const readout = promiseReadout(promise || {});
  const state = truth?.state || "live";
  const readable = state !== "loading" && state !== "error";
  const visible = readable ? filterRecordStream(rows, filter) : [];
  const items = recordContextRows(visible, { today });
  const retry = truth?.retry && onRetry ? () => onRetry(truth.retry) : null;
  // 보일 줄이 없을 때 — "없어요"는 읽은 것에만 말한다(메모를 읽는 중 · 못 읽었으면 그렇게 말한다).
  const empty = recordEmptyPlan({ filter, total: rows.length, state, memos: truth?.memos });

  return (
    <aside className="record-ctx" aria-label={name ? `${name} · 읽기만` : "이 고객 · 읽기만"}>
      <p className="record-ctx__head"><Iconed name="eye" size={11} />이 고객 · 읽기만</p>

      <section className="record-ctx__promise" aria-label="다음 약속">
        <h3 className="fx-eyebrow">다음 약속</h3>
        <p className="record-ctx__what" data-muted={readout.muted ? "true" : undefined}>{readout.what}</p>
        {readout.when && (
          <p className="record-ctx__when">
            {readout.late && <><span className="record-ctx__late">{readout.lateLabel}</span> · </>}
            {readout.when}
          </p>
        )}
        {tipReason && <div className="record-ctx__tip"><SuggestionTip reason={tipReason} /></div>}
      </section>

      <section className="record-ctx__sec" aria-label="기록">
        <div className="record-ctx__sec-head">
          <h3 className="fx-eyebrow">기록</h3>
          {items.length > 0 && <span className="record-ctx__hint">최근 <span className="num">{items.length}</span></span>}
          {(state === "partial" || state === "preview") && <TruthBadge state={state} reason={truth.reason || undefined} />}
          {state === "partial" && retry && <Button variant="ghost" size="xs" icon="refresh" onClick={retry}>다시 읽기</Button>}
          {/* 거를 것이 있을 때만 — 기록이 하나도 없으면 고를 것도 없다. */}
          {readable && rows.length > 0 && (
            <SegmentedControl label="기록 거르기" options={RECORD_FILTERS} value={filter} onChange={setFilter} className="record-ctx__filter" />
          )}
        </div>
        {state === "loading" ? (
          <Skeleton height={14} lines={3} label="기록 불러오는 중" />
        ) : state === "error" ? (
          <div role="alert" className="record-ctx__state">
            <TruthBadge state="error" reason={truth.reason || undefined} />
            {retry && <Button variant="ghost" size="xs" onClick={retry}>다시 시도</Button>}
          </div>
        ) : items.length === 0 ? (
          empty.kind === "loading"
            ? <Skeleton height={14} lines={2} label={empty.label} />
            : <p className="record-ctx__empty">{empty.text}</p>
        ) : (
          <>
            <ol className="record-ctx__list">
              {items.map((row) => (
                <ContextRow key={row.key} row={row} open={opened.has(row.key)} onToggle={() => toggle(row.key)} />
              ))}
            </ol>
            {visible.length > RECORD_CONTEXT_LIMIT && (
              <p className="record-ctx__empty">{RECORD_FILTERS.find((f) => f.key === filter)?.label || "전체"} <span className="num">{visible.length}</span>건은 ‘고객 정보로’에서 봐요.</p>
            )}
          </>
        )}
      </section>
    </aside>
  );
}

"use client";

// 거래 탭의 "돈" 보기(기본) — 매출과 현금흐름만. 운영자 승인 목업 10(2026-09-26 "굿, 이렇게").
// 세 덩어리: 머리 카드(이번 달 매출 / 목표 · KPI 넷 · 리본) · 현금흐름 차트(주 · 월) · 들어올 돈 목록.
// 행을 누르면 기존 하단 독(pages/deals-dock.jsx — 결제 일정 · 입금 확인 · 정기 수정)이 그 거래로 열린다.
// 상태(딜 목록 · 낙관 반영 · 되돌리기 · 선택)는 pages/revenue.jsx의 Deals가 소유하고, 판정은
// lib/deal-money.js(확실 · 가능 · 늦음 · 묶음 · 차트 칸)가 소유한다. 여기는 그리기와 이 보기의 빠른 입력뿐이다.
//
// 선 모양이 확실성을 말한다(§5.3): 들어옴 = 꽉 찬 채움 · 확실 예정 = 실선 채움/점선 윤곽 · 가능 = 점(dotted).
// 빨강은 계약됐는데 밀린 돈 한 곳뿐 — 1px 레일과 직접 라벨, 레일은 예산(MAX_DANGER_RAILS)만큼.

import React from "react";
import { Button, EmptyState, SegmentedControl, TruthBadge, useToast } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { ContactRecordDrawer } from "../contact-record-form";
import { UNDO_WINDOW_MS } from "../use-undoable-action";
import {
  MAX_DANGER_RAILS,
  dateInputValue,
  dealCustomerKey,
  dealDockItem,
  formatSignedWon,
  formatWon,
  isoFromDateInput,
} from "@/lib/deal-timeline";
import { PAID_NOTE_MAX, markPaid, markRecurringPaid, scheduleLumpSum } from "@/lib/deal-payments";
import { formatShortWon } from "@/lib/deal-money";
import { paymentMonthKey } from "@/lib/deal-payment-plan";
import { DealDock, RecurringForm, isLocalId, shouldYieldKeys } from "./deals-dock";
import "./deals-money.css";

const FLOW_UNITS = [
  { key: "week", label: "주" },
  { key: "month", label: "월" },
];

const fullWon = (n) => `₩${Math.round(Number(n) || 0).toLocaleString("ko-KR")}`;

// "₩0.6M + 4.8M?" — 확실 합 + 가능 합(물음표). 둘 다 0이면 null.
function sumNotation(sure, maybe) {
  if (sure > 0 && maybe > 0) return `${formatWon(sure)} + ${formatShortWon(maybe)}?`;
  if (sure > 0) return formatWon(sure);
  if (maybe > 0) return `${formatWon(maybe)}?`;
  return null;
}

// ── 목표 — "/ 목표 ₩6M"(눌러서 고치기) 또는 "목표 정하기" ─────────────────────────
// 저장은 Deals(revenue.jsx)가 소유한 onSave(amount) 프라미스({ok} 계약). 목표를 읽지 못했으면
// (targetsKnown=false) 아무것도 그리지 않는다 — 미정처럼 보이게 하지 않는다.
export function MoneyTarget({ targetsKnown, target, monthLabel, saving, onSave }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  if (!targetsKnown) return null;
  if (!open) {
    return target ? (
      <button type="button" className="deals-money-target" onClick={() => { setValue(String(target)); setOpen(true); }}>
        / 목표 <span className="mono">{formatWon(target)}</span>
        <Iconed name="edit" size={11} />
      </button>
    ) : (
      <button type="button" className="deals-money-target deals-money-target--set" onClick={() => { setValue(""); setOpen(true); }}>
        {monthLabel} 목표 정하기
      </button>
    );
  }
  return (
    <form
      className="deals-money-target-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) return;
        const ok = await onSave(amount);
        if (ok) setOpen(false);
      }}
    >
      <span aria-hidden="true">₩</span>
      <input
        type="text"
        inputMode="numeric"
        className="hub-input"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="5000000"
        aria-label={`${monthLabel} 목표 금액`}
      />
      <Button type="submit" size="xs" variant="secondary" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button>
      <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
    </form>
  );
}

// ── 머리 카드 ───────────────────────────────────────────────────────────────

function Kpi({ label, children, kind }) {
  return (
    <div className="deals-money-kpi" data-kind={kind}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function MoneyRibbon({ model, target }) {
  const { ribbon, header, groups } = model;
  const undatedMaybe = groups.find((g) => g.key === "undated")?.maybe || 0;
  const drawn = ribbon.segments.filter((segment) => segment.amount > 0);
  return (
    <div className="deals-money-ribbon">
      <div className="deals-money-ribbon__bar" aria-hidden="true" data-empty={drawn.length === 0 && !target ? "true" : undefined}>
        {drawn.map((segment) => (
          <span key={segment.key} className="deals-money-seg" data-kind={segment.key} style={{ flexGrow: segment.amount }} />
        ))}
        {ribbon.gap > 0 && <span className="deals-money-seg" data-kind="gap" style={{ flexGrow: ribbon.gap }} />}
        {ribbon.targetPct != null && (
          <span
            className="deals-money-ribbon__target"
            data-edge={ribbon.targetPct > 85 ? "end" : ribbon.targetPct < 15 ? "start" : undefined}
            style={{ left: `${ribbon.targetPct}%` }}
          >
            <span>목표 {formatWon(target)}</span>
          </span>
        )}
      </div>
      <ul className="deals-money-legend" aria-label={`${model.monthLabel} 돈의 구성`}>
        {ribbon.segments.map((segment) => (segment.key === "late" && segment.amount === 0 ? null : (
          <li key={segment.key}>
            <i className="deals-money-swatch" data-kind={segment.key} aria-hidden="true" />
            {segment.label}
            <span className="mono deals-money-legend__amt">{formatWon(segment.amount)}</span>
          </li>
        )))}
        {undatedMaybe > 0 && (
          <li className="deals-money-legend__note">날짜 없는 가능 <span className="mono">{formatWon(undatedMaybe)}</span>은 목록 맨 아래</li>
        )}
        {header.target == null && drawn.length === 0 && <li className="deals-money-legend__note">이번 달에 잡힌 돈이 아직 없어요</li>}
      </ul>
    </div>
  );
}

// unknown(읽는 중 · 읽기 실패 · 미연결)에는 ₩0을 사실처럼 쓰지 않는다 — 제목은 "거래", KPI·리본은 없다.
export function MoneyHeader({ model, unknown, syncState, targetsKnown, targetSaving, onSaveTarget, actions }) {
  const { header, monthLabel } = model;
  return (
    <section className="fx-card deals-money-top" aria-labelledby="deals-money-title">
      <div className="deals-money-top__row">
        <div className="deals-money-top__title">
          <p className="fx-eyebrow deals-money-top__eyebrow">
            <span>{monthLabel} 매출</span>
            {syncState !== "live" && <TruthBadge state={syncState} />}
          </p>
          <div className="deals-money-top__figure">
            <h2 id="deals-money-title" className="fx-page-title deals-money-top__h">
              {unknown ? "거래" : (
                <>
                  <span className="deals-money-sr">{monthLabel}에 들어온 매출 </span>
                  <span className="stat">{formatWon(header.paid)}</span>
                </>
              )}
            </h2>
            {!unknown && (
              <MoneyTarget
                targetsKnown={targetsKnown}
                target={header.target}
                monthLabel={monthLabel}
                saving={targetSaving}
                onSave={onSaveTarget}
              />
            )}
          </div>
        </div>
        {!unknown && (
          <dl className="deals-money-kpis">
            <Kpi label="늦은 입금" kind={header.late > 0 ? "late" : "calm"}>
              {header.late > 0
                ? <span className="stat"><Iconed name="clock" size={13} /> {formatWon(header.late)}</span>
                : <span className="deals-money-kpi__none">없음</span>}
            </Kpi>
            <Kpi label="월말 확실" kind="sure"><span className="stat">{formatWon(header.monthEndSure)}</span></Kpi>
            <Kpi label="가능까지" kind="maybe"><span className="stat">{formatWon(header.withMaybe)}</span></Kpi>
            <Kpi label="매달 정기" kind="recurring">
              {header.recurringMonthly > 0
                ? <span className="stat">{formatWon(header.recurringMonthly)}</span>
                : <span className="deals-money-kpi__none">없음</span>}
            </Kpi>
          </dl>
        )}
        <div className="deals-money-top__actions">{actions}</div>
      </div>
      {!unknown && <MoneyRibbon model={model} target={header.target} />}
    </section>
  );
}

// ── 현금흐름 차트 ──────────────────────────────────────────────────────────

const pctOf = (amount, max) => (max > 0 ? Math.max(0, Math.min(100, (amount / max) * 100)) : 0);

function FlowColumn({ col, max }) {
  const firm = col.paid + col.late + col.sure;
  const total = firm + col.maybe;
  const parts = [
    ["paid", col.paid],
    ["late", col.late],
    ["sure", col.sure],
    ["maybe", col.maybe],
  ].filter(([, amount]) => amount > 0);
  return (
    <div className="deals-money-col" data-current={col.current ? "true" : undefined} data-carry={col.carry ? "true" : undefined}>
      <div className="deals-money-col__plot">
        {col.target != null && col.target > 0 && (
          <span className="deals-money-col__target" style={{ bottom: `${pctOf(col.target, max)}%` }} />
        )}
        {total > 0 && (
          <span className="deals-money-col__bar" style={{ height: `${pctOf(total, max)}%` }}>
            {parts.map(([kind, amount]) => (
              <span key={kind} className="deals-money-col__seg" data-kind={kind} style={{ flexGrow: amount }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function FlowAxis({ col }) {
  const firm = col.paid + col.late + col.sure;
  return (
    <div className="deals-money-axis__cell" data-current={col.current ? "true" : undefined} data-carry={col.carry ? "true" : undefined}>
      {firm > 0 && <span className="mono deals-money-axis__v">{formatShortWon(firm)}</span>}
      {col.maybe > 0 && <span className="mono deals-money-axis__v" data-kind="maybe">{formatShortWon(col.maybe)}?</span>}
      {firm === 0 && col.maybe === 0 && <span className="mono deals-money-axis__v" data-kind="none">—</span>}
      <span className="deals-money-axis__l">
        {col.current && <span className="deals-money-now" />}
        {col.label}
        {col.target ? <span className="deals-money-axis__goal"> · 목표 {formatShortWon(col.target)}</span> : null}
      </span>
    </div>
  );
}

export function CashflowChart({ model }) {
  const [unit, setUnit] = React.useState("week");
  const week = unit === "week";
  const cols = week ? model.weeks : model.months;
  const max = week ? model.weekMax : model.monthMax;
  const floorPct = week && model.weeklyFloor > 0 ? pctOf(model.weeklyFloor, max) : null;
  return (
    <section className="fx-card deals-money-flow" aria-labelledby="deals-money-flow-title">
      <header className="deals-money-flow__head">
        <h3 id="deals-money-flow-title" className="fx-eyebrow">현금흐름 · 언제 들어오나</h3>
        <SegmentedControl label="현금흐름 단위" options={FLOW_UNITS} value={unit} onChange={setUnit} />
      </header>
      <div className="deals-money-flow__scroll">
        <div className="deals-money-chart" data-unit={unit} style={{ "--cols": cols.length }} aria-hidden="true">
          <div className="deals-money-chart__plot">
            {floorPct != null && (
              <span className="deals-money-floor" style={{ bottom: `${floorPct}%` }}>
                <span>매달 정기 바닥 · 주당 ≈ {formatWon(model.weeklyFloor)}</span>
              </span>
            )}
            {cols.map((col) => <FlowColumn key={col.key} col={col} max={max} />)}
          </div>
          <div className="deals-money-chart__axis">
            {cols.map((col) => <FlowAxis key={col.key} col={col} />)}
          </div>
        </div>
      </div>
      <ul className="deals-money-legend deals-money-legend--flow">
        <li><i className="deals-money-swatch" data-kind="paid" aria-hidden="true" />들어옴</li>
        <li><i className="deals-money-swatch" data-kind="sure-fill" aria-hidden="true" />계약된 예정</li>
        <li><i className="deals-money-swatch" data-kind="maybe" aria-hidden="true" />가능(?)</li>
        {(week ? model.weeks[0].late : model.months[0].late) > 0 && (
          <li><i className="deals-money-swatch" data-kind="late" aria-hidden="true" />밀린 돈(계약 · 늦음)</li>
        )}
        {floorPct != null && <li><i className="deals-money-swatch" data-kind="floor" aria-hidden="true" />매달 정기 바닥</li>}
      </ul>
      <table className="deals-money-sr">
        <caption>{week ? "주별" : "월별"} 현금흐름 — 이번 {week ? "주" : "달"}부터</caption>
        <thead>
          <tr><th scope="col">기간</th><th scope="col">들어옴</th><th scope="col">밀린 돈</th><th scope="col">확실 예정</th><th scope="col">가능</th></tr>
        </thead>
        <tbody>
          {cols.map((col) => (
            <tr key={col.key}>
              <th scope="row">{col.carry ? "밀린 돈(지난 예상일)" : col.rangeLabel || col.label}{col.current ? (week ? " (이번 주)" : " (이번 달)") : ""}</th>
              <td>{formatWon(col.paid)}</td>
              <td>{formatWon(col.late)}</td>
              <td>{formatWon(col.sure)}</td>
              <td>{formatWon(col.maybe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ── 들어올 돈 목록 ─────────────────────────────────────────────────────────

// 입금 확인 — 금액·날짜, 금액이 예상과 다를 때만 차이 이유 한 줄(deal-payments.js markPaid와 같은 규칙).
function ConfirmForm({ row, onSubmit, onCancel }) {
  const [draft, setDraft] = React.useState(() => ({ paidAmount: String(row.amount || ""), paidAt: dateInputValue(new Date().toISOString()), paidNote: "" }));
  const entered = Math.round(Number(draft.paidAmount));
  const diff = Number.isFinite(entered) && entered > 0 ? entered - row.amount : 0;
  return (
    <form
      className="deals-form"
      aria-label="입금 확인"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ paidAmount: Number(draft.paidAmount) || row.amount, paidAt: isoFromDateInput(draft.paidAt), paidNote: draft.paidNote });
      }}
    >
      <label>
        <span>입금액</span>
        <input type="number" inputMode="numeric" min="0" className="hub-input" value={draft.paidAmount} autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, paidAmount: e.target.value }))} />
      </label>
      <label>
        <span>입금일</span>
        <input type="date" className="hub-input" value={draft.paidAt}
          onChange={(e) => setDraft((d) => ({ ...d, paidAt: e.target.value }))} />
      </label>
      {diff !== 0 && (
        <label className="deals-form__note">
          <span>차이 이유(선택) · 예상보다 <span className="mono">{formatSignedWon(diff)}</span></span>
          <input type="text" className="hub-input" value={draft.paidNote} maxLength={PAID_NOTE_MAX} placeholder="할인·축소·지연 등"
            onChange={(e) => setDraft((d) => ({ ...d, paidNote: e.target.value }))} />
        </label>
      )}
      <span className="deals-form__acts">
        <Button type="submit" size="xs" variant="secondary">입금 확인</Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>취소</Button>
      </span>
    </form>
  );
}

// 일시불 — 금액(거래 금액으로 채움) · 입금 예정일. 날짜가 있어야 일정이 된다.
function LumpSumForm({ row, onSubmit, onCancel }) {
  const [draft, setDraft] = React.useState(() => ({ amount: row.amount ? String(row.amount) : "", at: "" }));
  const amount = Number(draft.amount);
  const at = isoFromDateInput(draft.at);
  const valid = Number.isFinite(amount) && amount > 0 && Boolean(at);
  return (
    <form
      className="deals-form"
      aria-label="일시불 일정"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit({ amount, at }); }}
    >
      <label>
        <span>금액</span>
        <input type="number" inputMode="numeric" min="0" className="hub-input" value={draft.amount} autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
      </label>
      <label>
        <span>입금 예정일</span>
        <input type="date" className="hub-input" value={draft.at}
          onChange={(e) => setDraft((d) => ({ ...d, at: e.target.value }))} />
      </label>
      <span className="deals-form__acts">
        <Button type="submit" size="xs" variant="secondary" disabled={!valid}>일시불 저장</Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>취소</Button>
      </span>
    </form>
  );
}

// 이름 옆 작은 글자 — 방법(일시불 · ↻ 매달 N일 · 회차), 일정이 없으면 그 사정("계약 · 일정 없음" ·
// "최종미팅 · 9/22 지남")을 대신 말한다.
function rowHint(row) {
  return row.note || row.method || "";
}

function MoneyRow({ row, org, rail, selected, form, onOpen, onForm, onConfirm, onLumpSum, onRecurring }) {
  const late = row.group === "late";
  const sure = row.certainty === "sure";
  const stop = (e) => e.stopPropagation();
  let action = null;
  if (row.action === "confirm") {
    action = <Button size="xs" variant="secondary" aria-expanded={form === "confirm"} onClick={() => onForm(form === "confirm" ? null : "confirm")}>입금 확인</Button>;
  } else if (row.action === "dates") {
    action = <Button size="xs" variant="ghost" onClick={() => onOpen(false, false)}>날짜 · 금액</Button>;
  } else if (row.action === "redate") {
    action = <Button size="xs" variant="ghost" icon="calendar" onClick={() => onOpen(false, true)}>날짜 다시</Button>;
  } else if (row.action === "schedule") {
    action = (
      <>
        <Button size="xs" variant="secondary" aria-expanded={form === "lump"} onClick={() => onForm(form === "lump" ? null : "lump")}>일시불</Button>
        <Button size="xs" variant="ghost" aria-expanded={form === "recurring"} onClick={() => onForm(form === "recurring" ? null : "recurring")}>매달</Button>
      </>
    );
  }
  const hint = rowHint(row);
  return (
    <li
      className="hub-row deals-money-row"
      data-deal-row={row.dealId}
      data-group={row.group}
      data-certainty={row.certainty}
      data-rail={rail ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      onClick={() => onOpen(false, false)}
    >
      <span className="mono deals-money-row__d">{row.dateLabel || "—"}</span>
      <span className="deals-money-row__who">
        {/* 행은 버튼이 아니다 — 거래 이름 버튼이 키보드·스크린리더 경로, 행 클릭은 마우스 지름길. */}
        <button type="button" className="deals-money-row__org" aria-pressed={selected}
          onClick={(e) => { e.stopPropagation(); onOpen(e.detail === 0, false); }}>
          {org}
        </button>
        {hint && <small className="deals-money-row__hint">{hint}</small>}
        {late && (
          <small className="deals-money-row__late">
            <Iconed name="clock" size={11} /> <span className="num">{row.daysLate}</span>일 늦음
          </small>
        )}
        {!sure && <span className="deals-money-tag" data-certainty="maybe">가능</span>}
      </span>
      <span className="mono deals-money-row__amt" data-certainty={row.certainty} data-unknown={row.hasAmount ? undefined : "true"}>
        {row.hasAmount ? fullWon(row.amount) : "금액 미정"}
      </span>
      <span className="deals-money-row__act" onClick={stop}>{action}</span>
      {form && (
        <div className="deals-money-row__form" onClick={stop}>
          {form === "confirm" && <ConfirmForm row={row} onCancel={() => onForm(null)} onSubmit={(fields) => { onConfirm(fields); onForm(null); }} />}
          {form === "lump" && <LumpSumForm row={row} onCancel={() => onForm(null)} onSubmit={(fields) => { onLumpSum(fields); onForm(null); }} />}
          {form === "recurring" && (
            <RecurringForm
              idPrefix={`money-rec-${row.dealId}`}
              initial={{ amount: row.amount || "", day: new Date().getDate(), startMonth: paymentMonthKey(new Date()) }}
              submitLabel="매달 저장"
              onCancel={() => onForm(null)}
              onSubmit={(plan) => { onRecurring(plan); onForm(null); }}
            />
          )}
        </div>
      )}
    </li>
  );
}

export function MoneyList({ model, describe, selectedDealId, onOpen, onConfirm, onLumpSum, onRecurring }) {
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [active, setActive] = React.useState(null); // { key, form }
  return (
    <section className="fx-card deals-money-list" aria-labelledby="deals-money-list-title">
      <h3 id="deals-money-list-title" className="fx-eyebrow">들어올 돈</h3>
      {model.groups.map((group) => {
        if (!group.items.length) return null;
        const open = expanded.has(group.key);
        const shown = group.preview && !open ? group.items.slice(0, group.preview) : group.items;
        const rest = group.items.slice(shown.length);
        const restSure = rest.filter((r) => r.certainty === "sure").reduce((s, r) => s + r.amount, 0);
        const restMaybe = rest.filter((r) => r.certainty === "maybe").reduce((s, r) => s + r.amount, 0);
        const total = sumNotation(group.sure, group.maybe);
        const overBudget = group.key === "late" && model.lateCount > MAX_DANGER_RAILS;
        return (
          <div key={group.key} className="deals-money-grp" data-group={group.key}>
            <div className="deals-money-grp__head">
              <h4 id={`deals-money-grp-${group.key}`}>
                {group.label}
                {overBudget && <span className="deals-money-grp__count" role="status"> · <span className="num">{model.lateCount}</span>건</span>}
              </h4>
              {total && <b className="mono">{total}</b>}
            </div>
            <ul className="deals-money-rows" aria-labelledby={`deals-money-grp-${group.key}`}>
              {shown.map((row) => {
                const { org } = describe(row.deal);
                return (
                  <MoneyRow
                    key={row.key}
                    row={row}
                    org={org}
                    rail={model.railKeys.has(row.key)}
                    selected={selectedDealId === row.dealId}
                    form={active?.key === row.key ? active.form : null}
                    onForm={(form) => setActive(form ? { key: row.key, form } : null)}
                    onOpen={(viaKeyboard, dates) => onOpen(row.dealId, viaKeyboard, dates)}
                    onConfirm={(fields) => onConfirm(row, fields)}
                    onLumpSum={(fields) => onLumpSum(row, fields)}
                    onRecurring={(plan) => onRecurring(row, plan)}
                  />
                );
              })}
            </ul>
            {group.preview && group.items.length > group.preview && (
              <Button
                variant="ghost"
                size="xs"
                className="deals-money-more"
                aria-expanded={open}
                onClick={() => setExpanded((cur) => {
                  const next = new Set(cur);
                  if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                  return next;
                })}
              >
                {open ? "접기" : `${rest.length}건 더 · ${sumNotation(restSure, restMaybe) || "금액 미정"} 펼치기`}
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ── 호스트 — 차트 · 목록 · 하단 독 · 연락 기록 ─────────────────────────────────

export function DealsMoney({
  model,
  deals = [],
  stages,
  ledger,
  syncState,
  selectedId,
  onSelect,
  onMoveDate,
  onAdvanceStage,
  onEdit,
  onCreate,
  canCreate = true,
  onNavigate,
  onReload,
  onUpdatePayments,
  onUpdateRecurring,
}) {
  const toast = useToast();
  const [record, setRecord] = React.useState(null); // { target, preset?, draft?, error? }
  const [openDates, setOpenDates] = React.useState(false);
  const dockPrimaryRef = React.useRef(null);
  const focusDockRef = React.useRef(false);

  const contactByCompany = React.useMemo(() => {
    const map = new Map();
    for (const contact of ledger?.contacts || []) {
      if (contact.companyId && !map.has(contact.companyId)) map.set(contact.companyId, contact);
    }
    return map;
  }, [ledger?.contacts]);

  const describe = React.useCallback((deal) => {
    const org = deal.companyName || deal.name || "이름 없는 거래";
    const contact = deal.companyId ? contactByCompany.get(deal.companyId) : null;
    const person = contact ? [contact.name, contact.title].filter(Boolean).join(" ") : null;
    const who = [person, deal.name && deal.name !== org ? deal.name : null].filter(Boolean).join(" · ");
    return { org, who };
  }, [contactByCompany]);

  const selectedItem = React.useMemo(() => {
    if (selectedId == null) return null;
    const deal = (Array.isArray(deals) ? deals : []).find((d) => d.id === selectedId);
    return deal ? dealDockItem(deal, { stages }) : null;
  }, [deals, selectedId, stages]);
  const customerKey = selectedItem ? dealCustomerKey(selectedItem.deal, { leads: ledger?.leads, accounts: ledger?.accounts }) : null;

  const closeDock = React.useCallback((restoreFocus = false) => {
    const id = selectedId;
    onSelect(null);
    setOpenDates(false);
    if (!restoreFocus || id == null || typeof document === "undefined") return;
    requestAnimationFrame(() => {
      document.querySelector(`[data-deal-row="${CSS.escape(String(id))}"] .deals-money-row__org`)?.focus();
    });
  }, [onSelect, selectedId]);

  // 같은 거래의 행을 다시 누르면 닫는다. "날짜 다시"는 예상일 바꾸기를 펼친 채로 연다.
  const openDeal = (dealId, viaKeyboard, dates = false) => {
    if (selectedId === dealId && !dates) {
      closeDock(viaKeyboard);
      return;
    }
    focusDockRef.current = viaKeyboard;
    setOpenDates(Boolean(dates));
    onSelect(dealId);
  };

  // 키보드로 연 독은 첫 행동(연락 기록)으로 초점을 옮긴다. 마우스로 연 독은 초점을 뺏지 않는다.
  React.useEffect(() => {
    if (!selectedItem || !focusDockRef.current) return;
    focusDockRef.current = false;
    requestAnimationFrame(() => dockPrimaryRef.current?.focus());
  }, [selectedItem]);

  const openRecord = React.useCallback((item, preset) => {
    if (isLocalId(item.deal.id)) {
      toast.info("거래를 저장한 뒤 기록할 수 있어요.");
      return;
    }
    const { org } = describe(item.deal);
    setRecord({
      target: { kind: "deal", id: item.deal.id, name: org, companyId: item.deal.companyId || null },
      preset: preset || null,
    });
  }, [describe, toast]);

  // R — 독이 열려 있을 때 연락 기록.
  React.useEffect(() => {
    if (!selectedItem || record) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "r" && e.key !== "R") return;
      if (shouldYieldKeys()) return;
      e.preventDefault();
      openRecord(selectedItem);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItem, record, openRecord]);

  // 독 바깥을 누르면 닫는다. 행·독·드로어/팔레트(dialog)·토스트 안의 클릭은 제외.
  React.useEffect(() => {
    if (!selectedItem) return undefined;
    const onDown = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (target.closest(".deals-tl-dock, [data-deal-row], .hub-toast-viewport")) return;
      onSelect(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selectedItem, onSelect]);

  // ── 목록의 빠른 입력 → Deals의 지연 쓰기(낙관 반영 · 되돌리기 · 실패하면 되돌리고 명명) ──
  const confirmRow = (row, fields) => {
    const { org } = describe(row.deal);
    const next = row.kind === "recurring"
      ? markRecurringPaid(row.deal, row.recurringMonth, fields)
      : markPaid(row.deal, row.paymentId, fields);
    const what = row.kind === "recurring" ? `${Number(String(row.recurringMonth).slice(5))}월 정기` : row.method && row.kind === "installment" ? row.method : "";
    onUpdatePayments?.(row.dealId, next, `${org}${what ? ` ${what}` : ""} 입금을 확인했습니다`);
  };
  const lumpSumRow = (row, { amount, at }) => {
    const { org } = describe(row.deal);
    onUpdatePayments?.(row.dealId, scheduleLumpSum(row.deal, { amount, at }), `${org} · 일시불 ${formatWon(amount)} 일정을 잡았습니다`);
  };
  const recurringRow = (row, plan) => {
    const { org } = describe(row.deal);
    onUpdateRecurring?.(row.dealId, plan, `${org} · 매달 ${plan.day}일 ${formatWon(plan.amount)} 정기를 잡았습니다`);
  };

  let body;
  if (!model.hasAny) {
    body = syncState === "preview" ? (
      <div className="fx-card deals-money-empty">
        <TruthBadge state="preview" />
        <p>Supabase가 연결되지 않아 거래 기록을 읽지 않았어요. 연결되면 들어올 돈과 현금흐름이 여기에 쌓입니다.</p>
      </div>
    ) : (
      <div className="fx-card deals-money-empty">
        <EmptyState
          icon="deals"
          title="들어올 돈이 아직 없어요"
          description="거래에 금액과 날짜를 적으면 확실(계약) · 가능(계약 전)으로 나뉘어 언제 들어오는지 보입니다."
          action={canCreate ? <Button variant="secondary" size="sm" icon="plus" onClick={onCreate}>거래 등록</Button> : undefined}
          style={{ minHeight: 180 }}
        />
      </div>
    );
  } else {
    // 시안 B(운영자 2026-09-26): 차트와 목록은 한 장의 판 안에서 선으로만 나뉜다.
    body = (
      <div className="fx-card deals-money-sheet">
        <CashflowChart model={model} />
        <MoneyList
          model={model}
          describe={describe}
          selectedDealId={selectedId}
          onOpen={openDeal}
          onConfirm={confirmRow}
          onLumpSum={lumpSumRow}
          onRecurring={recurringRow}
        />
      </div>
    );
  }

  return (
    <div className="deals-money" data-dock-open={selectedItem ? "true" : undefined}>
      {body}

      {selectedItem && (
        <DealDock
          item={selectedItem}
          stages={stages}
          describe={describe}
          customerKey={customerKey}
          primaryRef={dockPrimaryRef}
          openDates={openDates}
          onClose={closeDock}
          onRecord={() => openRecord(selectedItem)}
          onAdvance={(stageKey) => onAdvanceStage(selectedItem.deal.id, stageKey)}
          onMoveDate={(iso, dateLabel) => {
            const { org } = describe(selectedItem.deal);
            onMoveDate(selectedItem.deal.id, iso, `${org} · 예상일 ${iso ? `→ ${dateLabel}` : "미정으로"}`);
          }}
          onEdit={() => onEdit(selectedItem.deal.id)}
          onOpenCustomer={() => onNavigate?.(`dashboard/revenue/customers?customer=${encodeURIComponent(customerKey)}`)}
          onUpdatePayments={(next, label) => onUpdatePayments?.(selectedItem.deal.id, next, label)}
          onUpdateRecurring={(next, label) => onUpdateRecurring?.(selectedItem.deal.id, next, label)}
        />
      )}

      {record && (
        <ContactRecordDrawer
          target={record.target}
          preset={record.preset || undefined}
          draft={record.draft || null}
          initialError={record.error || ""}
          onSaved={() => { window.setTimeout(() => onReload?.(), UNDO_WINDOW_MS + 250); }}
          onPersisted={() => toast.success(`기록됨 · ${record.target.name}`)}
          onFailed={({ message, form }) => {
            toast.error(`기록하지 못했습니다 · ${record.target.name} — ${message}`);
            setRecord((cur) => cur || { ...record, draft: form, error: message });
          }}
          onClose={() => setRecord(null)}
        />
      )}
    </div>
  );
}

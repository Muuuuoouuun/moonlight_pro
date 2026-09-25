"use client";

// 거래 탭의 "언제" 보기(기본)·"결제" 보기·"지역" 보기 — 운영자 승인 목업 3(2026-09-24)·05 A안(2026-09-25).
// 언제: 확실성 리본 · 멈춘 거래 줄 · 시간 칸(이번 주/다음 주/나중에/날짜 미정) · 카드 선택 시 하단 독.
// 결제: 월별 "예상했던 돈 → 들어온 돈" 막대 · 딜별 결제 표 — 행을 누르면 같은 하단 독이 그 거래로 열린다.
// "단계" 보기(기존 칸반)는 pages/revenue.jsx의 Deals가 그대로 그린다. 상태(딜 목록·낙관 반영·
// 되돌리기·편집 드로어·키보드 선택·결제 보기의 달)는 Deals가 소유하고, 여기는 그리기와 이 보기 전용
// 상호작용만 맡는다. 판정은 lib/deal-timeline.js(칸·확실성·약속·멈춤·예상일 프리셋)와
// lib/deal-payment-plan.js(달별 계획·확정·표 행)가 소유한다.

import React from "react";
import { Button, CertaintyBadge, EmptyState, IconButton, Kbd, LifecycleBadge, Skeleton, TruthBadge, useToast } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { ContactRecordDrawer } from "../contact-record-form";
import { UNDO_WINDOW_MS } from "../use-undoable-action";
import { STALLED_DAYS } from "@/lib/deal-stages";
import {
  MAX_DANGER_RAILS,
  closeDatePresets,
  dateInputValue,
  dealCustomerKey,
  dealDockItem,
  formatDayLabel,
  formatSignedWon,
  formatWon,
  isoFromDateInput,
  kstDayNumber,
  laneDropDate,
  sameCloseDay,
} from "@/lib/deal-timeline";
import {
  PAID_NOTE_MAX,
  addInstallment,
  cancelPayment,
  dealExpectedTotal,
  dealPaidTotal,
  effectivePayments,
  markPaid,
  updatePayment,
} from "@/lib/deal-payments";
import { targetProgress } from "@/lib/revenue-target";
import "./deals-timeline.css";

// 지역 보기는 기존 매출 히트맵을 그대로 쓴다. 지도 모양 데이터가 커서 정적 import로 거래 청크에
// 끌어오지 않고, 보기를 고를 때만 불러온다(히트맵 모듈도 ./revenue를 import하는 순환을 피한다).
const RevenueHeatmapView = React.lazy(() => import("./revenue-heatmap").then((m) => ({ default: m.RevenueHeatmap })));

const CERTAINTY_MARK = { paid: "✓", confirmed: "●", recommended: "◇", unknown: "?" };
const STALL_PILL_LIMIT = 4;

// 입력 중이거나 드로어·팔레트 같은 레이어가 떠 있으면 페이지 단축키는 양보한다
// (use-crm-keyboard.js의 shouldYield와 같은 규칙).
function shouldYieldKeys() {
  if (typeof document === "undefined") return true;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
  return Boolean(document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]'));
}

const isLocalId = (id) => String(id).toLowerCase().startsWith("local-");

export function DealsRegionView({ onNavigate }) {
  return (
    <div className="deals-region">
      <React.Suspense fallback={<Skeleton lines={4} height={48} label="지역 보기 불러오는 중" />}>
        <RevenueHeatmapView onNavigate={onNavigate} embedded />
      </React.Suspense>
    </div>
  );
}

// 히어로의 "목표 정하기" 인라인 편집 — 없으면 조용한 텍스트 버튼, 있으면 진행 문장 + 수정.
// 저장은 Deals(revenue.jsx)가 소유한 onSave(amount) 프라미스가 처리(§8.1 저장 봉투와 같은
// {ok} 계약). 이 컴포넌트는 입력만 맡고 목표값의 출처(workspaces.meta)는 모른다.
export function RevenueTargetControl({ targetsKnown, progress, monthLabel, saving, onSave }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(progress ? String(progress.target) : "");

  if (!targetsKnown) return null; // 읽기 실패 — 미정처럼 보이게 하지 않는다(정직성 규칙)

  if (!open) {
    return progress ? (
      <button type="button" className="deals-hero__target" onClick={() => { setValue(String(progress.target)); setOpen(true); }}>
        목표 <span className="mono">{formatWon(progress.target)}</span>
        {progress.reached ? (
          <> · 달성했어요</>
        ) : (
          <> · 남은 <span className="stat">{formatWon(progress.remaining)}</span>{progress.coveredByExpected ? " · 예상대로면 채워요" : ""}</>
        )}
        <Iconed name="edit" size={11} />
      </button>
    ) : (
      <button type="button" className="deals-hero__target deals-hero__target--set" onClick={() => { setValue(""); setOpen(true); }}>
        {monthLabel} 목표 정하기
      </button>
    );
  }

  return (
    <form
      className="deals-hero__target-form"
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
      <Button type="submit" size="xs" variant="primary" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button>
      <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
    </form>
  );
}

function CertaintyRibbon({ month, filter, onToggle, target }) {
  const drawn = month.segments.filter((segment) => segment.amount > 0);
  const barTotal = drawn.reduce((sum, segment) => sum + segment.amount, 0);
  // 목표선은 지금 막대에 보이는 금액(입금됨+예상 전부)을 분모로 위치를 잡는다 — 목표가
  // 그 총합을 넘으면 막대 오른쪽 끝(100%)에 선을 둔다("여기까지 채워도 모자람"이라는 뜻).
  const targetPct = target != null && barTotal > 0 ? Math.min(100, (target / barTotal) * 100) : null;
  return (
    <section className="fx-card deals-tl-ribbon" aria-label={`${month.monthLabel} 확실성별 금액`}>
      {drawn.length > 0 ? (
        // 막대는 금액 비례의 그림이다. 거르기는 아래 라벨 버튼이 맡고(키보드·스크린리더),
        // 막대 조각 클릭은 같은 동작의 마우스 지름길이다.
        <div className="deals-tl-bar" data-filtered={filter ? "true" : undefined} aria-hidden="true">
          {drawn.map((segment) => (
            <span
              key={segment.key}
              className="deals-tl-bar__seg"
              data-certainty={segment.key}
              data-on={filter === segment.key ? "true" : undefined}
              style={{ flexGrow: segment.amount }}
              title={`${segment.label} ${formatWon(segment.amount)}`}
              onClick={() => onToggle(segment.key)}
            />
          ))}
          {targetPct != null && (
            <span className="deals-tl-bar__target" style={{ left: `${targetPct}%` }} title={`목표 ${formatWon(target)}`} />
          )}
        </div>
      ) : (
        <div className="deals-tl-bar deals-tl-bar--empty" aria-hidden="true" />
      )}
      <div className="deals-tl-legend" role="group" aria-label="확실성으로 거르기">
        {month.segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className="deals-tl-legend__item"
            data-certainty={segment.key}
            aria-pressed={filter === segment.key}
            onClick={() => onToggle(segment.key)}
          >
            <span className="deals-tl-legend__label">
              <span className="deals-tl-swatch" data-certainty={segment.key} aria-hidden="true" />
              {segment.key !== "confirmed" && <span aria-hidden="true">{CERTAINTY_MARK[segment.key]} </span>}
              {segment.label}
            </span>
            <span className="stat deals-tl-legend__amount">{formatWon(segment.amount)}</span>
            <span className="deals-tl-legend__count">{segment.count}건</span>
          </button>
        ))}
      </div>
      <p className="deals-tl-ribbon__caption">
        예상일이 {month.monthLabel}인 거래 <span className="num">{month.count}</span>건 기준
        {filter && <> · 라벨을 다시 누르면 전부 보여요</>}
      </p>
    </section>
  );
}

function StalledStrip({ items, describe, onAsk }) {
  const shown = items.slice(0, STALL_PILL_LIMIT);
  const rest = items.length - shown.length;
  return (
    <section className="deals-tl-stall" aria-label="멈춘 거래">
      <Iconed name="pause" size={15} style={{ color: "var(--fg-muted)" }} />
      <p className="deals-tl-stall__text">
        멈춘 거래 <span className="num">{items.length}</span>
        <small>{STALLED_DAYS}일 이상 기록이 없어요</small>
      </p>
      <ul className="deals-tl-stall__list">
        {shown.map((item) => (
          <li key={item.id} className="deals-tl-pill">
            <span>{describe(item.deal).org} · <span className="mono">{item.deal.age}일</span></span>
            <Button variant="ghost" size="xs" disabled={isLocalId(item.id)} onClick={() => onAsk(item)}>한 줄 물어보기</Button>
          </li>
        ))}
        {rest > 0 && <li className="deals-tl-stall__more">외 <span className="num">{rest}</span>건</li>}
      </ul>
    </section>
  );
}

function StageSteps({ stages, index }) {
  return (
    <span className="deals-tl-steps" aria-hidden="true">
      {stages.map((stage, i) => (
        <i key={stage.key} data-step={i < index ? "done" : i === index ? "current" : undefined} />
      ))}
    </span>
  );
}

function DealTimeCard({ item, stages, describe, selected, rail, dragging, onActivate, onDragStart, onDragEnd }) {
  const { deal, certainty, lifecycle, promise } = item;
  const { org, who } = describe(deal);
  const amountLabel = item.amount ? formatWon(item.amount) : "₩ ?";
  const promiseLabel = promise ? `다음 약속 ${promise.text}${promise.dueLabel ? ` ${promise.dueLabel}` : ""}` : "다음 약속 없음";
  const installments = item.installmentTotal > 1;
  // 결제 일정이 있고 이미 일부 입금됐으면 카드에 "예정 · 입금"을 압축해 보여준다 — 이 카드의
  // 금액(item.amount)은 미입금 이 회차뿐이라 딜 전체 진행을 놓치지 않게.
  const paidTotal = dealPaidTotal(deal);
  const expectedTotal = dealExpectedTotal(deal);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      className="deals-tl-card"
      data-deal-card={item.id}
      data-certainty={certainty.key}
      data-selected={selected ? "true" : undefined}
      data-rail={rail ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      aria-pressed={selected}
      aria-label={`${org}, ${item.amount ? amountLabel : "금액 미정"}${installments ? `, ${item.installmentTotal}회 중 ${item.installmentIndex}회` : ""}, ${certainty.label}${lifecycle ? ` · ${lifecycle.label}` : ""}, ${item.stageLabel}, ${promiseLabel}`}
      onClick={() => onActivate(item, false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate(item, true);
        }
      }}
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
    >
      <div className="deals-tl-card__top">
        <div className="deals-tl-card__id">
          <div className="deals-tl-card__org">{org}</div>
          {who && <div className="deals-tl-card__who">{who}</div>}
          {(installments || item.paymentLabel) && (
            <div className="deals-tl-card__installment mono">
              {item.paymentLabel || `${item.installmentTotal}회 중 ${item.installmentIndex}회`}
            </div>
          )}
        </div>
        <span className="stat deals-tl-card__amount" data-unknown={item.amount ? undefined : "true"}>{amountLabel}</span>
      </div>
      {paidTotal > 0 && (
        <p className="deals-tl-card__paidline">
          <span className="mono">{formatWon(expectedTotal)}</span> 예정 · <span className="mono">{formatWon(paidTotal)}</span> 입금
        </p>
      )}
      <StageSteps stages={stages} index={item.stageIndex} />
      <div className="deals-tl-card__row">
        <span className="deals-tl-card__badges">
          <CertaintyBadge state={certainty.key} label={certainty.label} />
          {lifecycle && <LifecycleBadge state={lifecycle.key} label={lifecycle.label} />}
        </span>
        <span className="deals-tl-card__stage">{item.stageLabel}</span>
      </div>
      <div className="deals-tl-card__next">
        {promise ? (
          <>
            <span className="deals-tl-card__promise">{promise.text}</span>
            {promise.dueLabel && (
              <span className={promise.overdue ? "deals-tl-card__late" : "mono deals-tl-card__due"}>
                {promise.overdue && !rail && <Iconed name="clock" size={11} />}
                {promise.dueLabel}
              </span>
            )}
          </>
        ) : (
          <span className="deals-tl-card__none">다음 약속 없음</span>
        )}
      </div>
      {item.closeOverdue && (
        <div className="deals-tl-card__slip">
          <Iconed name="clock" size={11} /> 예상일 {item.closeLabel} 지남
        </div>
      )}
    </div>
  );
}

// 결제 — 딜 하나에 여러 예상 입금(계약금·잔금 등)을 걸고, 입금됐을 때 예상치와 확정치를
// 나눠 기록한다(운영자 2026-09-24 결정, lib/deal-payments.js). 한 번에 한 행만 편집 모드다.
function DealPaymentsBlock({ deal, onUpdatePayments }) {
  const payments = React.useMemo(() => effectivePayments(deal), [deal]);
  const expectedTotal = dealExpectedTotal(deal);
  const paidTotal = dealPaidTotal(deal);
  const [active, setActive] = React.useState(null); // { id, mode: 'confirm' | 'edit' }
  const [draft, setDraft] = React.useState({});
  // 새 결제 일정은 로컬 폼에서 금액을 채운 뒤에만 저장한다 — 빈(₩0) 행을 먼저 저장하면
  // normalizePayment가 그 행을 버려 편집할 틈도 없이 사라진다(2026-09-25 통합 검증).
  const [adding, setAdding] = React.useState(null); // { label, expectedAmount, expectedAt } | null
  React.useEffect(() => { setActive(null); setAdding(null); }, [deal.id]);

  const startConfirm = (payment) => {
    setActive({ id: payment.id, mode: "confirm" });
    setDraft({ paidAmount: String(payment.expectedAmount), paidAt: dateInputValue(new Date().toISOString()), paidNote: "" });
  };
  const startEdit = (payment) => {
    setActive({ id: payment.id, mode: "edit" });
    setDraft({ label: payment.label || "", expectedAmount: String(payment.expectedAmount || ""), expectedAt: dateInputValue(payment.expectedAt) });
  };

  const addAmount = Number(adding?.expectedAmount);
  const canAdd = Number.isFinite(addAmount) && addAmount > 0;
  const saveNew = () => {
    if (!canAdd) return;
    // 새 결제는 만들 때의 금액·날짜가 곧 처음 계획(planned*)이다 — addInstallment가 같이 적는다.
    const rows = addInstallment(deal, {
      label: adding.label || null,
      expectedAmount: addAmount,
      expectedAt: adding.expectedAt ? isoFromDateInput(adding.expectedAt) : null,
    });
    onUpdatePayments(rows, payments.length ? "결제 일정을 나눴습니다" : "결제 일정을 추가했습니다");
    setAdding(null);
  };

  return (
    <div className="deals-pay">
      <div className="deals-pay__head">
        <span className="fx-eyebrow">결제</span>
        {payments.length > 0 ? (
          <span className="deals-pay__summary">
            <span className="stat">{formatWon(expectedTotal)}</span> 예정
            {paidTotal > 0 && <> · <span className="stat deals-pay__paid">{formatWon(paidTotal)}</span> 입금</>}
          </span>
        ) : (
          <span className="deals-pay__summary">금액이 아직 없어요 — 대략이라도 적어 두면 이번 달 예상에 들어갑니다</span>
        )}
      </div>
      <ul className="deals-pay__list">
        {payments.map((payment, i) => {
          const rowLabel = payment.label || (payments.length > 1 ? `${i + 1}회` : "전액");
          if (active?.id === payment.id && active.mode === "confirm") {
            // 입금액이 예상과 다를 때만 "차이 이유" 한 줄을 연다 — 같으면 묻지 않고 저장도 안 한다.
            const enteredPaid = Math.round(Number(draft.paidAmount));
            const paidDiff = Number.isFinite(enteredPaid) && enteredPaid > 0 ? enteredPaid - payment.expectedAmount : 0;
            return (
              <li key={payment.id} className="deals-pay-row deals-pay-row--form">
                <span className="deals-pay-row__label">{rowLabel} 입금 확인</span>
                <span className="deals-pay-row__fields">
                  <label>
                    <span>입금액</span>
                    <input type="number" inputMode="numeric" min="0" className="hub-input" value={draft.paidAmount}
                      onChange={(e) => setDraft((d) => ({ ...d, paidAmount: e.target.value }))} />
                  </label>
                  <label>
                    <span>입금일</span>
                    <input type="date" className="hub-input" value={draft.paidAt}
                      onChange={(e) => setDraft((d) => ({ ...d, paidAt: e.target.value }))} />
                  </label>
                  {paidDiff !== 0 && (
                    <label className="deals-pay-row__note">
                      <span>차이 이유(선택) · 예상보다 <span className="mono">{formatSignedWon(paidDiff)}</span></span>
                      <input type="text" className="hub-input" value={draft.paidNote || ""} maxLength={PAID_NOTE_MAX}
                        placeholder="할인·축소·지연 등"
                        onChange={(e) => setDraft((d) => ({ ...d, paidNote: e.target.value }))} />
                    </label>
                  )}
                </span>
                <span className="deals-pay-row__acts">
                  <Button
                    size="xs" variant="primary"
                    onClick={() => {
                      onUpdatePayments(
                        markPaid(deal, payment.id, {
                          paidAmount: Number(draft.paidAmount) || payment.expectedAmount,
                          paidAt: isoFromDateInput(draft.paidAt),
                          paidNote: draft.paidNote,
                        }),
                        `${rowLabel} 입금을 확인했습니다`,
                      );
                      setActive(null);
                    }}
                  >확인</Button>
                  <Button size="xs" variant="ghost" onClick={() => setActive(null)}>취소</Button>
                </span>
              </li>
            );
          }
          if (active?.id === payment.id && active.mode === "edit") {
            return (
              <li key={payment.id} className="deals-pay-row deals-pay-row--form">
                <span className="deals-pay-row__fields">
                  <label>
                    <span>이름(선택)</span>
                    <input type="text" className="hub-input" value={draft.label} placeholder="계약금 등" maxLength={40}
                      onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
                  </label>
                  <label>
                    <span>예상 금액</span>
                    <input type="number" inputMode="numeric" min="0" className="hub-input" value={draft.expectedAmount}
                      onChange={(e) => setDraft((d) => ({ ...d, expectedAmount: e.target.value }))} />
                  </label>
                  <label>
                    <span>예상일</span>
                    <input type="date" className="hub-input" value={draft.expectedAt}
                      onChange={(e) => setDraft((d) => ({ ...d, expectedAt: e.target.value }))} />
                  </label>
                </span>
                <span className="deals-pay-row__acts">
                  <Button
                    size="xs" variant="primary"
                    onClick={() => {
                      onUpdatePayments(
                        updatePayment(deal, payment.id, {
                          label: draft.label,
                          expectedAmount: Number(draft.expectedAmount) || payment.expectedAmount,
                          expectedAt: draft.expectedAt ? isoFromDateInput(draft.expectedAt) : null,
                        }),
                        `${rowLabel} 결제 정보를 수정했습니다`,
                      );
                      setActive(null);
                    }}
                  >저장</Button>
                  <Button size="xs" variant="ghost" onClick={() => setActive(null)}>취소</Button>
                  {payments.length > 1 && (
                    <Button
                      size="xs" variant="danger"
                      onClick={() => { onUpdatePayments(cancelPayment(deal, payment.id), `${rowLabel} 결제 일정을 취소했습니다`); setActive(null); }}
                    >일정 취소</Button>
                  )}
                </span>
              </li>
            );
          }
          const plannedDay = kstDayNumber(payment.plannedAt);
          const expectedDay = kstDayNumber(payment.expectedAt);
          const paidDiff = payment.status === "paid" ? payment.paidAmount - payment.expectedAmount : 0;
          return (
            <li key={payment.id} className="deals-pay-row" data-status={payment.status}>
              <span className="deals-pay-row__label">{rowLabel}</span>
              <span className="deals-pay-row__expected">
                <span className="mono">{formatWon(payment.expectedAmount)}</span>
                <span className="mono deals-pay-row__date">
                  {payment.expectedAt ? formatDayLabel(expectedDay) : "날짜 미정"}
                </span>
                {plannedDay !== expectedDay && (
                  <span className="mono deals-pay-row__was">원래 {plannedDay == null ? "미정" : formatDayLabel(plannedDay)}</span>
                )}
              </span>
              {payment.status === "paid" ? (
                <span className="deals-pay-row__paid">
                  <Iconed name="check" size={12} />
                  <span className="mono">{formatWon(payment.paidAmount)}</span>
                  <span className="mono deals-pay-row__date">{formatDayLabel(kstDayNumber(payment.paidAt))}</span>
                  {paidDiff !== 0 && (
                    <span className="deals-pay-row__diff">
                      <span className="mono">{formatSignedWon(paidDiff)}</span>
                      {payment.paidNote && <> · {payment.paidNote}</>}
                    </span>
                  )}
                </span>
              ) : payment.status === "cancelled" ? (
                <span className="deals-pay-row__cancelled">취소됨</span>
              ) : (
                <span className="deals-pay-row__acts">
                  <Button size="xs" variant="secondary" onClick={() => startConfirm(payment)}>입금 확인</Button>
                  <IconButton icon="edit" size={24} iconSize={12} tooltip="결제 편집" onClick={() => startEdit(payment)} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="deals-pay-row deals-pay-row--form">
          <span className="deals-pay-row__fields">
            <label>
              <span>이름(선택)</span>
              <input type="text" className="hub-input" value={adding.label} placeholder="계약금 등" maxLength={40}
                onChange={(e) => setAdding((d) => ({ ...d, label: e.target.value }))} />
            </label>
            <label>
              <span>예상 금액</span>
              <input type="number" inputMode="numeric" min="0" className="hub-input" value={adding.expectedAmount} autoFocus
                onChange={(e) => setAdding((d) => ({ ...d, expectedAmount: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveNew(); } }} />
            </label>
            <label>
              <span>예상일</span>
              <input type="date" className="hub-input" value={adding.expectedAt}
                onChange={(e) => setAdding((d) => ({ ...d, expectedAt: e.target.value }))} />
            </label>
          </span>
          <span className="deals-pay-row__acts">
            <Button size="xs" variant="primary" disabled={!canAdd} onClick={saveNew}>추가</Button>
            <Button size="xs" variant="ghost" onClick={() => setAdding(null)}>취소</Button>
          </span>
        </div>
      ) : (
        <Button
          variant="ghost" size="xs" icon="plus"
          onClick={() => { setActive(null); setAdding({ label: "", expectedAmount: "", expectedAt: dateInputValue(deal.closeAt) || "" }); }}
        >{payments.length ? "결제 일정 나누기" : "결제 일정 추가"}</Button>
      )}
    </div>
  );
}

function DealDock({ item, stages, describe, customerKey, primaryRef, onClose, onRecord, onAdvance, onMoveDate, onEdit, onOpenCustomer, onUpdatePayments }) {
  const [dateOpen, setDateOpen] = React.useState(false);
  const presets = React.useMemo(() => closeDatePresets(new Date()), []);
  const { deal, certainty, lifecycle, promise } = item;
  const { org } = describe(deal);
  const nextStage = stages[item.stageIndex + 1] || null;
  const local = isLocalId(item.deal.id);
  // 명시 결제 일정의 카드는 그 결제의 예상일을 옮긴다(딜의 예상일이 아니라) — 프리셋 활성·날짜 칸도 같은 값.
  const currentAt = item.explicitPayment ? item.expectedAt : deal.closeAt;
  React.useEffect(() => { setDateOpen(false); }, [item.id]);

  return (
    <section
      className="deals-tl-dock"
      role="region"
      aria-label={`선택한 거래 — ${org}`}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose(true);
      }}
    >
      <div className="deals-tl-dock__head">
        <b className="deals-tl-dock__org">{org}</b>
        <CertaintyBadge state={certainty.key} label={certainty.label} />
        {lifecycle && <LifecycleBadge state={lifecycle.key} label={lifecycle.label} />}
        <span className="stat deals-tl-dock__amount" data-unknown={item.amount ? undefined : "true"}>
          {item.amount ? formatWon(item.amount) : "₩ ?"}
        </span>
        <IconButton icon="edit" tooltip="거래 편집 (E)" onClick={onEdit} />
        <IconButton icon="x" tooltip="닫기 (Esc)" onClick={() => onClose(true)} />
      </div>
      <ol className="deals-tl-stepper" aria-label="단계">
        {stages.map((stage, i) => (
          <li
            key={stage.key}
            data-step={i < item.stageIndex ? "done" : i === item.stageIndex ? "current" : undefined}
            aria-current={i === item.stageIndex ? "step" : undefined}
          >
            <i aria-hidden="true" />
            <span>{stage.label}</span>
          </li>
        ))}
      </ol>
      <p className="deals-tl-dock__next">
        다음 약속 · <b>{promise?.text || "없음"}</b>
        {promise?.dueLabel && (
          <span className={promise.overdue ? "deals-tl-card__late" : "mono deals-tl-card__due"}> {promise.dueLabel}</span>
        )}
        <span className="deals-tl-dock__close"> · 예상일 <span className="mono">{item.closeLabel || "미정"}</span></span>
      </p>
      <div className="deals-tl-dock__acts">
        <Button ref={primaryRef} variant="primary" size="sm" disabled={local} title={local ? "거래를 저장한 뒤 기록할 수 있어요" : undefined} onClick={onRecord}>
          연락 기록 <Kbd>R</Kbd>
        </Button>
        {nextStage && (
          <Button variant="secondary" size="sm" onClick={() => onAdvance(nextStage.key)}>
            단계 올리기 ▸ {nextStage.label}
          </Button>
        )}
        <Button variant="ghost" size="sm" icon="calendar" aria-expanded={dateOpen} onClick={() => setDateOpen((open) => !open)}>
          예상일 바꾸기
        </Button>
        {customerKey && (
          <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={onOpenCustomer}>고객 열기</Button>
        )}
      </div>
      {dateOpen && (
        <div className="deals-tl-dock__dates" role="group" aria-label="예상일 바꾸기">
          {presets.map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              size="xs"
              active={preset.iso ? sameCloseDay(currentAt, preset.iso) : !currentAt}
              title={preset.dateLabel}
              onClick={() => onMoveDate(preset.iso, preset.dateLabel)}
            >
              {preset.label}
            </Button>
          ))}
          <label className="deals-tl-dock__date">
            <span>날짜</span>
            <input
              type="date"
              className="hub-input"
              defaultValue={dateInputValue(currentAt)}
              key={`${item.id}-${currentAt || "none"}`}
              onChange={(e) => {
                // 연도를 타이핑하는 중간값(0002-…)에 저장이 예약되지 않게 20xx만 받는다.
                if (!/^20\d{2}-/.test(e.target.value)) return;
                const iso = isoFromDateInput(e.target.value);
                if (iso) onMoveDate(iso, formatDayLabel(kstDayNumber(iso)));
              }}
            />
          </label>
        </div>
      )}
      {!local && <DealPaymentsBlock deal={deal} onUpdatePayments={onUpdatePayments} />}
    </section>
  );
}

// ── 결제 보기(운영자 2026-09-25 A안) ────────────────────────────────────────
// 월별 막대: 확정 = 꽉 찬 중립 채움(--fg) · 남은 예정 = 점선 윤곽(--surface-2) · 그 달에 예상했던
// 입금 = 1px 점선 가로 눈금. 이번 달은 Moonstone 점(현재 위치). 숫자는 막대 밑 직접 라벨로 말하고,
// 같은 내용을 스크린리더용 표로도 싣는다(막대 그림은 aria-hidden).

function planColumnLabels(m) {
  if (m.isPast && !m.recorded) {
    return { amount: "기록 이전", sub: null, plan: m.planned > 0 ? `예상 ${formatWon(m.planned)}` : null, delta: null };
  }
  if (m.isPast) {
    return {
      amount: formatWon(m.confirmed),
      sub: null,
      plan: m.planned > 0 ? `예상 ${formatWon(m.planned)}` : "예상 없음",
      delta: m.planned > 0 ? formatSignedWon(m.delta) : null,
    };
  }
  if (m.isCurrent) {
    return {
      amount: formatWon(m.confirmed),
      sub: m.remainingExpected > 0 ? `+${formatWon(m.remainingExpected)} 예정` : null,
      plan: m.planned > 0 ? `예상 ${formatWon(m.planned)}` : null,
      delta: null,
    };
  }
  return { amount: m.remainingExpected > 0 ? formatWon(m.remainingExpected) : "—", sub: null, plan: m.remainingExpected > 0 ? "예정" : null, delta: null };
}

function PaymentsChart({ board }) {
  const pct = (amount) => (board.max > 0 ? Math.max(0, Math.min(100, (amount / board.max) * 100)) : 0);
  return (
    <section className="fx-card deals-pm-chart" aria-labelledby="deals-pm-chart-title">
      <header className="deals-pm-head">
        <h3 id="deals-pm-chart-title" className="fx-eyebrow">월별 · 예상했던 돈과 들어온 돈</h3>
        <span className="deals-pm-hint">지난달은 확정, 이번 달부터는 예정</span>
      </header>
      <div className="deals-pm-scroll">
        <div className="deals-pm-cols" aria-hidden="true">
          {board.series.map((m) => {
            const labels = planColumnLabels(m);
            // 눈금은 지난달·이번 달만 — 앞으로의 달은 아직 계획이 곧 예정이라 겹쳐 그리면 소음이다.
            const showPlan = m.planned > 0 && (m.isPast || m.isCurrent);
            return (
              <div
                key={m.key}
                className="deals-pm-col"
                data-current={m.isCurrent ? "true" : undefined}
                data-selected={m.key === board.monthKey ? "true" : undefined}
              >
                <div className="deals-pm-stack">
                  {showPlan && <span className="deals-pm-plan" style={{ bottom: `${pct(m.planned)}%` }} />}
                  {m.remainingExpected > 0 && (
                    <span className="deals-pm-bar deals-pm-bar--expected" style={{ height: `${pct(m.remainingExpected)}%` }} />
                  )}
                  {m.confirmed > 0 && (
                    <span className="deals-pm-bar deals-pm-bar--confirmed" style={{ height: `${pct(m.confirmed)}%` }} />
                  )}
                </div>
                <span className="mono deals-pm-amount" data-unknown={m.confirmed == null && m.isPast ? "true" : undefined}>{labels.amount}</span>
                {labels.sub && <span className="mono deals-pm-sub">{labels.sub}</span>}
                {labels.plan && <span className="mono deals-pm-sub">{labels.plan}</span>}
                {labels.delta && <span className="mono deals-pm-sub">{labels.delta}</span>}
                <span className="deals-pm-label">
                  {m.isCurrent && <span className="deals-tl-now" />}
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="deals-pm-legend">
        <li><i className="deals-pm-swatch" data-kind="confirmed" aria-hidden="true" />들어온 돈(확정)</li>
        <li><i className="deals-pm-swatch" data-kind="expected" aria-hidden="true" />들어올 예정</li>
        <li><i className="deals-pm-swatch" data-kind="plan" aria-hidden="true" />그 달에 예상했던 입금</li>
      </ul>
      <table className="deals-pm-sr">
        <caption>월별 예상했던 입금과 들어온 돈</caption>
        <thead>
          <tr><th scope="col">달</th><th scope="col">들어온 돈</th><th scope="col">들어올 예정</th><th scope="col">예상했던 입금</th><th scope="col">차이</th></tr>
        </thead>
        <tbody>
          {board.series.map((m) => (
            <tr key={m.key}>
              <th scope="row">{m.label}{m.isCurrent ? " (이번 달)" : ""}</th>
              <td>{m.confirmed == null ? "기록 이전" : formatWon(m.confirmed)}</td>
              <td>{m.isPast ? "—" : formatWon(m.remainingExpected)}</td>
              <td>{formatWon(m.planned)}</td>
              <td>{m.delta == null ? "—" : formatSignedWon(m.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// 확정(입금) 칸 — 입금됐으면 ✓ 금액·날짜, 아니면 상태를 직접 말한다. 빨강은 받을 돈이 늦은 것뿐.
function PaymentStateCell({ row }) {
  if (row.paid) {
    return (
      <>
        <span className="mono deals-pm-money"><Iconed name="check" size={11} /> {formatWon(row.paid.amount)}</span>
        <span className="mono deals-pm-when">{row.paid.dayLabel ? `${row.paid.dayLabel} 입금` : "입금"}</span>
      </>
    );
  }
  if (row.state === "overdue") {
    return <span className="deals-pm-late"><Iconed name="clock" size={11} /> {row.daysLate}일 지남</span>;
  }
  const text = {
    slipped: `예상일 ${row.daysLate}일 지남`,
    unrecorded: "입금 기록 없음",
    lost: "거래 잃음",
    undated: "날짜 미정",
  }[row.state] || "대기";
  return <span className="deals-pm-wait">{text}</span>;
}

function PaymentDiffCell({ row }) {
  if (row.difference == null) return <span className="deals-pm-wait">—</span>;
  const timing = row.timing ? `${Math.abs(row.timing)}일 ${row.timing < 0 ? "빠름" : "늦음"}` : null;
  return (
    <>
      <span className="mono deals-pm-diff">{row.difference === 0 ? "0" : formatSignedWon(row.difference)}</span>
      {(row.paidNote || timing) && <span className="deals-pm-why">{row.paidNote || timing}</span>}
    </>
  );
}

function PaymentsTable({ board, describe, selectedDealId, onActivate, onMonth }) {
  const { summary } = board;
  return (
    <section className="fx-card deals-pm-table-card" aria-labelledby="deals-pm-table-title">
      <header className="deals-pm-head">
        <h3 id="deals-pm-table-title" className="fx-eyebrow">딜별 결제 · {board.monthLabel}</h3>
        <div className="deals-pm-step" role="group" aria-label="달 이동">
          <IconButton icon="chevronL" tooltip="이전 달" disabled={!board.prevKey} onClick={() => onMonth?.(board.prevKey)} />
          <span className="deals-pm-step__label" aria-live="polite">{board.monthLabel}</span>
          <IconButton icon="chevronR" tooltip="다음 달" disabled={!board.nextKey} onClick={() => onMonth?.(board.nextKey)} />
          {!board.isCurrentMonth && <Button variant="ghost" size="xs" onClick={() => onMonth?.(null)}>이번 달</Button>}
        </div>
        <span className="deals-pm-hint">확정이 예상과 다르면 차이와 이유 한 줄</span>
      </header>
      {(!board.recorded || summary.moved.count > 0 || board.overdueCount > MAX_DANGER_RAILS) && (
        <div className="deals-pm-notes">
          {!board.recorded && <TruthBadge state="partial" reason="결제 기록 시작 전 — 입금 여부를 모를 수 있어요" />}
          {summary.moved.count > 0 && (
            <span className="deals-pm-note">
              {board.monthLabel} 예상에서 뒤로 옮긴 <span className="num">{summary.moved.count}</span>건 · <span className="mono">{formatWon(summary.moved.amount)}</span>
            </span>
          )}
          {board.overdueCount > MAX_DANGER_RAILS && (
            <span className="deals-pm-late" role="status">
              <Iconed name="clock" size={12} /> 늦은 입금 <span className="num">{board.overdueCount}</span>건
            </span>
          )}
        </div>
      )}
      {board.rows.length === 0 ? (
        <EmptyState
          icon="deals"
          title={`${board.monthLabel}에 예상·입금된 결제가 없어요`}
          description="거래에 금액과 예상일을 적으면 그 달의 결제로 잡힙니다. 화살표로 다른 달을 볼 수 있어요."
          style={{ minHeight: 140 }}
        />
      ) : (
        <table className="deals-pm-table">
          <thead>
            <tr>
              <th scope="col">거래</th>
              <th scope="col">회차</th>
              <th scope="col" className="deals-pm-r">예상</th>
              <th scope="col" className="deals-pm-r">확정(입금)</th>
              <th scope="col" className="deals-pm-r">차이</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => {
              const { who } = describe(row.deal);
              const selected = selectedDealId === row.dealId;
              return (
                <tr
                  key={row.key}
                  className="hub-row deals-pm-row"
                  data-deal-row={row.dealId}
                  data-state={row.state}
                  data-rail={board.railKeys.has(row.key) ? "true" : undefined}
                  data-selected={selected ? "true" : undefined}
                  onClick={() => onActivate(row.dealId, false)}
                >
                  <td data-label="거래">
                    {/* 표의 행은 버튼이 아니다 — 거래 이름 버튼이 키보드·스크린리더 경로, 행 클릭은 마우스 지름길. */}
                    <button
                      type="button"
                      className="deals-pm-org"
                      aria-pressed={selected}
                      onClick={(e) => { e.stopPropagation(); onActivate(row.dealId, e.detail === 0); }}
                    >
                      {row.org}
                    </button>
                    {who && <small className="deals-pm-who">{who}</small>}
                  </td>
                  <td data-label="회차" className="deals-pm-inst">{row.installment.text}</td>
                  <td data-label="예상" className="deals-pm-r">
                    <span className="mono deals-pm-exp">{formatWon(row.expected.amount)}</span>
                    <span className="mono deals-pm-when">{row.expected.dayLabel ? `${row.expected.dayLabel} 예정` : "날짜 미정"}</span>
                    {row.expected.movedLabel && <span className="mono deals-pm-why">{row.expected.movedLabel}</span>}
                    {row.expected.amountChanged && <span className="mono deals-pm-why">원래 {formatWon(row.planned.amount)}</span>}
                  </td>
                  <td data-label="확정(입금)" className="deals-pm-r"><PaymentStateCell row={row} /></td>
                  <td data-label="차이" className="deals-pm-r"><PaymentDiffCell row={row} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DealsPaymentsBoard({ board, describe, syncState, selectedDealId, onActivate, onMonth, onCreate, canCreate }) {
  if (!board || !board.hasAny) {
    return syncState === "preview" ? (
      <div className="fx-card deals-tl-empty">
        <TruthBadge state="preview" />
        <p>Supabase가 연결되지 않아 결제 기록을 읽지 않았어요. 연결되면 달마다 예상했던 돈과 들어온 돈이 쌓입니다.</p>
      </div>
    ) : (
      <div className="fx-card deals-tl-empty">
        <EmptyState
          icon="deals"
          title="아직 결제로 잡힌 거래가 없어요"
          description="거래에 금액과 예상일을 적으면 결제 예상이 되고, 입금 확인을 하면 확정치가 달마다 쌓입니다."
          action={canCreate ? <Button variant="secondary" size="sm" icon="plus" onClick={onCreate}>거래 등록</Button> : undefined}
          style={{ minHeight: 180 }}
        />
      </div>
    );
  }
  return (
    <>
      <PaymentsChart board={board} />
      <PaymentsTable board={board} describe={describe} selectedDealId={selectedDealId} onActivate={onActivate} onMonth={onMonth} />
    </>
  );
}

export function DealsTimeline({
  view = "time",
  deals = [],
  paymentsBoard = null,
  onPaymentsMonth,
  timeline,
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
  target,
  onUpdatePayments,
}) {
  const toast = useToast();
  const [filter, setFilter] = React.useState(null);
  const [dragId, setDragId] = React.useState(null);
  const [overLane, setOverLane] = React.useState(null);
  const [record, setRecord] = React.useState(null); // { target, preset?, draft?, error? }
  const draggedRef = React.useRef(false);
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

  const itemsById = React.useMemo(() => new Map(timeline.ordered.map((item) => [item.id, item])), [timeline.ordered]);
  // 결제 보기의 선택은 결제 카드가 아니라 거래(딜 id) — 레인을 떠난(완결) 거래도 독으로 연다.
  const paymentsDockItem = React.useMemo(() => {
    if (view !== "payments" || selectedId == null) return null;
    const deal = (Array.isArray(deals) ? deals : []).find((d) => d.id === selectedId);
    return deal ? dealDockItem(deal, { stages }) : null;
  }, [view, deals, selectedId, stages]);
  const selectedItem = view === "payments"
    ? paymentsDockItem
    : (selectedId != null ? itemsById.get(selectedId) || null : null);
  const customerKey = selectedItem ? dealCustomerKey(selectedItem.deal, { leads: ledger?.leads, accounts: ledger?.accounts }) : null;

  const closeDock = React.useCallback((restoreFocus = false) => {
    const id = selectedId;
    onSelect(null);
    if (!restoreFocus || id == null || typeof document === "undefined") return;
    requestAnimationFrame(() => {
      const key = CSS.escape(String(id));
      document.querySelector(`[data-deal-card="${key}"], [data-deal-row="${key}"] .deals-pm-org`)?.focus();
    });
  }, [onSelect, selectedId]);

  const activate = (item, viaKeyboard) => {
    if (draggedRef.current) return;
    if (selectedId === item.id) {
      closeDock(viaKeyboard);
      return;
    }
    focusDockRef.current = viaKeyboard;
    onSelect(item.id);
  };

  // 결제 표의 행 — 같은 거래의 행을 다시 누르면 닫는다(카드와 같은 토글 계약).
  const activateDeal = (dealId, viaKeyboard) => {
    if (selectedId === dealId) {
      closeDock(viaKeyboard);
      return;
    }
    focusDockRef.current = viaKeyboard;
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

  // 독 바깥을 누르면 닫는다. 카드·독·드로어/팔레트(dialog)·토스트 안의 클릭은 제외.
  React.useEffect(() => {
    if (!selectedItem) return undefined;
    const onDown = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (target.closest(".deals-tl-dock, [data-deal-card], [data-deal-row], .hub-toast-viewport")) return;
      onSelect(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selectedItem, onSelect]);

  const moveTo = (item, iso, dateLabel) => {
    const { org } = describe(item.deal);
    // 명시 결제 일정의 카드는 그 결제의 예상일만 옮긴다 — 딜의 예상일을 바꾸면 카드가 제자리에
    // 남는다(레인은 결제 예상일로 선다). 처음 계획(planned*)은 updatePayment가 건드리지 않는다.
    if (item.explicitPayment && item.paymentId) {
      if (sameCloseDay(item.expectedAt, iso)) return;
      const which = item.paymentLabel || (item.installmentTotal > 1 ? `${item.installmentIndex}회` : "");
      onUpdatePayments?.(
        item.deal.id,
        updatePayment(item.deal, item.paymentId, { expectedAt: iso || null }),
        `${org}${which ? ` ${which}` : ""} · 예상일 ${iso ? `→ ${dateLabel}` : "미정으로"}`,
      );
      return;
    }
    onMoveDate(item.deal.id, iso, `${org} · 예상일 ${iso ? `→ ${dateLabel}` : "미정으로"}`);
  };

  const finishDrag = () => {
    setDragId(null);
    setOverLane(null);
    // 칸을 옮기면 원래 카드가 dragend 전에 언마운트될 수 있다 — 드롭에서도 드래그를 풀고,
    // 뒤따르는 click만 이번 이벤트 턴 동안 무시한다(칸반 finishDealDrag와 같은 계약).
    setTimeout(() => { draggedRef.current = false; }, 0);
  };

  const dropOn = (lane) => {
    const item = dragId != null ? itemsById.get(dragId) : null;
    finishDrag();
    if (!item || item.lane === lane.key) return;
    const target = laneDropDate(lane.key);
    moveTo(item, target.iso, target.dateLabel);
  };

  const visible = (item) => !filter || item.certainty.key === filter;
  const sumOf = (items) => items.reduce((sum, item) => sum + item.amount, 0);

  const renderCard = (item) => (
    <DealTimeCard
      key={item.id}
      item={item}
      stages={stages}
      describe={describe}
      selected={selectedId === item.id}
      rail={timeline.railIds.has(item.id)}
      dragging={dragId === item.id}
      onActivate={activate}
      onDragStart={(e, dragged) => {
        draggedRef.current = true;
        setDragId(dragged.id);
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(dragged.id));
        } catch { /* 일부 브라우저는 dataTransfer 쓰기를 막는다 — 상태만으로 충분하다 */ }
      }}
      onDragEnd={finishDrag}
    />
  );

  let body;
  if (view === "payments") {
    body = (
      <DealsPaymentsBoard
        board={paymentsBoard}
        describe={describe}
        syncState={syncState}
        selectedDealId={selectedId}
        onActivate={activateDeal}
        onMonth={onPaymentsMonth}
        onCreate={onCreate}
        canCreate={canCreate}
      />
    );
  } else if (timeline.count === 0) {
    body = syncState === "preview" ? (
      <div className="fx-card deals-tl-empty">
        <TruthBadge state="preview" />
        <p>Supabase가 연결되지 않아 거래 기록을 읽지 않았어요. 연결되면 예상일에 따라 칸이 채워집니다.</p>
      </div>
    ) : (
      <div className="fx-card deals-tl-empty">
        <EmptyState
          icon="deals"
          title="진행 중인 거래가 없어요"
          description="거래를 등록하면 예상일에 따라 이번 주 · 다음 주 · 나중에 · 날짜 미정 칸에 놓입니다."
          action={canCreate ? <Button variant="secondary" size="sm" icon="plus" onClick={onCreate}>거래 등록</Button> : undefined}
          style={{ minHeight: 180 }}
        />
      </div>
    );
  } else {
    body = (
      <div className="deals-tl-lanes">
        {timeline.lanes.map((lane) => {
          const laneItems = lane.items.filter(visible);
          return (
            <section
              key={lane.key}
              className="deals-tl-lane"
              data-current={lane.current ? "true" : undefined}
              data-over={overLane === lane.key ? "true" : undefined}
              aria-labelledby={`deals-lane-${lane.key}`}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                if (overLane !== lane.key) setOverLane(lane.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOverLane((cur) => (cur === lane.key ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(lane);
              }}
            >
              <header className="deals-tl-lane__head">
                <h3 id={`deals-lane-${lane.key}`}>
                  {lane.current && <span className="deals-tl-now" aria-hidden="true" />}
                  {lane.title}
                </h3>
                <small>{lane.rangeLabel}</small>
                <span className="stat deals-tl-lane__total">{formatWon(sumOf(laneItems))}</span>
              </header>
              <div className="deals-tl-cards">
                {lane.key === "later"
                  ? lane.groups.map((group) => {
                    const groupItems = group.items.filter(visible);
                    if (!groupItems.length) return null;
                    return (
                      <React.Fragment key={group.key}>
                        <p className="fx-eyebrow deals-tl-group">{group.label} · {formatWon(sumOf(groupItems))}</p>
                        {groupItems.map(renderCard)}
                      </React.Fragment>
                    );
                  })
                  : laneItems.map(renderCard)}
                {laneItems.length === 0 && (
                  <p className="deals-tl-drop-hint">{dragId != null ? "여기로 옮기기" : "비어 있어요"}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="deals-tl" data-view={view} data-dock-open={selectedItem ? "true" : undefined}>
      {view === "time" && (
        <CertaintyRibbon month={timeline.month} filter={filter} onToggle={(key) => setFilter((cur) => (cur === key ? null : key))} target={target} />
      )}
      {view === "time" && timeline.stalled.length > 0 && (
        <StalledStrip items={timeline.stalled} describe={describe} onAsk={(item) => openRecord(item, { kind: "kakao" })} />
      )}
      {view === "time" && timeline.overdueCount > MAX_DANGER_RAILS && (
        <p className="deals-tl-overdue" role="status">
          <Iconed name="clock" size={13} /> 약속이 지난 거래 <span className="num">{timeline.overdueCount}</span>건
        </p>
      )}
      {body}

      {selectedItem && (
        <DealDock
          item={selectedItem}
          stages={stages}
          describe={describe}
          customerKey={customerKey}
          primaryRef={dockPrimaryRef}
          onClose={closeDock}
          onRecord={() => openRecord(selectedItem)}
          onAdvance={(stageKey) => onAdvanceStage(selectedItem.deal.id, stageKey)}
          onMoveDate={(iso, dateLabel) => moveTo(selectedItem, iso, dateLabel)}
          onEdit={() => onEdit(selectedItem.deal.id)}
          onOpenCustomer={() => onNavigate?.(`dashboard/revenue/customers?customer=${encodeURIComponent(customerKey)}`)}
          onUpdatePayments={(next, label) => onUpdatePayments?.(selectedItem.deal.id, next, label)}
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

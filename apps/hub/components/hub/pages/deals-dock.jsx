"use client";

// 거래 탭의 하단 독 — 거래 하나(단계·다음 약속·예상일·결제 일정·매달 정기)를 다룬다.
// 운영자 승인 목업 3(2026-09-24)의 독을 그대로 두고, 2026-09-26 돈 보기(pages/deals-money.jsx)가
// 목록의 행을 누를 때 연다. 상태(딜 목록·낙관 반영·되돌리기)는 pages/revenue.jsx의 Deals가 소유하고,
// 여기는 그리기와 독 안의 입력만 맡는다. 결제 일정 세부·입금 확인·정기 수정은 여기서만 한다.

import React from "react";
import { Button, CertaintyBadge, IconButton, Kbd, LifecycleBadge } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import {
  closeDatePresets,
  dateInputValue,
  formatDayLabel,
  formatSignedWon,
  formatWon,
  isoFromDateInput,
  kstDayNumber,
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
import { addMonthsToKey, normalizeRecurring } from "@/lib/deal-recurring";
import { paymentMonthKey } from "@/lib/deal-payment-plan";
import "./deals-dock.css";

// 입력 중이거나 드로어·팔레트 같은 레이어가 떠 있으면 페이지 단축키는 양보한다
// (use-crm-keyboard.js의 shouldYield와 같은 규칙).
export function shouldYieldKeys() {
  if (typeof document === "undefined") return true;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
  return Boolean(document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]'));
}

export const isLocalId = (id) => String(id).toLowerCase().startsWith("local-");

const monthLabel = (key) => {
  const [y, m] = String(key || "").split("-");
  return y && m ? `${y}년 ${Number(m)}월` : "";
};

// 매달 정기 입력 — 한 달 금액 · 매달 며칠 · 시작 달. 돈 보기 목록의 "매달" 빠른 입력과 독의 "정기 수정"이
// 같이 쓴다. 저장은 호출처의 onSubmit(rec)(→ Deals의 updateDealRecurring, deals.meta.recurring).
// 날은 1–31, 그 달에 없는 날은 말일로 당겨진다(deal-recurring.js) — 입력 옆에 그렇게 말한다.
export function RecurringForm({ initial, onSubmit, onCancel, submitLabel = "정기 저장", idPrefix = "rec" }) {
  const [draft, setDraft] = React.useState(() => ({
    amount: initial?.amount ? String(initial.amount) : "",
    day: initial?.day ? String(initial.day) : "",
    startMonth: initial?.startMonth || "",
  }));
  const plan = normalizeRecurring({ amount: draft.amount, day: draft.day, startMonth: draft.startMonth, endMonth: initial?.endMonth || null });
  return (
    <form
      className="deals-form"
      aria-label="매달 정기 입력"
      onSubmit={(e) => {
        e.preventDefault();
        if (plan) onSubmit(plan);
      }}
    >
      <label>
        <span>한 달 금액</span>
        <input id={`${idPrefix}-amount`} type="number" inputMode="numeric" min="0" className="hub-input" value={draft.amount} autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
      </label>
      <label>
        <span>매달 며칠</span>
        <input id={`${idPrefix}-day`} type="number" inputMode="numeric" min="1" max="31" className="hub-input" value={draft.day}
          onChange={(e) => setDraft((d) => ({ ...d, day: e.target.value }))} />
      </label>
      <label>
        <span>시작 달</span>
        <input id={`${idPrefix}-start`} type="month" className="hub-input" value={draft.startMonth} placeholder="2026-10"
          onChange={(e) => setDraft((d) => ({ ...d, startMonth: e.target.value }))} />
      </label>
      <p className="deals-form__hint">그 달에 없는 날(31일 등)은 말일에 들어오는 것으로 봅니다.</p>
      <span className="deals-form__acts">
        <Button type="submit" size="xs" variant="secondary" disabled={!plan}>{submitLabel}</Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>취소</Button>
      </span>
    </form>
  );
}

// 독 안의 매달 정기 한 줄 — 계획을 말하고, 고치거나 이번 달로 끝낸다(지우지 않는다 — 들어온 달의 기록은 남는다).
function RecurringLine({ deal, onUpdateRecurring }) {
  const rec = normalizeRecurring(deal.recurring);
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => { setEditing(false); }, [deal.id]);
  if (!rec) return null;
  const currentKey = paymentMonthKey(new Date());
  if (editing) {
    return (
      <RecurringForm
        idPrefix={`dock-rec-${deal.id}`}
        initial={rec}
        submitLabel="정기 수정"
        onCancel={() => setEditing(false)}
        onSubmit={(next) => { onUpdateRecurring?.(next, "매달 정기를 고쳤습니다"); setEditing(false); }}
      />
    );
  }
  // 이번 달로 끝내기 — 아직 시작 전이면(시작 달이 다음 달 이후) 계획 자체를 지운다.
  const endNow = () => {
    if (rec.startMonth > currentKey) onUpdateRecurring?.(null, "매달 정기를 지웠습니다");
    else onUpdateRecurring?.({ ...rec, endMonth: currentKey }, `매달 정기를 ${monthLabel(currentKey)}로 끝냈습니다`);
  };
  const ended = rec.endMonth && rec.endMonth < addMonthsToKey(currentKey, 1);
  return (
    <div className="deals-pay-rec">
      <span className="deals-pay-rec__text">
        <span aria-hidden="true">↻ </span>매달 {rec.day}일 · <span className="mono">{formatWon(rec.amount)}</span>
        <span className="deals-pay-rec__range"> · {monthLabel(rec.startMonth)}부터{rec.endMonth ? ` ${monthLabel(rec.endMonth)}까지` : ""}</span>
      </span>
      <span className="deals-pay-row__acts">
        <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>정기 수정</Button>
        {!ended && <Button size="xs" variant="ghost" onClick={endNow}>이번 달로 끝내기</Button>}
      </span>
    </div>
  );
}

// 결제 — 딜 하나에 여러 예상 입금(계약금·잔금 등)을 걸고, 입금됐을 때 예상치와 확정치를
// 나눠 기록한다(운영자 2026-09-24 결정, lib/deal-payments.js). 한 번에 한 행만 편집 모드다.
export function DealPaymentsBlock({ deal, onUpdatePayments, onUpdateRecurring }) {
  const payments = React.useMemo(() => effectivePayments(deal), [deal]);
  const expectedTotal = dealExpectedTotal(deal);
  const paidTotal = dealPaidTotal(deal);
  const [active, setActive] = React.useState(null); // { id, mode: 'confirm' | 'edit' }
  const [draft, setDraft] = React.useState({});
  // 새 결제 일정은 로컬 폼에서 금액을 채운 뒤에만 저장한다 — 빈(₩0) 행을 먼저 저장하면
  // normalizePayment가 그 행을 버려 편집할 틈도 없이 사라진다(2026-09-25 통합 검증).
  const [adding, setAdding] = React.useState(null); // { label, expectedAmount, expectedAt } | null
  React.useEffect(() => { setActive(null); setAdding(null); }, [deal.id]);
  const recurring = normalizeRecurring(deal.recurring);

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
        ) : recurring ? (
          <span className="deals-pay__summary">매달 정기로 들어와요 — 한 달 치씩 입금 확인하면 여기에 쌓입니다</span>
        ) : (
          <span className="deals-pay__summary">금액이 아직 없어요 — 대략이라도 적어 두면 이번 달 예상에 들어갑니다</span>
        )}
      </div>
      <RecurringLine deal={deal} onUpdateRecurring={onUpdateRecurring} />
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

export function DealDock({ item, stages, describe, customerKey, primaryRef, openDates = false, onClose, onRecord, onAdvance, onMoveDate, onEdit, onOpenCustomer, onUpdatePayments, onUpdateRecurring }) {
  // "날짜 다시"(돈 보기 목록)로 열면 예상일 바꾸기가 펼쳐진 채로 열린다.
  const [dateOpen, setDateOpen] = React.useState(Boolean(openDates));
  const presets = React.useMemo(() => closeDatePresets(new Date()), []);
  const { deal, certainty, lifecycle, promise } = item;
  const { org } = describe(deal);
  const nextStage = stages[item.stageIndex + 1] || null;
  const local = isLocalId(item.deal.id);
  // 명시 결제 일정의 카드는 그 결제의 예상일을 옮긴다(딜의 예상일이 아니라) — 프리셋 활성·날짜 칸도 같은 값.
  const currentAt = item.explicitPayment ? item.expectedAt : deal.closeAt;
  React.useEffect(() => { setDateOpen(Boolean(openDates)); }, [item.id, openDates]);

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
          <span className={promise.overdue ? "deals-tl-dock__late" : "mono deals-tl-dock__due"}> {promise.dueLabel}</span>
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
      {!local && <DealPaymentsBlock deal={deal} onUpdatePayments={onUpdatePayments} onUpdateRecurring={onUpdateRecurring} />}
    </section>
  );
}

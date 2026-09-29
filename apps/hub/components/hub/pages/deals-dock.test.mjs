import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as timelineLib from "../../../lib/deal-timeline.js";
import * as paymentsLib from "../../../lib/deal-payments.js";
import * as recurringLib from "../../../lib/deal-recurring.js";
import * as planLib from "../../../lib/deal-payment-plan.js";
import { DEAL_STAGES } from "../../../lib/deal-stages.js";

// 거래 탭의 하단 독(목업 3, 2026-09-24 — 2026-09-26부터 돈 보기의 행이 연다). 실제 컴포넌트 코드를
// 격리된 훅으로 돌려 단계 올리기 · 예상일 · 고객 열기 · 결제 일정 · 입금 확인 · 매달 정기를 고정한다.
const source = readFileSync(new URL("./deals-dock.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./deals-dock.css", import.meta.url), "utf8");

const body = source
  .replace(/^"use client";/m, "")
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export function/g, "function")
  .replace(/export const/g, "const");
const javascript = ts.transpileModule(body, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 함수 컴포넌트는 즉시 펼치는 얕은 렌더러 — 훅 슬롯은 렌더 순서로 고정된다.
function createHarness() {
  const slots = [];
  let index = 0;
  const React = {
    createElement: (type, props, ...children) => {
      const merged = { ...props, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
      if (typeof type === "function") return type(merged);
      return { type, props: merged };
    },
    Fragment: "Fragment",
    useState: (initial) => {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial;
      return [slots[key], (value) => { slots[key] = typeof value === "function" ? value(slots[key]) : value; }];
    },
    useRef: (initial) => { const key = index++; return slots[key] ??= { current: initial }; },
    useMemo: (fn) => { index++; return fn(); },
    useCallback: (fn) => { index++; return fn; },
    useEffect: () => { index++; },
  };
  return { React, reset: () => { index = 0; } };
}

function mountDock(props) {
  const harness = createHarness();
  const deps = { React: harness.React, ...timelineLib, ...paymentsLib, ...recurringLib, ...planLib };
  for (const name of ["Button", "CertaintyBadge", "IconButton", "Kbd", "LifecycleBadge", "Iconed"]) deps[name] = name;
  const { DealDock } = new Function(...Object.keys(deps), `${javascript}; return { DealDock };`)(...Object.values(deps));
  let tree;
  const current = { ...props };
  function render(next = {}) {
    Object.assign(current, next);
    harness.reset();
    tree = DealDock(current);
    return tree;
  }
  function findAll(predicate, node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child));
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap((child) => findAll(predicate, child))];
  }
  render();
  return { render, findAll };
}

const text = (node) => (node && typeof node === "object" ? (node.props?.children || []).map(text).join("") : String(node ?? ""));
const NOW = new Date();
const dayIso = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();
const describe = (deal) => ({ org: deal.companyName || deal.name || "이름 없는 거래", who: "" });

function dockProps(deal, extra = {}) {
  return {
    item: timelineLib.dealDockItem(deal, { stages: DEAL_STAGES }),
    stages: DEAL_STAGES,
    describe,
    customerKey: null,
    primaryRef: { current: null },
    onClose: () => {},
    onRecord: () => {},
    onAdvance: () => {},
    onMoveDate: () => {},
    onEdit: () => {},
    onOpenCustomer: () => {},
    onUpdatePayments: () => {},
    onUpdateRecurring: () => {},
    ...extra,
  };
}

const buttons = (app) => app.findAll((n) => n.type === "Button");

test("독 — 다음 단계 올리기 · 예상일 프리셋 · 고객 열기 · Esc, 주 행동은 연락 기록 하나", () => {
  const calls = [];
  const deal = { id: "d1", stage: "quote", value: 2400000, closeAt: dayIso(0), companyName: "리드인" };
  const app = mountDock(dockProps(deal, {
    customerKey: "lead:lead-1",
    onAdvance: (stage) => calls.push(["advance", stage]),
    onMoveDate: (iso, label) => calls.push(["move", iso, label]),
    onOpenCustomer: () => calls.push(["customer"]),
    onClose: (restore) => calls.push(["close", restore]),
  }));
  const dock = app.findAll((n) => n.props?.className === "deals-tl-dock")[0];
  assert.equal(dock.props.role, "region", "독은 모달이 아니다 — N 단축키가 양보하지 않게 dialog가 아니다");
  const primary = buttons(app).filter((b) => b.props.variant === "primary");
  assert.equal(primary.length, 1);
  assert.match(text(primary[0]), /연락 기록/);
  buttons(app).find((b) => /단계 올리기/.test(text(b))).props.onClick();
  assert.deepEqual(calls.pop(), ["advance", "final"]);
  buttons(app).find((b) => /고객 열기/.test(text(b))).props.onClick();
  assert.deepEqual(calls.pop(), ["customer"]);
  buttons(app).find((b) => text(b) === "예상일 바꾸기").props.onClick();
  app.render();
  app.findAll((n) => n.type === "Button" && text(n) === "미정")[0].props.onClick();
  assert.deepEqual(calls.pop(), ["move", "", "날짜 미정"]);
  let stopped = false;
  app.findAll((n) => n.props?.className === "deals-tl-dock")[0].props.onKeyDown({ key: "Escape", stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.deepEqual(calls.pop(), ["close", true]);
});

test("클로징은 다음 단계가 없어 단계 올리기를 숨기고, 저장 전 거래는 연락 기록을 막는다", () => {
  const app = mountDock(dockProps({ id: "LOCAL-1", stage: "closing", value: 0, closeAt: dayIso(0) }));
  assert.equal(buttons(app).some((b) => /단계 올리기/.test(text(b))), false);
  assert.equal(buttons(app).find((b) => /연락 기록/.test(text(b))).props.disabled, true);
});

test("\"날짜 다시\"로 열면 예상일 바꾸기가 펼쳐진 채로 열린다", () => {
  const dateGroup = (app) => app.findAll((n) => n.props?.["aria-label"] === "예상일 바꾸기" && n.props.role === "group");
  const closed = mountDock(dockProps({ id: "d", stage: "final", value: 10, closeAt: dayIso(-3) }));
  assert.equal(dateGroup(closed).length, 0);
  const open = mountDock(dockProps({ id: "d", stage: "final", value: 10, closeAt: dayIso(-3) }, { openDates: true }));
  assert.equal(dateGroup(open).length, 1);
});

test("결제 일정 추가는 금액을 채운 뒤에만 저장한다 — 빈 행을 먼저 저장하지 않는다", () => {
  assert.doesNotMatch(source, /onUpdatePayments\(addInstallment\(deal\)/, "빈 행을 곧바로 저장하지 않는다");
  assert.match(source, /결제 일정 추가/, "금액 없는 딜에도 일정 추가 입구가 있다");
  const block = source.slice(source.indexOf("function DealPaymentsBlock"), source.indexOf("function DealDock"));
  assert.doesNotMatch(block, /if \(!payments\.length\) return null;/, "결제가 없어도 블록을 숨기지 않는다");
  const dropped = paymentsLib.effectivePayments({ id: "d", value: null, payments: paymentsLib.addInstallment({ id: "d", value: null }) });
  assert.equal(dropped.length, 0);
});

test("입금 확인 — 금액이 예상과 다를 때만 차이 이유 한 줄이 열리고 그 이유를 저장한다", () => {
  const saved = [];
  const deal = { id: "d1", stage: "closing", value: 1800000, closeAt: dayIso(1), companyName: "하늘과학" };
  const app = mountDock(dockProps(deal, { onUpdatePayments: (...args) => saved.push(args) }));
  app.findAll((n) => n.type === "Button" && text(n) === "입금 확인")[0].props.onClick();
  app.render();
  const noteInput = () => app.findAll((n) => n.type === "input" && n.props.maxLength === paymentsLib.PAID_NOTE_MAX);
  assert.equal(noteInput().length, 0, "예상 금액 그대로면 묻지 않는다");
  app.findAll((n) => n.type === "input" && n.props.type === "number")[0].props.onChange({ target: { value: "1600000" } });
  app.render();
  assert.equal(noteInput().length, 1);
  assert.match(text(app.findAll((n) => n.type === "label" && n.props.className === "deals-pay-row__note")[0]), /차이 이유\(선택\) · 예상보다 −₩200K/);
  noteInput()[0].props.onChange({ target: { value: "첫 달 할인" } });
  app.render();
  app.findAll((n) => n.type === "Button" && text(n) === "확인")[0].props.onClick();
  assert.equal(saved.length, 1);
  const [payments] = saved[0];
  assert.equal(payments[0].status, "paid");
  assert.equal(payments[0].paidAmount, 1600000);
  assert.equal(payments[0].paidNote, "첫 달 할인");
  assert.equal(payments[0].plannedAmount, 1800000, "암묵 결제를 옮겨 적어도 처음 계획은 남는다");
});

test("매달 정기 한 줄 — 계획을 말하고, 고치면 정규화된 계획을, 이번 달로 끝내면 endMonth를 저장한다", () => {
  const updates = [];
  const current = planLib.paymentMonthKey(new Date());
  const deal = { id: "r", stage: "closing", value: 600000, companyName: "유진", recurring: { amount: 600000, day: 3, startMonth: current } };
  const app = mountDock(dockProps(deal, { onUpdateRecurring: (...args) => updates.push(args) }));
  assert.match(text(app.findAll((n) => n.props?.className === "deals-pay-rec")[0]), /매달 3일 · ₩600K/);
  assert.match(text(app.findAll((n) => n.props?.className === "deals-pay__summary")[0]), /매달 정기로 들어와요/);
  buttons(app).find((b) => text(b) === "이번 달로 끝내기").props.onClick();
  assert.deepEqual(updates.pop()[0], { amount: 600000, day: 3, startMonth: current, endMonth: current });
  buttons(app).find((b) => text(b) === "정기 수정").props.onClick();
  app.render();
  const form = () => app.findAll((n) => n.type === "form" && n.props["aria-label"] === "매달 정기 입력")[0];
  assert.ok(form());
  app.findAll((n) => n.type === "input" && n.props.id === "dock-rec-r-day")[0].props.onChange({ target: { value: "31" } });
  app.render();
  form().props.onSubmit({ preventDefault() {} });
  assert.deepEqual(updates.pop()[0], { amount: 600000, day: 31, startMonth: current, endMonth: null });
  // 아직 시작 전인 계획을 끝내면 계획 자체를 지운다
  const future = recurringLib.addMonthsToKey(current, 2);
  const later = mountDock(dockProps({ ...deal, recurring: { amount: 1, day: 1, startMonth: future } }, { onUpdateRecurring: (...args) => updates.push(args) }));
  later.findAll((n) => n.type === "Button" && text(n) === "이번 달로 끝내기")[0].props.onClick();
  assert.equal(updates.pop()[0], null);
});

test("스타일은 토큰과 선 모양만 — 원색·두꺼운 보더·raw 모션 없음, 모바일은 하단 시트 · 44px · 16px 입력", () => {
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/);
  assert.doesNotMatch(css, /border(?:-(?:top|right|bottom|left))?(?:-width)?:\s*[2-9]px/);
  const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(mobile, /position: fixed;/);
  assert.match(mobile, /min-height: 44px/);
  assert.match(mobile, /height: 44px; font-size: 16px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(source, /onMouseEnter|onMouseLeave/);
});

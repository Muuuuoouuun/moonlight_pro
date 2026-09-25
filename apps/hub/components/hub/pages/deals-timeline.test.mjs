import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as timelineLib from "../../../lib/deal-timeline.js";
import * as paymentsLib from "../../../lib/deal-payments.js";
import { buildPaymentsBoard } from "../../../lib/deal-payment-plan.js";
import { targetProgress } from "../../../lib/revenue-target.js";
import { DEAL_STAGES, STALLED_DAYS } from "../../../lib/deal-stages.js";

// 거래 "언제" 보기(목업 3, 2026-09-24) — 실제 컴포넌트 코드를 격리된 훅으로 돌려
// 리본 거르기 · 멈춘 거래 · 레일 예산 · 독 · 연락 기록 연결을 고정한다.
const source = readFileSync(new URL("./deals-timeline.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./deals-timeline.css", import.meta.url), "utf8");

const body = source
  .replace(/^"use client";/m, "")
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export function/g, "function");
const javascript = ts.transpileModule(body, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 함수 컴포넌트는 즉시 펼치는 얕은 렌더러 — 훅 슬롯은 렌더 순서로 고정된다.
function createHarness() {
  const slots = [];
  let index = 0;
  const effects = [];
  const React = {
    createElement: (type, props, ...children) => {
      const merged = { ...props, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
      if (typeof type === "function") return type(merged);
      return { type, props: merged };
    },
    Fragment: "Fragment",
    Suspense: "Suspense",
    lazy: () => "RevenueHeatmapView",
    useState: (initial) => {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial;
      return [slots[key], (value) => { slots[key] = typeof value === "function" ? value(slots[key]) : value; }];
    },
    useRef: (initial) => { const key = index++; return slots[key] ??= { current: initial }; },
    useMemo: (fn) => { index++; return fn(); },
    useCallback: (fn) => { index++; return fn; },
    useEffect: (fn) => { index++; effects.push(fn); },
  };
  return { React, slots, effects, reset: () => { index = 0; effects.length = 0; } };
}

function mount(props) {
  const harness = createHarness();
  const toasts = [];
  const deps = {
    React: harness.React,
    useToast: () => ({ success: (m) => toasts.push(["success", m]), error: (m) => toasts.push(["error", m]), info: (m) => toasts.push(["info", m]) }),
    UNDO_WINDOW_MS: 3500,
    STALLED_DAYS,
    targetProgress,
    ...timelineLib,
    ...paymentsLib,
  };
  for (const name of ["Button", "CertaintyBadge", "EmptyState", "IconButton", "Kbd", "LifecycleBadge", "Skeleton", "TruthBadge", "Iconed", "ContactRecordDrawer"]) deps[name] = name;
  const { DealsTimeline } = new Function(...Object.keys(deps), `${javascript}; return { DealsTimeline, DealsRegionView };`)(...Object.values(deps));
  let tree;
  const current = { ...props };
  function render(next = {}) {
    Object.assign(current, next);
    harness.reset();
    tree = DealsTimeline(current);
    return tree;
  }
  function findAll(predicate, node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child));
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap((child) => findAll(predicate, child))];
  }
  render();
  return { render, findAll, toasts };
}

const text = (node) => (node && typeof node === "object" ? (node.props?.children || []).map(text).join("") : String(node ?? ""));
const NOW = new Date();
const dayIso = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();

function baseProps(deals, extra = {}) {
  const timeline = timelineLib.buildDealTimeline(deals, { stages: DEAL_STAGES });
  return {
    timeline,
    stages: timeline.stages,
    ledger: { leads: [{ id: "lead-1", companyId: "c1" }], accounts: [], contacts: [{ companyId: "c1", name: "오하늘", title: "원장" }] },
    syncState: "live",
    selectedId: null,
    onSelect: () => {},
    onMoveDate: () => {},
    onAdvanceStage: () => {},
    onEdit: () => {},
    onCreate: () => {},
    onNavigate: () => {},
    onReload: () => {},
    ...extra,
  };
}

const cards = (app) => app.findAll((n) => n.props?.["data-deal-card"]);

test("카드는 확실성 모양을 data 속성으로, 단계는 막대로 그린다 — 색 이름을 넘기지 않는다", () => {
  const app = mount(baseProps([
    { id: "won", stage: "closing", value: 1800000, closeAt: dayIso(0), companyId: "c1", companyName: "하늘과학", name: "재계약" },
    { id: "quote", stage: "quote", value: 0, closeAt: dayIso(0) },
  ]));
  const [won, quote] = [cards(app).find((c) => c.props["data-deal-card"] === "won"), cards(app).find((c) => c.props["data-deal-card"] === "quote")];
  assert.equal(won.props["data-certainty"], "confirmed");
  assert.equal(quote.props["data-certainty"], "recommended");
  assert.equal(won.props.role, "button");
  assert.equal(won.props.tabIndex, 0);
  assert.equal(won.props.draggable, true);
  assert.match(text(won), /하늘과학/);
  assert.match(text(won), /오하늘 원장 · 재계약/);
  assert.equal(app.findAll((n) => n.type === "LifecycleBadge" && n.props.label === "입금 대기").length, 1);
  assert.match(text(quote), /₩ \?/, "금액이 없으면 0이 아니라 모름으로 말한다");
});

test("리본 라벨 버튼으로 거르고 다시 누르면 푼다", () => {
  const app = mount(baseProps([
    { id: "a", stage: "closing", value: 100, closeAt: dayIso(0) },
    { id: "b", stage: "contact", value: 200, closeAt: dayIso(0) },
  ]));
  const legend = () => app.findAll((n) => n.type === "button" && n.props.className === "deals-tl-legend__item");
  assert.deepEqual(legend().map((b) => b.props["data-certainty"]), ["paid", "confirmed", "recommended", "unknown"]);
  legend()[3].props.onClick(); app.render();
  assert.equal(legend()[3].props["aria-pressed"], true);
  assert.deepEqual(cards(app).map((c) => c.props["data-deal-card"]), ["b"]);
  legend()[3].props.onClick(); app.render();
  assert.equal(cards(app).length, 2);
});

test("멈춘 거래 줄은 STALLED_DAYS 문구와 딜 대상의 한 줄 기록을 연다", () => {
  const app = mount(baseProps([{ id: "old", stage: "contact", value: 10, age: STALLED_DAYS + 3, companyName: "채원영어", companyId: "c9" }]));
  const strip = app.findAll((n) => n.type === "section" && n.props["aria-label"] === "멈춘 거래")[0];
  assert.match(text(strip), new RegExp(`${STALLED_DAYS}일 이상 기록이 없어요`));
  assert.match(text(strip), new RegExp(`채원영어 · ${STALLED_DAYS + 3}일`));
  app.findAll((n) => n.type === "Button" && text(n) === "한 줄 물어보기")[0].props.onClick();
  app.render();
  const drawer = app.findAll((n) => n.type === "ContactRecordDrawer")[0];
  assert.deepEqual(drawer.props.target, { kind: "deal", id: "old", name: "채원영어", companyId: "c9" });
  assert.deepEqual(drawer.props.preset, { kind: "kakao" });
});

test("지난 약속 레일은 예산 안에서만, 넘치면 합계를 한 줄로 말한다", () => {
  const deals = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, stage: "quote", value: 10, closeAt: dayIso(0), nextAction: "회신", nextActionAt: dayIso(-3) }));
  const app = mount(baseProps(deals));
  assert.equal(cards(app).filter((c) => c.props["data-rail"]).length, timelineLib.MAX_DANGER_RAILS);
  assert.match(text(app.findAll((n) => n.props?.className === "deals-tl-overdue")[0]), /약속이 지난 거래 5건/);
});

test("카드 선택 = 독 — 다음 단계 올리기·예상일 프리셋·고객 열기가 기록 경로로 이어진다", () => {
  const calls = [];
  const deal = { id: "d1", stage: "quote", value: 2400000, closeAt: dayIso(0), leadId: "lead-1", companyName: "리드인" };
  const app = mount(baseProps([deal], {
    onSelect: (id) => calls.push(["select", id]),
    onAdvanceStage: (id, stage) => calls.push(["advance", id, stage]),
    onMoveDate: (id, iso, label) => calls.push(["move", id, iso, label]),
    onNavigate: (path) => calls.push(["nav", path]),
  }));
  cards(app)[0].props.onClick();
  assert.deepEqual(calls.pop(), ["select", "d1"]);
  app.render({ selectedId: "d1" });
  const dock = app.findAll((n) => n.props?.className === "deals-tl-dock")[0];
  assert.equal(dock.props.role, "region", "독은 모달이 아니다 — N 단축키가 양보하지 않게 dialog가 아니다");
  const buttons = app.findAll((n) => n.type === "Button");
  const primary = buttons.filter((b) => b.props.variant === "primary");
  assert.equal(primary.length, 1);
  assert.match(text(primary[0]), /연락 기록/);
  buttons.find((b) => /단계 올리기/.test(text(b))).props.onClick();
  assert.deepEqual(calls.pop(), ["advance", "d1", "final"]);
  buttons.find((b) => /고객 열기/.test(text(b))).props.onClick();
  assert.deepEqual(calls.pop(), ["nav", "dashboard/revenue/customers?customer=lead%3Alead-1"]);
  buttons.find((b) => text(b) === "예상일 바꾸기").props.onClick();
  app.render();
  const none = app.findAll((n) => n.type === "Button" && text(n) === "미정")[0];
  none.props.onClick();
  assert.deepEqual(calls.pop(), ["move", "d1", "", "리드인 · 예상일 미정으로"]);
  // Esc — 독 안에서 누르면 닫는다
  let stopped = false;
  app.findAll((n) => n.props?.className === "deals-tl-dock")[0].props.onKeyDown({ key: "Escape", stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.deepEqual(calls.pop(), ["select", null]);
});

test("클로징은 다음 단계가 없어 단계 올리기를 숨기고, 저장 전 거래는 연락 기록을 막는다", () => {
  const app = mount(baseProps([{ id: "LOCAL-1", stage: "closing", value: 0, closeAt: dayIso(0) }], { selectedId: "LOCAL-1" }));
  const buttons = app.findAll((n) => n.type === "Button");
  assert.equal(buttons.some((b) => /단계 올리기/.test(text(b))), false);
  assert.equal(buttons.find((b) => /연락 기록/.test(text(b))).props.disabled, true);
});

test("칸에 끌어 놓으면 그 칸의 날짜로, 같은 칸이면 아무 일도 없다", () => {
  const moves = [];
  const app = mount(baseProps([{ id: "d1", stage: "quote", value: 10 }], { onMoveDate: (...args) => moves.push(args) }));
  const lanes = () => app.findAll((n) => n.type === "section" && n.props.className === "deals-tl-lane");
  const dataTransfer = { setData() {} };
  cards(app)[0].props.onDragStart({ dataTransfer });
  app.render();
  lanes()[3].props.onDrop({ preventDefault() {} }); // 날짜 미정 → 날짜 미정
  assert.equal(moves.length, 0);
  app.render();
  cards(app)[0].props.onDragStart({ dataTransfer });
  app.render();
  lanes()[1].props.onDrop({ preventDefault() {} });
  assert.equal(moves.length, 1);
  assert.equal(moves[0][1], timelineLib.laneDropDate("next-week").iso);
});

test("거래가 없으면 상태에 맞게 말한다 — preview는 연결 필요, live는 생성 안내", () => {
  const preview = mount(baseProps([], { syncState: "preview" }));
  assert.equal(preview.findAll((n) => n.type === "TruthBadge" && n.props.state === "preview").length, 1);
  assert.equal(preview.findAll((n) => n.type === "EmptyState").length, 0);
  const live = mount(baseProps([]));
  assert.equal(live.findAll((n) => n.type === "EmptyState").length, 1);
});

test("스타일은 토큰과 선 모양만 — 원색·두꺼운 보더·raw 모션 없음, 모바일은 세로 칸·하단 시트", () => {
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/);
  assert.doesNotMatch(css, /border(?:-(?:top|right|bottom|left))?(?:-width)?:\s*[2-9]px/);
  assert.match(css, /\.deals-tl-card\[data-certainty="recommended"\] \{ border-style: dashed; \}/);
  assert.match(css, /\.deals-tl-card\[data-certainty="unknown"\] \{ border-style: dotted; \}/);
  assert.match(css, /\.deals-tl-card\[data-rail\] \{ box-shadow: inset 1px 0 0 var\(--danger\)/);
  const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(mobile, /\.deals-tl-lanes \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(mobile, /\.deals-tl-legend \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(mobile, /position: fixed;/);
  assert.match(mobile, /min-height: 44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(source, /onMouseEnter|onMouseLeave/);
  assert.doesNotMatch(source, /\b14일/, "멈춤 기준은 STALLED_DAYS 상수로만 말한다");
});

test("결제 일정 추가는 금액을 채운 뒤에만 저장한다 — 빈 행을 먼저 저장하지 않는다", () => {
  // 2026-09-25 통합 검증: addInstallment가 만든 ₩0 행을 바로 저장하면 normalizePayment가 그 행을
  // 버려 편집할 틈 없이 사라졌다. 금액 없는 딜은 결제 블록 자체가 숨어 일정을 넣을 길이 없었다.
  const source = readFileSync(new URL("./deals-timeline.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /onUpdatePayments\(addInstallment\(deal\)/, "빈 행을 곧바로 저장하지 않는다");
  assert.match(source, /결제 일정 추가/, "금액 없는 딜에도 일정 추가 입구가 있다");
  const block = source.slice(source.indexOf("function DealPaymentsBlock"), source.indexOf("function DealDock"));
  assert.doesNotMatch(block, /if \(!payments\.length\) return null;/, "결제가 없어도 블록을 숨기지 않는다");
  // 빈 행은 정규화에서 버려진다 — 그래서 폼이 금액을 먼저 받아야 한다.
  const dropped = paymentsLib.effectivePayments({ id: "d", value: null, payments: paymentsLib.addInstallment({ id: "d", value: null }) });
  assert.equal(dropped.length, 0);
});

// ── 결제 보기(2026-09-25 A안) — 예상했던 돈 → 들어온 돈 ─────────────────────────────
// 보드 모델은 고정 시각으로 만든다(달 경계에서 테스트가 흔들리지 않게). 컴포넌트는 모델을 그리기만 한다.
const PAY_NOW = new Date("2026-09-25T01:00:00Z");
const kstNoon = (ymd) => `${ymd}T03:00:00.000Z`;

function paymentDeals() {
  return [
    { id: "paid", companyName: "유진수학", stage: "closing", value: 1800000,
      payments: [{ id: "p1", expectedAmount: 1800000, expectedAt: kstNoon("2026-09-02"), status: "paid", paidAmount: 1600000, paidAt: kstNoon("2026-09-03"), paidNote: "첫 달 할인" }] },
    { id: "late", companyName: "한빛수학", stage: "closing", value: 2400000, closeAt: kstNoon("2026-09-22") },
    { id: "moved", companyName: "리드인", stage: "quote", value: 2400000, closeAt: kstNoon("2026-10-05"),
      planBaseline: { amount: 2400000, closeAt: kstNoon("2026-09-20") } },
  ];
}

function paymentsProps(deals, extra = {}) {
  return baseProps(deals, {
    view: "payments",
    deals,
    paymentsBoard: buildPaymentsBoard(deals, { now: PAY_NOW, monthKey: extra.monthKey || null }),
    onPaymentsMonth: () => {},
    ...extra,
  });
}

const rowsOf = (app) => app.findAll((n) => n.type === "tr" && n.props["data-deal-row"]);

test("결제 보기는 월별 막대와 딜별 결제 표만 — 언제 보기의 리본·칸·멈춘 거래 줄은 그리지 않는다", () => {
  const app = mount(paymentsProps(paymentDeals()));
  assert.equal(app.findAll((n) => n.type === "section" && /확실성별 금액/.test(n.props["aria-label"] || "")).length, 0);
  assert.equal(app.findAll((n) => n.props?.className === "deals-tl-lanes").length, 0);
  assert.equal(app.findAll((n) => n.props?.className === "fx-card deals-pm-chart").length, 1);
  const cols = app.findAll((n) => n.props?.className === "deals-pm-col");
  assert.equal(cols.length, 7);
  assert.equal(cols.filter((c) => c.props["data-current"]).length, 1, "이번 달만 현재 위치");
  assert.equal(app.findAll((n) => n.props?.className === "deals-pm-plan").length > 0, true, "예상했던 입금 눈금");
  const sr = app.findAll((n) => n.type === "table" && n.props.className === "deals-pm-sr")[0];
  assert.match(text(sr), /9월 \(이번 달\)/, "막대의 숫자를 스크린리더용 표로도 싣는다");
  assert.deepEqual(rowsOf(app).map((r) => r.props["data-deal-row"]), ["paid", "moved", "late"]);
  const moved = rowsOf(app).find((r) => r.props["data-deal-row"] === "moved");
  assert.match(text(moved), /원래 9\/20 → 10\/5/);
  const paid = rowsOf(app).find((r) => r.props["data-deal-row"] === "paid");
  assert.match(text(paid), /−₩200K/);
  assert.match(text(paid), /첫 달 할인/);
  const late = rowsOf(app).find((r) => r.props["data-deal-row"] === "late");
  assert.equal(late.props["data-state"], "overdue");
  assert.match(text(late), /3일 지남/);
});

test("표의 행을 누르면 그 거래의 독이 열린다 — 레인을 떠난(전액 입금) 거래도, 다시 누르면 닫힌다", () => {
  const calls = [];
  const app = mount(paymentsProps(paymentDeals(), { onSelect: (id) => calls.push(id) }));
  const row = rowsOf(app).find((r) => r.props["data-deal-row"] === "paid");
  row.props.onClick();
  assert.deepEqual(calls, ["paid"]);
  // 이름 버튼은 키보드·스크린리더 경로 — 행 클릭과 같은 토글
  app.render({ selectedId: "paid" });
  const dock = app.findAll((n) => n.props?.className === "deals-tl-dock")[0];
  assert.ok(dock, "완결 거래도 독으로 연다");
  assert.match(dock.props["aria-label"], /유진수학/);
  assert.match(text(dock), /−₩200K · 첫 달 할인/, "독의 결제 줄도 차이와 이유를 말한다");
  const orgButton = app.findAll((n) => n.type === "button" && n.props.className === "deals-pm-org" && text(n) === "유진수학")[0];
  assert.equal(orgButton.props["aria-pressed"], true);
  orgButton.props.onClick({ stopPropagation() {}, detail: 1 });
  assert.deepEqual(calls, ["paid", null], "같은 거래를 다시 누르면 닫는다");
});

test("달 이동은 ‹ › 과 이번 달 — 상태는 페이지(Deals)가 가진다", () => {
  const months = [];
  const app = mount(paymentsProps(paymentDeals(), { onPaymentsMonth: (key) => months.push(key) }));
  const [prev, next] = app.findAll((n) => n.type === "IconButton" && (n.props.tooltip === "이전 달" || n.props.tooltip === "다음 달"));
  prev.props.onClick();
  next.props.onClick();
  assert.deepEqual(months, ["2026-08", "2026-10"]);
  assert.equal(app.findAll((n) => n.type === "Button" && text(n) === "이번 달").length, 0, "이번 달에서는 숨긴다");
  const october = mount(paymentsProps(paymentDeals(), { monthKey: "2026-10", onPaymentsMonth: (key) => months.push(key) }));
  october.findAll((n) => n.type === "Button" && text(n) === "이번 달")[0].props.onClick();
  assert.equal(months.at(-1), null);
  assert.match(text(october.findAll((n) => n.type === "h3" && n.props.id === "deals-pm-table-title")[0]), /딜별 결제 · 10월/);
});

test("기록 이전 달은 일부 데이터로 밝히고, 늦은 입금 레일은 예산만큼·넘치면 합계 한 줄", () => {
  const aug = mount(paymentsProps(paymentDeals(), { monthKey: "2026-08" }));
  assert.equal(aug.findAll((n) => n.type === "TruthBadge" && n.props.state === "partial").length, 1);
  const late = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, companyName: `곳${i}`, stage: "closing", value: 10, closeAt: kstNoon(`2026-09-1${i}`) }));
  const app = mount(paymentsProps(late));
  assert.equal(rowsOf(app).filter((r) => r.props["data-rail"]).length, timelineLib.MAX_DANGER_RAILS);
  assert.match(text(app.findAll((n) => n.props?.className === "deals-pm-late" && n.props.role === "status")[0]), /늦은 입금 5건/);
});

test("결제 보기의 빈 상태 — preview는 연결 필요, 결제가 하나도 없으면 생성 안내", () => {
  const preview = mount(paymentsProps([], { syncState: "preview" }));
  assert.equal(preview.findAll((n) => n.type === "TruthBadge" && n.props.state === "preview").length, 1);
  assert.equal(preview.findAll((n) => n.props?.className === "fx-card deals-pm-chart").length, 0, "숫자를 그리지 않는다");
  const live = mount(paymentsProps([{ id: "z", stage: "quote", value: 0 }]));
  assert.equal(live.findAll((n) => n.type === "EmptyState").length, 1);
  assert.equal(live.findAll((n) => n.props?.className === "fx-card deals-pm-chart").length, 0);
});

test("언제 보기에는 결제 보기의 패널을 붙이지 않는다(표면 예산)", () => {
  const app = mount(baseProps([
    { id: "a", stage: "closing", value: 100, closeAt: dayIso(0),
      payments: [{ id: "p", expectedAmount: 100, expectedAt: dayIso(0), status: "paid", paidAmount: 90, paidAt: dayIso(0) }, { id: "q", expectedAmount: 50, expectedAt: dayIso(3) }] },
  ]));
  assert.equal(app.findAll((n) => /deals-pm-/.test(String(n.props?.className || ""))).length, 0);
  assert.equal(app.findAll((n) => n.type === "section" && /확실성별 금액/.test(n.props["aria-label"] || "")).length, 1);
});

test("입금 확인 — 금액이 예상과 다를 때만 차이 이유 한 줄이 열리고 그 이유를 저장한다", () => {
  const saved = [];
  const deal = { id: "d1", stage: "closing", value: 1800000, closeAt: dayIso(1), companyName: "하늘과학" };
  const app = mount(baseProps([deal], { selectedId: "d1", onUpdatePayments: (...args) => saved.push(args) }));
  app.findAll((n) => n.type === "Button" && text(n) === "입금 확인")[0].props.onClick();
  app.render();
  const noteInput = () => app.findAll((n) => n.type === "input" && n.props.maxLength === paymentsLib.PAID_NOTE_MAX);
  assert.equal(noteInput().length, 0, "예상 금액 그대로면 묻지 않는다");
  const amount = app.findAll((n) => n.type === "input" && n.props.type === "number")[0];
  amount.props.onChange({ target: { value: "1600000" } });
  app.render();
  assert.equal(noteInput().length, 1);
  assert.match(text(app.findAll((n) => n.type === "label" && n.props.className === "deals-pay-row__note")[0]), /차이 이유\(선택\) · 예상보다 −₩200K/);
  noteInput()[0].props.onChange({ target: { value: "첫 달 할인" } });
  app.render();
  app.findAll((n) => n.type === "Button" && text(n) === "확인")[0].props.onClick();
  assert.equal(saved.length, 1);
  const [dealId, payments] = saved[0];
  assert.equal(dealId, "d1");
  assert.equal(payments[0].status, "paid");
  assert.equal(payments[0].paidAmount, 1600000);
  assert.equal(payments[0].paidNote, "첫 달 할인");
  assert.equal(payments[0].plannedAmount, 1800000, "암묵 결제를 옮겨 적어도 처음 계획은 남는다");
});

test("명시 결제 카드를 다른 칸에 놓으면 그 결제의 예상일만 옮긴다 — 처음 계획은 그대로", () => {
  const updates = [];
  const moves = [];
  const deal = { id: "s", stage: "final", value: 2000000, companyName: "분할",
    payments: [{ id: "p1", label: "계약금", expectedAmount: 1000000, expectedAt: dayIso(0), plannedAmount: 1000000, plannedAt: dayIso(0) }] };
  const app = mount(baseProps([deal], { onUpdatePayments: (...args) => updates.push(args), onMoveDate: (...args) => moves.push(args) }));
  const lanes = () => app.findAll((n) => n.type === "section" && n.props.className === "deals-tl-lane");
  cards(app)[0].props.onDragStart({ dataTransfer: { setData() {} } });
  app.render();
  lanes()[2].props.onDrop({ preventDefault() {} });
  assert.equal(moves.length, 0, "딜의 예상일은 건드리지 않는다");
  assert.equal(updates.length, 1);
  const [dealId, payments, label] = updates[0];
  assert.equal(dealId, "s");
  assert.equal(payments[0].expectedAt, timelineLib.laneDropDate("later").iso);
  assert.equal(payments[0].plannedAt, new Date(dayIso(0)).toISOString());
  assert.match(label, /분할 계약금 · 예상일 →/);
});

test("결제 보기 스타일 — 토큰·1px 점선 눈금·1px 레일, 모바일은 행을 쌓고 44px", () => {
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/);
  assert.match(css, /\.deals-pm-plan \{[^}]*border-top: 1px dashed var\(--fg-muted\)/);
  assert.match(css, /\.deals-pm-bar--confirmed \{[^}]*background: var\(--fg\)/);
  assert.match(css, /\.deals-pm-bar--expected \{[^}]*border: 1px dashed var\(--line-strong\)/);
  assert.match(css, /\.deals-pm-row\[data-rail\] > td:first-child \{ box-shadow: inset 1px 0 0 var\(--danger\); \}/);
  const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(mobile, /\.deals-pm-table tr \{ display: block; \}/);
  assert.match(mobile, /\.deals-pm-table td::before \{\s*content: attr\(data-label\)/);
  assert.match(mobile, /\.deals-pm-org \{ min-height: 44px/);
  assert.match(mobile, /\.deals-pm-cols \{ grid-template-columns: repeat\(7, 72px\)/);
});

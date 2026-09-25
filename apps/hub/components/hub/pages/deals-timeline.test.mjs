import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as timelineLib from "../../../lib/deal-timeline.js";
import * as paymentsLib from "../../../lib/deal-payments.js";
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

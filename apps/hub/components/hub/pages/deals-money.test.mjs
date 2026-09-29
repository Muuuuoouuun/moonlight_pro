import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as timelineLib from "../../../lib/deal-timeline.js";
import * as paymentsLib from "../../../lib/deal-payments.js";
import * as recurringLib from "../../../lib/deal-recurring.js";
import * as planLib from "../../../lib/deal-payment-plan.js";
import * as moneyLib from "../../../lib/deal-money.js";
import { DEAL_STAGES } from "../../../lib/deal-stages.js";

// 거래 "돈" 보기(목업 10, 2026-09-26) — 실제 컴포넌트 코드(deals-money.jsx + 그 독 deals-dock.jsx)를
// 격리된 훅으로 돌려 머리 · 현금흐름 · 들어올 돈 · 빠른 입력 · 독 연결을 고정한다.
const moneySource = readFileSync(new URL("./deals-money.jsx", import.meta.url), "utf8");
const dockSource = readFileSync(new URL("./deals-dock.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./deals-money.css", import.meta.url), "utf8");

const strip = (src) => src
  .replace(/^"use client";/m, "")
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export function/g, "function")
  .replace(/export const/g, "const");
const javascript = ts.transpileModule(`${strip(dockSource)}\n${strip(moneySource)}`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

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

function load(harness) {
  const deps = {
    React: harness.React,
    useToast: () => ({ success() {}, error() {}, info() {} }),
    UNDO_WINDOW_MS: 3500,
    ...timelineLib, ...paymentsLib, ...recurringLib, ...planLib, ...moneyLib,
  };
  for (const name of ["Button", "CertaintyBadge", "EmptyState", "IconButton", "Kbd", "LifecycleBadge", "SegmentedControl", "TruthBadge", "Iconed", "ContactRecordDrawer"]) deps[name] = name;
  return new Function(...Object.keys(deps), `${javascript}; return { DealsMoney, MoneyHeader };`)(...Object.values(deps));
}

function mount(component, props) {
  const harness = createHarness();
  const components = load(harness);
  let tree;
  const current = { ...props };
  function render(next = {}) {
    Object.assign(current, next);
    harness.reset();
    tree = components[component](current);
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

// 2026-09-26(토) 10:00 KST — 테스트 입력(실제 기록 아님).
const NOW = new Date("2026-09-26T01:00:00Z");
const kst = (ymd) => `${ymd}T03:00:00.000Z`;
function fixture() {
  return [
    { id: "late", companyName: "한빛", stage: "closing", value: 2400000, closeAt: kst("2026-09-19") },
    { id: "maybe", companyName: "정우", stage: "quote", value: 4800000, closeAt: kst("2026-09-30") },
    { id: "rec-sure", companyName: "유진", stage: "closing", value: 600000,
      recurring: { amount: 600000, day: 3, startMonth: "2026-09" },
      payments: [{ id: "rec-2026-09", recurringMonth: "2026-09", expectedAmount: 600000, expectedAt: kst("2026-09-03"), status: "paid", paidAmount: 600000, paidAt: kst("2026-09-03") }] },
    { id: "rec-maybe", companyName: "새봄", stage: "consult", value: 500000, recurring: { amount: 500000, day: 15, startMonth: "2026-10" } },
    { id: "rec-later", companyName: "하늘", stage: "closing", value: 300000, recurring: { amount: 300000, day: 26, startMonth: "2026-10" } },
    { id: "no-schedule", companyName: "도윤", stage: "closing", value: 1200000 },
    { id: "slipped", companyName: "리드인", stage: "final", value: 2400000, closeAt: kst("2026-09-22") },
    { id: "no-amount", companyName: "금액 없음", stage: "potential", value: 0 },
  ];
}
const modelOf = (deals = fixture(), target = 6000000) => moneyLib.buildMoneyModel(deals, { now: NOW, target, stages: DEAL_STAGES });

function hostProps(extra = {}) {
  const deals = extra.deals || fixture();
  return {
    model: modelOf(deals),
    deals,
    stages: DEAL_STAGES,
    ledger: { leads: [], accounts: [], contacts: [] },
    syncState: "live",
    selectedId: null,
    onSelect: () => {},
    onMoveDate: () => {},
    onAdvanceStage: () => {},
    onEdit: () => {},
    onCreate: () => {},
    onNavigate: () => {},
    onReload: () => {},
    onUpdatePayments: () => {},
    onUpdateRecurring: () => {},
    ...extra,
  };
}

function headerProps(extra = {}) {
  return { model: modelOf(), unknown: false, syncState: "live", targetsKnown: true, targetSaving: false, onSaveTarget: async () => true, actions: "ACTIONS", ...extra };
}

const rows = (app) => app.findAll((n) => n.type === "li" && n.props?.["data-deal-row"]);
const rowOf = (app, dealId, i = 0) => rows(app).filter((r) => r.props["data-deal-row"] === dealId)[i];
const buttonIn = (app, node, label) => app.findAll((n) => n.type === "Button" && text(n).includes(label), node)[0];

// ── 머리 카드 ──────────────────────────────────────────────────────────────

test("머리 — 들어온 돈 / 목표, KPI 넷(늦은 입금만 danger), 리본 · 보기 전환과 생성은 카드 안", () => {
  const app = mount("MoneyHeader", headerProps());
  const h2 = app.findAll((n) => n.type === "h2")[0];
  assert.equal(app.findAll((n) => n.type === "h2").length, 1);
  assert.match(text(h2), /9월에 들어온 매출 ₩600K/);
  assert.match(text(app.findAll((n) => n.type === "button" && n.props.className === "deals-money-target")[0]), /\/ 목표 ₩6.0M/);
  const kpis = app.findAll((n) => n.props?.className === "deals-money-kpi");
  assert.deepEqual(kpis.map((k) => text(k.props.children[0])), ["늦은 입금", "월말 확실", "가능까지", "매달 정기"]);
  assert.deepEqual(kpis.map((k) => k.props["data-kind"]), ["late", "sure", "maybe", "recurring"]);
  assert.match(text(kpis[0]), /₩2.4M/);
  assert.match(text(kpis[1]), /₩3.0M/, "월말 확실 = 들어옴 0.6 + 늦음 2.4 + 이번 달 남은 확실 0");
  assert.match(text(kpis[2]), /₩7.8M/, "가능까지 = 월말 확실 + 이번 달 가능 4.8");
  assert.match(text(kpis[3]), /₩600K/);
  assert.equal(text(app.findAll((n) => n.props?.className === "deals-money-top__actions")[0]), "ACTIONS");
  const segs = app.findAll((n) => n.props?.className === "deals-money-seg");
  assert.deepEqual(segs.map((s) => s.props["data-kind"]), ["paid", "late", "maybe"], "0인 조각은 그리지 않는다");
  const tick = app.findAll((n) => n.props?.className === "deals-money-ribbon__target")[0];
  assert.match(tick.props.style.left, /%$/);
  assert.match(text(tick), /목표 ₩6.0M/);
  assert.match(text(app.findAll((n) => n.props?.className === "deals-money-legend__note")[0]), /날짜 없는 가능 ₩2.4M/);
});

test("머리 — 늦은 입금이 없으면 danger가 아니라 '없음', 목표가 없으면 '목표 정하기', 목표를 못 읽으면 아무것도", () => {
  const calm = mount("MoneyHeader", headerProps({ model: modelOf(fixture().filter((d) => d.id !== "late"), null) }));
  const late = calm.findAll((n) => n.props?.className === "deals-money-kpi")[0];
  assert.equal(late.props["data-kind"], "calm");
  assert.match(text(late), /없음/);
  assert.match(text(calm.findAll((n) => n.type === "button" && /deals-money-target--set/.test(n.props.className || ""))[0]), /9월 목표 정하기/);
  assert.equal(calm.findAll((n) => n.props?.className === "deals-money-ribbon__target").length, 0);
  const unknownTargets = mount("MoneyHeader", headerProps({ targetsKnown: false }));
  assert.equal(unknownTargets.findAll((n) => /deals-money-target/.test(String(n.props?.className || ""))).length, 0);
});

test("읽는 중·읽기 실패·미연결에는 ₩0을 사실처럼 쓰지 않는다 — 제목은 '거래', KPI·리본 없음, 상태 배지", () => {
  for (const syncState of ["loading", "error", "preview"]) {
    const app = mount("MoneyHeader", headerProps({ unknown: true, syncState, model: modelOf([], null) }));
    assert.equal(text(app.findAll((n) => n.type === "h2")[0]), "거래", syncState);
    assert.equal(app.findAll((n) => n.type === "dl").length, 0, syncState);
    assert.equal(app.findAll((n) => n.props?.className === "deals-money-ribbon").length, 0, syncState);
    assert.doesNotMatch(text(app.findAll((n) => n.type === "section")[0]), /₩0/, syncState);
    assert.equal(app.findAll((n) => n.type === "TruthBadge" && n.props.state === syncState).length, 1, syncState);
  }
  const live = mount("MoneyHeader", headerProps());
  assert.equal(live.findAll((n) => n.type === "TruthBadge").length, 0, "live는 조용하다");
});

test("목표 정하기 — 저장이 성공할 때만 입력을 닫는다", async () => {
  const saved = [];
  const app = mount("MoneyHeader", headerProps({ model: modelOf(fixture(), null), onSaveTarget: async (amount) => { saved.push(amount); return true; } }));
  app.findAll((n) => n.type === "button" && /deals-money-target--set/.test(n.props.className || ""))[0].props.onClick();
  app.render();
  app.findAll((n) => n.type === "input")[0].props.onChange({ target: { value: "6,000,000" } });
  app.render();
  await app.findAll((n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.deepEqual(saved, [6000000]);
});

// ── 현금흐름 차트 ──────────────────────────────────────────────────────────

test("현금흐름 · 주 — 밀린 돈 칸 + 이번 주부터 10주, 매달 정기 바닥선, 빈 주는 '—', 이전 주는 없다", () => {
  const app = mount("DealsMoney", hostProps());
  const chart = app.findAll((n) => n.props?.className === "deals-money-chart")[0];
  assert.equal(chart.props["data-unit"], "week");
  assert.equal(chart.props["aria-hidden"], "true", "그림은 숨기고 같은 숫자를 표로 싣는다");
  const cols = app.findAll((n) => n.props?.className === "deals-money-col");
  assert.equal(cols.length, 11);
  assert.equal(cols[0].props["data-carry"], "true");
  assert.equal(cols[1].props["data-current"], "true");
  const axis = app.findAll((n) => n.props?.className === "deals-money-axis__cell");
  assert.match(text(axis[0]), /2.4M밀린 돈/);
  assert.match(text(axis[1]), /—이번 주/);
  assert.match(text(axis[2]), /600K4.8M\?9\/28/);
  assert.equal(app.findAll((n) => n.props?.className === "deals-money-now").length, 1, "현재 위치 점은 하나");
  assert.match(text(app.findAll((n) => n.props?.className === "deals-money-floor")[0]), /매달 정기 바닥 · 주당 ≈ ₩138K/);
  const table = app.findAll((n) => n.type === "table" && n.props.className === "deals-money-sr")[0];
  assert.equal(app.findAll((n) => n.type === "tr", table).length, 12);
  assert.equal(app.findAll((n) => n.props?.className === "deals-money-col__seg" && n.props["data-kind"] === "late").length, 1);
});

test("현금흐름 · 월 — 이번 달부터 3달 뒤까지, 이번 달에만 목표 눈금, 이전 달은 없다", () => {
  const app = mount("DealsMoney", hostProps());
  app.findAll((n) => n.type === "SegmentedControl" && n.props.label === "현금흐름 단위")[0].props.onChange("month");
  app.render();
  const cols = app.findAll((n) => n.props?.className === "deals-money-col");
  assert.equal(cols.length, 4);
  const labels = app.findAll((n) => n.props?.className === "deals-money-axis__l").map(text);
  assert.deepEqual(labels, ["9월 · 목표 6.0M", "10월", "11월", "12월"]);
  assert.equal(app.findAll((n) => n.props?.className === "deals-money-col__target").length, 1);
  assert.equal(app.findAll((n) => n.props?.className === "deals-money-floor").length, 0, "바닥선은 주 차트에만");
  assert.doesNotMatch(labels.join(" "), /8월/);
});

// ── 들어올 돈 목록 ──────────────────────────────────────────────────────────

test("목록 — 밀린 돈 → 이번 주·다음 주 → 그 뒤 → 날짜·일정 없음, 머리마다 '확실 + 가능?' 합", () => {
  const app = mount("DealsMoney", hostProps());
  const groups = app.findAll((n) => n.props?.className === "deals-money-grp");
  assert.deepEqual(groups.map((g) => g.props["data-group"]), ["late", "soon", "later", "undated"]);
  const heads = groups.map((g) => text(app.findAll((n) => n.props?.className === "deals-money-grp__head", g)[0]));
  assert.equal(heads[0], "밀린 돈₩2.4M");
  assert.equal(heads[1], "이번 주 · 다음 주₩600K + 4.8M?");
  assert.equal(heads[3], "날짜 · 일정 없음₩1.2M + 2.4M?");
  const late = rowOf(app, "late");
  assert.equal(late.props["data-rail"], "true");
  assert.match(text(late), /9\/19한빛일시불 7일 늦음₩2,400,000입금 확인/);
  const maybe = rowOf(app, "maybe");
  assert.equal(maybe.props["data-certainty"], "maybe");
  assert.match(text(maybe), /가능/);
  assert.ok(buttonIn(app, maybe, "날짜 · 금액"));
  assert.match(text(rowOf(app, "rec-sure")), /↻ 매달 3일/);
  assert.ok(buttonIn(app, rowOf(app, "rec-sure"), "입금 확인"));
  assert.ok(buttonIn(app, rowOf(app, "no-schedule"), "일시불"));
  assert.ok(buttonIn(app, rowOf(app, "no-schedule"), "매달"));
  assert.ok(buttonIn(app, rowOf(app, "slipped"), "날짜 다시"));
  assert.match(text(rowOf(app, "no-amount")), /금액 미정/, "금액이 없으면 ₩0이 아니라 미정");
});

test("그 뒤는 앞의 5건만 — 나머지는 펼치기(건수 · 합), 다시 누르면 접기", () => {
  const app = mount("DealsMoney", hostProps());
  const later = () => app.findAll((n) => n.props?.className === "deals-money-grp" && n.props["data-group"] === "later")[0];
  assert.equal(app.findAll((n) => n.type === "li", later()).length, moneyLib.MONEY_GROUP_PREVIEW);
  const more = app.findAll((n) => n.type === "Button" && n.props.className === "deals-money-more", later())[0];
  assert.match(text(more), /3건 더 · ₩900K \+ 500K\? 펼치기/);
  more.props.onClick();
  app.render();
  assert.equal(app.findAll((n) => n.type === "li", later()).length, 8);
  assert.equal(text(app.findAll((n) => n.type === "Button" && n.props.className === "deals-money-more", later())[0]), "접기");
});

test("입금 확인 — 행 안에서 펼쳐 금액·날짜, 다르면 이유 한 줄. 일시불은 결제로, 매달 정기는 그 달 회차로 적는다", () => {
  const saved = [];
  const app = mount("DealsMoney", hostProps({ onUpdatePayments: (...args) => saved.push(args) }));
  buttonIn(app, rowOf(app, "late"), "입금 확인").props.onClick();
  app.render();
  const form = () => app.findAll((n) => n.type === "form" && n.props["aria-label"] === "입금 확인")[0];
  assert.ok(form());
  assert.equal(app.findAll((n) => n.type === "input" && n.props.maxLength === paymentsLib.PAID_NOTE_MAX).length, 0);
  app.findAll((n) => n.type === "input" && n.props.type === "number", form())[0].props.onChange({ target: { value: "2000000" } });
  app.render();
  const note = app.findAll((n) => n.type === "input" && n.props.maxLength === paymentsLib.PAID_NOTE_MAX)[0];
  assert.match(text(app.findAll((n) => n.type === "label" && n.props.className === "deals-form__note")[0]), /예상보다 −₩400K/);
  note.props.onChange({ target: { value: "분할 입금" } });
  app.render();
  form().props.onSubmit({ preventDefault() {} });
  const [dealId, payments, label] = saved.pop();
  assert.equal(dealId, "late");
  assert.equal(payments[0].status, "paid");
  assert.equal(payments[0].paidAmount, 2000000);
  assert.equal(payments[0].paidNote, "분할 입금");
  assert.match(label, /한빛 입금을 확인했습니다/);

  const rec = mount("DealsMoney", hostProps({ onUpdatePayments: (...args) => saved.push(args) }));
  buttonIn(rec, rowOf(rec, "rec-sure"), "입금 확인").props.onClick();
  rec.render();
  rec.findAll((n) => n.type === "form" && n.props["aria-label"] === "입금 확인")[0].props.onSubmit({ preventDefault() {} });
  const [recId, recPayments, recLabel] = saved.pop();
  assert.equal(recId, "rec-sure");
  const october = recPayments.find((p) => p.recurringMonth === "2026-10");
  assert.equal(october.status, "paid");
  assert.equal(october.paidAmount, 600000);
  assert.equal(recPayments.filter((p) => p.recurringMonth === "2026-09").length, 1, "들어온 9월 기록은 그대로 하나");
  assert.match(recLabel, /유진 10월 정기 입금을 확인했습니다/);
});

test("일정 없는 계약 — 일시불은 금액·날짜가 있어야 저장, 매달은 정기 계획을 저장", () => {
  const payments = [];
  const plans = [];
  const app = mount("DealsMoney", hostProps({ onUpdatePayments: (...args) => payments.push(args), onUpdateRecurring: (...args) => plans.push(args) }));
  buttonIn(app, rowOf(app, "no-schedule"), "일시불").props.onClick();
  app.render();
  const lump = () => app.findAll((n) => n.type === "form" && n.props["aria-label"] === "일시불 일정")[0];
  assert.equal(app.findAll((n) => n.type === "input" && n.props.type === "number", lump())[0].props.value, "1200000", "금액은 거래 금액으로 채운다");
  assert.equal(buttonIn(app, lump(), "일시불 저장").props.disabled, true, "날짜 없이는 저장하지 않는다");
  app.findAll((n) => n.type === "input" && n.props.type === "date", lump())[0].props.onChange({ target: { value: "2026-10-10" } });
  app.render();
  assert.equal(buttonIn(app, lump(), "일시불 저장").props.disabled, false);
  lump().props.onSubmit({ preventDefault() {} });
  const [dealId, next] = payments.pop();
  assert.equal(dealId, "no-schedule");
  assert.deepEqual(next.map((p) => [p.expectedAmount, p.expectedAt, p.plannedAt]), [[1200000, "2026-10-10T03:00:00.000Z", "2026-10-10T03:00:00.000Z"]]);

  const second = mount("DealsMoney", hostProps({ onUpdateRecurring: (...args) => plans.push(args) }));
  buttonIn(second, rowOf(second, "no-schedule"), "매달").props.onClick();
  second.render();
  const form = () => second.findAll((n) => n.type === "form" && n.props["aria-label"] === "매달 정기 입력")[0];
  second.findAll((n) => n.type === "input" && n.props.id === "money-rec-no-schedule-day")[0].props.onChange({ target: { value: "5" } });
  second.findAll((n) => n.type === "input" && n.props.id === "money-rec-no-schedule-start")[0].props.onChange({ target: { value: "2026-10" } });
  second.render();
  form().props.onSubmit({ preventDefault() {} });
  assert.deepEqual(plans.pop().slice(0, 2), ["no-schedule", { amount: 1200000, day: 5, startMonth: "2026-10", endMonth: null }]);
});

test("행을 누르면 그 거래의 독 — 다시 누르면 닫고, '날짜 다시'는 예상일 바꾸기를 펼쳐 연다", () => {
  const calls = [];
  const app = mount("DealsMoney", hostProps({ onSelect: (id) => calls.push(id) }));
  rowOf(app, "maybe").props.onClick();
  assert.deepEqual(calls.pop(), "maybe");
  app.render({ selectedId: "maybe" });
  assert.equal(rowOf(app, "maybe").props["data-selected"], "true");
  assert.equal(app.findAll((n) => n.props?.className === "deals-tl-dock").length, 1);
  rowOf(app, "maybe").props.onClick();
  assert.equal(calls.pop(), null, "같은 거래를 다시 누르면 닫는다");
  const redate = mount("DealsMoney", hostProps({ onSelect: (id) => calls.push(id) }));
  buttonIn(redate, rowOf(redate, "slipped"), "날짜 다시").props.onClick();
  assert.equal(calls.pop(), "slipped");
  redate.render({ selectedId: "slipped" });
  assert.equal(redate.findAll((n) => n.props?.["aria-label"] === "예상일 바꾸기" && n.props.role === "group").length, 1);
  // 거래 이름 버튼이 키보드 경로 — 행 버튼 이벤트가 행 클릭으로 새지 않는다
  let stopped = false;
  app.findAll((n) => n.type === "button" && n.props.className === "deals-money-row__org", rowOf(app, "late"))[0].props.onClick({ detail: 0, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(calls.pop(), "late");
});

test("늦은 입금 레일은 예산(3건)만큼 — 넘치면 묶음 머리에 건수, 나머지 행은 작은 글리프", () => {
  const deals = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, companyName: `학원${i}`, stage: "closing", value: 100, closeAt: kst(`2026-09-1${i}`) }));
  const app = mount("DealsMoney", hostProps({ deals, model: modelOf(deals) }));
  assert.equal(rows(app).filter((r) => r.props["data-rail"]).length, timelineLib.MAX_DANGER_RAILS);
  assert.match(text(app.findAll((n) => n.props?.className === "deals-money-grp__count")[0]), /5건/);
});

test("비었을 때 — preview는 연결 필요(숫자 없음), live는 생성 안내", () => {
  const preview = mount("DealsMoney", hostProps({ deals: [], model: modelOf([]), syncState: "preview" }));
  assert.equal(preview.findAll((n) => n.type === "TruthBadge" && n.props.state === "preview").length, 1);
  assert.equal(preview.findAll((n) => n.props?.className === "deals-money-chart").length, 0);
  const live = mount("DealsMoney", hostProps({ deals: [], model: modelOf([]) }));
  assert.equal(live.findAll((n) => n.type === "EmptyState").length, 1);
});

test("스타일 — 토큰만, 1px 선, 확실성은 선 모양, 빨강은 1px 레일, 모바일 2×2 KPI · 가로 스크롤 차트 · 쌓인 행 44px · 16px 입력", () => {
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/);
  assert.doesNotMatch(css, /border(?:-(?:top|right|bottom|left))?(?:-width)?:\s*[2-9]px/);
  assert.match(css, /\.deals-money-seg\[data-kind="sure"\] \{[^}]*border: 1px dashed/);
  assert.match(css, /\.deals-money-seg\[data-kind="maybe"\] \{[^}]*border: 1px dotted/);
  assert.match(css, /\.deals-money-row\[data-rail\] \{ box-shadow: inset 1px 0 0 var\(--danger\); \}/);
  assert.match(css, /\.deals-money-row\[data-selected\] \{ outline: 1px solid var\(--moon-300\)/);
  assert.match(css, /\.deals-money-row__amt\[data-certainty="sure"\] \{ color: var\(--moon-200\)/);
  const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(mobile, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.deals-money-chart \{ min-width: calc\(var\(--cols\) \* 52px\); \}/);
  assert.match(mobile, /\.deals-money-row__act \{ grid-column: 1 \/ -1;/);
  assert.match(mobile, /min-height: 44px/);
  assert.match(mobile, /font-size: 16px/);
  assert.match(css, /\.deals-money-flow__scroll \{ overflow-x: auto; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(moneySource, /onMouseEnter|onMouseLeave/);
});

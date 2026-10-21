import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import * as catalog from "../../../lib/product-catalog.js";
import * as instruments from "../../../lib/product-instruments.js";
import { formatSignedWonShort, formatWon, formatWonShort } from "../../../lib/won-format.js";

// 12a-1 포트폴리오와 12d 제품 상세(2026-10-21)를 실제 컴포넌트로 그려 읽는다. 렌더러만 가짜이고 규칙·조각은 진짜다.
const transpile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8").replace(/^import[\s\S]*?;\s*$/gm, "").replaceAll("export function ", "function "), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) } }),
  Fragment: "Fragment",
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect() {},
};
const styles = new Proxy({}, { get: (_, key) => String(key) });
const base = {
  React, ...catalog, ...instruments, formatWon, formatWonShort, formatSignedWonShort, styles,
  Button: "Button", Kbd: "Kbd", SegmentedControl: "SegmentedControl", Drawer: "Drawer", SelectField: "SelectField", TextField: "TextField",
  ProductMark: ({ product }) => React.createElement("mark", { "data-mode": catalog.productMode(product).value }),
  ModeLabel: ({ product }) => catalog.productMode(product).label,
};
const portfolio = new Function(...Object.keys(base), `${transpile("./product-portfolio.jsx")}; return { ProductPortfolio, TrendLine, MonthBars, ProfitColumns, Axis, DotRows, Kpi };`)(...Object.values(base));
const pageDeps = { ...base, ...portfolio, INQUIRY_STATUSES: { new: "새 문의", waiting: "답변 대기" }, useToast: () => () => {}, usePageCreateHotkey() {}, createWork() {}, linkInquiry() {}, recordMonth() {}, updateProduct() {} };
const { ProductPage } = new Function(...Object.keys(pageDeps), `${transpile("./product-page.jsx")}; return { ProductPage };`)(...Object.values(pageDeps));

const expand = (node) => {
  if (!node || typeof node !== "object") return node;
  if (typeof node.type === "function") return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: (node.props.children || []).map(expand) } };
};
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node) : (node?.props?.children || []).map(text).join(" ")).replace(/\s+/g, " ");
const all = (node, match, out = []) => {
  if (!node || typeof node !== "object") return out;
  if (match(node)) out.push(node);
  for (const child of node.props?.children || []) all(child, match, out);
  for (const key of ["foot", "value", "note"]) if (node.props?.[key] && typeof node.props[key] === "object") all(node.props[key], match, out);
  return out;
};
const cls = (node) => String(node.props?.className || "");

const month = "2026-10";
const months = catalog.recentMonths(month, 6);
const live = {
  id: "live", name: "운영 제품", summary: "팔고 있는 것", opsStatus: "live", stage: "growth", version: 3, details: {},
  metrics: [{ month: "2026-07", activeUsers: 40, revenue: 100000, cost: 20000 }, { month: "2026-10", activeUsers: 60, revenue: 300000, cost: 50000 }],
  repositories: [{ id: "r1", fullName: "owner/live", status: "connected", summary: { ci: { state: "failure", failed: ["test"] } } }],
  projects: [{ id: "p1", name: "지난 보수", status: "active", workType: "maintenance", dueAt: "2026-10-01", tasks: 3, tasksDone: 1, requests: 0 }],
  inquiries: [{ id: "q1", subject: "반 단위 업로드 되나요", status: "new", productId: "live" }],
  stageHistory: [{ at: "2026-08-01T00:00:00Z", kind: "ops", from: "dev", to: "live" }],
};
const building = { id: "dev", name: "만드는 제품", summary: "출시 전", opsStatus: "dev", stage: "mvp", version: 1, details: {}, metrics: [], repositories: [], projects: [], inquiries: [], stageHistory: [] };
const idea = { id: "idea", name: "생각 중", summary: "코드 전", opsStatus: "dev", stage: "idea", version: 1, details: {}, metrics: [], repositories: [], projects: [], inquiries: [], stageHistory: [] };

test("12a-1 groups the focus zone, rails only the broken product, and pulses only where money came in this month", () => {
  const tree = expand(portfolio.ProductPortfolio({ products: [idea, building, live], inquiries: live.inquiries, month, months, onOpenProduct() {}, onOpenInbox() {} }));
  const groups = all(tree, (node) => cls(node) === "group").map(text);
  assert.match(groups[0], /집중 구간 2 ?\/ ?3/);
  assert.match(groups[1], /나머지 1/);
  const rows = all(tree, (node) => node.type === "button" && cls(node).includes("pfRow"));
  assert.deepEqual(rows.map((row) => row.props["aria-label"]), ["운영 제품 열기", "만드는 제품 열기", "생각 중 열기"]);
  assert.match(cls(rows[0]), /rail/);
  assert.doesNotMatch(cls(rows[1]), /rail/);
  assert.equal(all(rows[0], (node) => cls(node) === "trendRing").length, 1, "this month's revenue → one end ring");
  assert.equal(all(rows[1], (node) => cls(node) === "trendRing").length, 0, "no revenue → no pulse");
  assert.equal(all(rows[1], (node) => cls(node) === "trendFloor").length, 1, "no revenue → dashed floor");
  assert.match(text(rows[1]), /—/);
  assert.match(text(rows[0]), /▲ 200% · 3개월/);
  const trend = all(rows[0], (node) => node.type === "svg")[0];
  assert.match(trend.props["aria-label"], /5월 모름, 6월 모름, 7월 10만원, 8월 모름, 9월 모름, 10월 30만원/);
  assert.deepEqual(all(tree, (node) => node.type === "mark").map((node) => node.props["data-mode"]).slice(-3), ["live", "dev", "idea"]);
});

test("12a-1 head cards read the composition and the focus slots honestly", () => {
  const tree = expand(portfolio.ProductPortfolio({ products: [idea, building, live], inquiries: live.inquiries, month, months, onOpenProduct() {}, onOpenInbox() {} }));
  const value = text(tree);
  assert.match(value, /운영 1 · 제작 1 · 기획 1 · 중지 0/);
  assert.match(value, /빈 칸 1/);
  assert.match(value, /250,000원|25만원/);
  assert.match(value, /지금 볼 것/);
  assert.match(value, /CI 실패 · owner\/live/);
});

test("12d shows the instruments from the ledger only, says 연결 전 for missing sources, and keeps the dev path one click away", () => {
  const calls = [];
  const tree = expand(ProductPage({
    product: live, month, months, areas: [], onBack() {}, onOpenProject() {}, onOpenInquiry() {}, onOpenBoard() {},
    onOpenSettings: (tab) => calls.push(tab), onEditCard() {}, onChanged() {},
  }));
  const value = text(tree);
  assert.match(value, /운영 제품/);
  assert.match(value, /원천 1\/3/);
  assert.match(value, /가동 체크 연결 전/);
  assert.match(value, /에러 수집 도구 미정/);
  assert.match(value, /CI 실패 · test/);
  assert.match(value, /제작중 → 운영중 · 운영 시작/, "the one mode switch is the launch dot");
  const links = all(tree, (node) => cls(node) === "linkChip");
  assert.deepEqual(links.map((link) => [link.type, link.props.href || null]), [
    ["a", "https://github.com/owner/live"], ["span", null], ["span", null], ["span", null],
  ]);
  const overdue = all(tree, (node) => node.type === "button" && cls(node).includes("flowRow") && cls(node).includes("rail"));
  assert.ok(overdue.some((row) => /지난 보수/.test(text(row))), "the overdue maintenance carries the danger rail");
  const dev = all(tree, (node) => node.type === "Button" && /개발 · GitHub/.test(text(node)))[0];
  dev.props.onClick();
  assert.deepEqual(calls, ["dev"]);
  assert.equal(all(tree, (node) => node.type === "Button" && node.props.variant === "primary").length, 1, "one primary: ＋ 일");
});

test("12d with nothing measured shows — and dashed floors, never zeros", () => {
  const tree = expand(ProductPage({ product: building, month, months, areas: [], onBack() {}, onOpenProject() {}, onOpenInquiry() {}, onOpenBoard() {}, onOpenSettings() {}, onEditCard() {}, onChanged() {} }));
  const value = text(tree);
  assert.match(value, /주간 사용자 —/);
  assert.match(value, /순이익 —/);
  assert.doesNotMatch(value, /순이익 0원/);
  assert.equal(all(tree, (node) => cls(node) === "trendRing").length, 0);
  assert.match(value, /CI 저장소 연결 전/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import * as catalog from "../../../lib/product-catalog.js";
import * as devSummary from "../../../lib/product-dev-summary.js";

const source = readFileSync(new URL("./product-dev-list.jsx", import.meta.url), "utf8");
const js = ts.transpileModule(source.replace(/^import[\s\S]*?;\s*$/gm, "").replaceAll("export function ", "function "), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 함수 컴포넌트까지 펼쳐 실제 화면 트리를 만든다. styles는 클래스 이름을 그대로 돌려줘 빨강·레일을 읽을 수 있게 한다.
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) } }),
  Fragment: "Fragment",
};
const expand = (node) => {
  if (!node || typeof node !== "object") return node;
  if (typeof node.type === "function") return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: (node.props.children || []).map(expand) } };
};
const deps = {
  React,
  ...catalog,
  ...devSummary,
  styles: new Proxy({}, { get: (_, key) => String(key) }),
  SectionTitle: ({ children, right }) => React.createElement("section-title", null, children, right),
  Iconed: () => null,
  ProductMark: () => null,
  ModeLabel: ({ product }) => React.createElement("span", null, catalog.productMode(product).label),
};
const ProductDevList = new Function(...Object.keys(deps), `${js}; return ProductDevList;`)(...Object.values(deps));
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node) : (node?.props?.children || []).map(text).join(""));
const all = (node, match, out = []) => {
  if (!node || typeof node !== "object") return out;
  if (match(node)) out.push(node);
  for (const child of node.props?.children || []) all(child, match, out);
  return out;
};

const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const repo = (id, summary, extra = {}) => ({ id, fullName: `owner/${id}`, role: "app", status: "connected", summary, lastSyncedAt: hourAgo, ...extra });
const products = [
  { id: "ok", name: "통과 제품", opsStatus: "live", stage: "growth", repositories: [repo("ok", { ci: { state: "success" }, openPullRequests: 2, reviewRequests: 1, openIssues: 5, latestRelease: { tag: "v1.4", at: hourAgo } })], signals: [] },
  { id: "broken", name: "깨진 제품", opsStatus: "live", stage: "launch", repositories: [repo("broken", { ci: { state: "failure", failed: ["lint"] }, openPullRequests: 1, openIssues: 3 })], signals: [
    { id: "s1", eventType: "github.ci_failed", title: "CI 실패 · owner/broken", happenedAt: hourAgo },
  ] },
  { id: "fresh", name: "새 저장소", opsStatus: "dev", stage: "mvp", repositories: [repo("fresh", {})], signals: [] },
  { id: "none", name: "연결 전 제품", opsStatus: "dev", stage: "idea", repositories: [], signals: [] },
];

test("the list shows broken CI first with a danger rail, and only there", () => {
  const opened = [];
  const tree = expand(ProductDevList({ products, onOpenProduct: (id) => opened.push(id) }));
  const rows = all(tree, (node) => node.type === "button" && String(node.props.className || "").includes("devRow"));
  assert.deepEqual(rows.map((row) => row.props["aria-label"]), ["깨진 제품 상세 열기", "통과 제품 상세 열기", "새 저장소 상세 열기", "연결 전 제품 상세 열기"]);
  assert.match(rows[0].props.className, /rail/);
  assert.doesNotMatch(rows[1].props.className, /rail/);
  assert.match(text(rows[0]), /CI 실패 · lint/);
  rows[1].props.onClick();
  assert.deepEqual(opened, ["ok"]);
});

test("unknown values read as unknown, and an unconnected product invites a repository instead of zeros", () => {
  const tree = expand(ProductDevList({ products, onOpenProduct() {} }));
  const rows = all(tree, (node) => node.type === "button" && String(node.props.className || "").includes("devRow"));
  assert.match(text(rows[2]), /CI 아직 모름 · 동기화 필요/);
  assert.match(text(rows[2]), /PR —/);
  assert.match(text(rows[3]), /저장소 연결 전/);
  assert.doesNotMatch(text(rows[3]), /PR 0|이슈 0/);
});

test("the summary strip counts repositories, CI, PRs and issues from what is known", () => {
  const tree = expand(ProductDevList({ products, onOpenProduct() {} }));
  const strip = all(tree, (node) => node.props?.["aria-label"] === "개발 요약")[0];
  const value = text(strip);
  assert.match(value, /3 \/ 4 제품/);
  assert.match(value, /연결 전 1/);
  assert.match(value, /✕ 1 실패/);
  assert.match(value, /통과 1/);
  assert.match(value, /모름 1/);
  assert.match(value, /리뷰 요청 1/);
});

test("recent activity marks CI failure in danger and says so plainly when there is nothing", () => {
  const tree = expand(ProductDevList({ products, onOpenProduct() {} }));
  const events = all(tree, (node) => node.type === "li");
  assert.equal(events.length, 1);
  assert.match(text(events[0]), /깨진 제품/);
  assert.ok(all(events[0], (node) => node.props?.className === "danger").length >= 1);
  const quiet = expand(ProductDevList({ products: products.map((product) => ({ ...product, signals: [] })), onOpenProduct() {} }));
  assert.match(text(quiet), /최근 7일 GitHub 이벤트가 없어요/);
});

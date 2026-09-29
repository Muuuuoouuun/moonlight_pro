import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// 영업·매출 P0 정리(2026-09-24) — 오늘 연락·고객·거래가 아닌 나머지 매출 표면(문의·세그먼트·
// Leads·Accounts·Cases·개요·히트맵·개인 매출)의 truth 상태와 크기 플로어를 고정한다.
// 원칙: 로딩은 Skeleton(EmptyState 금지), 읽기 실패는 "없음"이 아니라 실패 + 다시 읽기(§5.3),
// 새로 만진 호출처는 SyncBadge 대신 TruthBadge(§8.2), 데이터 ≥12 · 메타 ≥10.5 · 10px 미만 금지.
const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");
const [revenue, inquiries, inquiriesCss, segments, heatmap, personal] = await Promise.all([
  read("revenue.jsx"),
  read("inquiries.jsx"),
  read("inquiries.css"),
  read("segments.jsx"),
  read("revenue-heatmap.jsx"),
  read("personal-revenue.jsx"),
]);

// 최상위 선언 하나(다음 최상위 function/const 직전까지) — 이웃 함수가 옮겨져도 경계가 흔들리지 않는다.
function topLevel(source, start) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${start} 블록이 있어야 한다`);
  const rest = source.slice(from + start.length);
  const next = rest.search(/\n(?:export )?(?:function|const) /);
  return source.slice(from, next < 0 ? source.length : from + start.length + next);
}

// Deals 함수는 별도 작업 흐름이 소유한다 — 여기서는 나머지 함수만 본다.
const overview = topLevel(revenue, "export function RevenueOverview(");
const leads = topLevel(revenue, "export function Leads(");
const cases = topLevel(revenue, "export function Cases(");
const accountHelpers = ["function HealthDot(", "function LeadActivityPanel(", "function DetailPanel("].map((start) => topLevel(revenue, start)).join("\n");
const accounts = topLevel(revenue, "export function Accounts(");

const owned = { overview, leads, cases, accountHelpers, accounts, inquiries, segments, heatmap, personal };

test("owned revenue surfaces declare truth with TruthBadge, never SyncBadge", () => {
  for (const [name, source] of Object.entries(owned)) {
    assert.doesNotMatch(source, /<SyncBadge\b/, `${name}: SyncBadge는 호환 래퍼 — TruthBadge를 직접 쓴다`);
  }
});

test("loading renders Skeleton, not an EmptyState that claims emptiness", () => {
  assert.match(overview, /syncState === 'loading' && <Skeleton\b/);
  assert.match(leads, /leadsLoading && <Skeleton\b/);
  assert.match(cases, /casesLoading && <Skeleton\b/);
  assert.match(accounts, /accountsLoading && <Skeleton\b/);
  assert.match(inquiries, /state\.status === 'loading' \? <Skeleton\b/);
  assert.match(inquiries, /detail\.status === 'loading' \? <Skeleton\b/);
  assert.doesNotMatch(inquiries, /<EmptyState[^>]*불러오는 중/, "로딩 문구를 EmptyState 제목으로 쓰지 않는다");
  assert.match(segments, /ledgerLoading \? \(\s*<Skeleton\b/);
  assert.match(heatmap, /bodyState === "loading" \? \([\s\S]{0,200}<Skeleton\b/);
  assert.match(personal, /syncState === "loading" \? \(\s*<Card[^>]*>\s*<Skeleton\b/);
});

test("read failures are named with a retry instead of posing as an empty list", () => {
  assert.match(overview, /syncState === 'error' && <LedgerReadError noun="매출 기록" onRetry=\{reloadLedger\} \/>/);
  assert.match(leads, /leadsReadFailed && <LedgerReadError noun="리드 목록" onRetry=\{reloadLedger\} \/>/);
  assert.match(cases, /casesReadFailed && <LedgerReadError noun="케이스 목록" onRetry=\{reloadLedger\} \/>/);
  assert.match(accounts, /accountsReadFailed && <LedgerReadError noun="계정 목록" onRetry=\{reloadLedger\} \/>/);
  // 세그먼트: error가 "세그먼트가 없습니다" 설명문으로 새지 않는다.
  assert.match(segments, /ledgerFailed \? \([\s\S]*?<TruthBadge state="error"[\s\S]*?onClick=\{reload\}>다시 읽기<\/Button>/);
  assert.doesNotMatch(segments, /source === 'error'\s*\n?\s*\?\s*'리드 기록을 읽지 못했습니다/);
  // 개인 매출: 실패 시 ₩0 요약과 "개인 딜이 없습니다"를 그리지 않는다.
  assert.match(personal, /\{!ledgerUnsettled && <RevenueSummary/);
  assert.match(revenue, /<PersonalRevenueRoadmap ledger=\{ledger\} syncState=\{syncState\} onRetry=\{reloadLedger\}/);
});

test("the always-empty 브랜드별 매출 panel is gone from the overview (surface budget)", () => {
  assert.doesNotMatch(overview, /byBrand|Revenue by brand|브랜드별 매출 집계 없음/);
  assert.doesNotMatch(revenue, /import \{ BrandIcon \}/);
});

test("inquiries use the shared create hotkey, a Kbd hint, and fold secondary filters on phones", () => {
  assert.match(inquiries, /usePageCreateHotkey\(openCreate, \{ enabled: !creating && !selected \}\)/);
  assert.doesNotMatch(inquiries, /addEventListener\('keydown'/, "수제 N 리스너는 공유 훅으로 흡수한다");
  assert.match(inquiries, /문의 등록 <Kbd>N<\/Kbd>/);
  assert.match(inquiries, /aria-expanded=\{filtersOpen\} aria-controls="inquiry-filters"/);
  assert.match(inquiriesCss, /\.inquiry-filter-toggle \{ display: none; \}/);
  assert.match(inquiriesCss, /@media \(max-width: 600px\) \{[\s\S]*\.inquiry-filters\[data-open="false"\] \{ display: none; \}/);
});

test("Leads keeps primitives: SelectField filters, EmptyState with 검색 지우기, a wrapping header", () => {
  assert.doesNotMatch(leads, /<select\b/, "raw select 대신 SelectField");
  assert.match(leads, /<SelectField\s+aria-label="지역 필터 \(시도\)"/);
  assert.match(leads, /sortedLeads\.length === 0 && \(\s*<EmptyState[\s\S]*?검색 지우기/);
  assert.match(leads, /className="hub-page-header" style=\{\{ display: 'flex', alignItems: 'center', flexWrap: 'wrap'/);
});

test("account health is a shape plus a direct label, never color alone", () => {
  const healthDot = topLevel(revenue, "function HealthDot(");
  assert.match(healthDot, /HEALTH_LABEL\[health\]/);
  assert.match(healthDot, /aria-label=\{`건강도: \$\{text\}`\}/);
  assert.match(healthDot, /hollow \? 'transparent'/, "주의는 빈 원 — ok와 모양으로 구분");
  assert.match(accounts, /<HealthDot health=\{a\.health\} label="always" \/>/);
});

test("Personal/Company in owned surfaces is a neutral label, not identity color", () => {
  for (const [name, source] of Object.entries({ overview, leads, cases, accountHelpers, accounts })) {
    assert.doesNotMatch(source, /tone=\{[^}]*'personal' \? 'personal' : 'company'\}/, `${name}: --personal/--company 착색은 레거시(§5.2)`);
  }
});

test("text sizes stay on the floor: nothing under 10.5px in owned surfaces", () => {
  for (const [name, source] of Object.entries(owned)) {
    const small = [...source.matchAll(/fontSize:\s*([0-9.]+)/g)].map((m) => Number(m[1])).filter((n) => n < 10.5);
    assert.deepEqual(small, [], `${name}: 메타 ≥10.5px, 10px 미만 금지`);
  }
});

test("the personal revenue title follows the 20px/500 page title rule (§11)", async () => {
  const tokens = await readFile(new URL("../hub-tokens.css", import.meta.url), "utf8");
  assert.match(tokens, /\.personal-revenue-header h2 \{\s*font-size: 20px;\s*\}/);
  assert.doesNotMatch(tokens, /clamp\(22px, 2\.5vw, 28px\)/);
});

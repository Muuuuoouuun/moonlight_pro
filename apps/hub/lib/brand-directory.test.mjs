import assert from "node:assert/strict";
import { test } from "node:test";

import {
  brandMatchesScope,
  buildBrandDirectory,
  cadenceLabel,
  identityCompleteness,
  quietLabel,
  resolveWeeklyGoal,
  selectBrand,
} from "./brand-directory.js";

const NOW = new Date("2026-08-29T00:00:00.000Z"); // 토요일 — ISO 주 시작은 8/24(월)

function brand(key, extra = {}) {
  return {
    id: `${key}-id`,
    key,
    name: key,
    orgScope: "personal",
    philosophy: "…",
    voice: "…",
    rules: ["…"],
    ...extra,
  };
}

function liveLedger({ brands = [], items = [], publishLogs = [] } = {}) {
  return { source: "supabase", brands, items, publishLogs };
}

test("an explicit weekly goal is confirmed; a cadence-derived one is only recommended", () => {
  assert.deepEqual(
    resolveWeeklyGoal({ weeklyGoal: 3, cadence: "high_frequency_viral" }),
    { value: 3, certainty: "confirmed" },
  );
  assert.deepEqual(
    resolveWeeklyGoal({ cadence: "high_frequency_viral" }),
    { value: 5, certainty: "recommended" },
  );
  assert.deepEqual(
    resolveWeeklyGoal({ cadence: "" }),
    { value: null, certainty: "unknown" },
  );
});

test("an unknown cadence keeps its raw string rather than inventing a label", () => {
  assert.equal(cadenceLabel("low_frequency_high_quality"), "저빈도 · 고품질");
  assert.equal(cadenceLabel("seasonal_bursts"), "seasonal_bursts");
  assert.equal(cadenceLabel(null), "리듬 미정");
});

test("identity completeness names what is missing instead of a bare boolean", () => {
  assert.deepEqual(
    identityCompleteness(brand("sinabro")),
    { missing: [], state: "confirmed" },
  );
  assert.deepEqual(
    identityCompleteness({ key: "gore", philosophy: "…" }),
    { missing: ["보이스", "콘텐츠 규칙"], state: "recommended" },
  );
  assert.deepEqual(
    identityCompleteness({ key: "empty" }),
    { missing: ["철학", "보이스", "콘텐츠 규칙"], state: "unknown" },
  );
});

test("scope splits classin from everything else, and 'all' keeps every brand", () => {
  const classin = brand("classmoon", { orgScope: "classin" });
  const personal = brand("sinabro");
  const unknownScope = brand("mystery", { orgScope: "" });

  assert.equal(brandMatchesScope(classin, "classin"), true);
  assert.equal(brandMatchesScope(personal, "classin"), false);
  assert.equal(brandMatchesScope(personal, "personal"), true);
  // 스코프를 모르는 브랜드는 개인 레인에 남는다 — 양쪽에서 사라지면 안 된다.
  assert.equal(brandMatchesScope(unknownScope, "personal"), true);
  assert.equal(brandMatchesScope(classin, "all"), true);
});

test("a preview ledger lists brands but refuses to publish measured numbers", () => {
  const directory = buildBrandDirectory(
    { source: "preview", brands: [brand("sinabro")], items: [] },
    { now: NOW },
  );

  assert.equal(directory.state, "preview");
  assert.equal(directory.totals, null);
  assert.equal(directory.brands.length, 1);
  assert.equal(directory.brands[0].counts, null);
  assert.equal(directory.brands[0].publishedThisWeek, null);
  assert.equal(directory.brands[0].quietDays, null);
  // 정체성은 원장이 없어도 읽을 수 있다 — 브랜드 행 자체에서 온다.
  assert.equal(directory.brands[0].identity.state, "confirmed");
});

test("an errored ledger is reported as error rather than a quiet preview", () => {
  const directory = buildBrandDirectory({ source: "error", brands: [] }, { now: NOW });
  assert.equal(directory.state, "error");
});

test("per-brand counts and this-week publishing come only from that brand's items", () => {
  const directory = buildBrandDirectory(liveLedger({
    brands: [brand("sinabro"), brand("gore")],
    items: [
      { brandKey: "sinabro", status: "idea" },
      { brandKey: "sinabro", status: "draft" },
      { brandKey: "sinabro", status: "review" },
      { brandKey: "sinabro", status: "scheduled" },
      { brandKey: "sinabro", status: "published", publishedAt: "2026-08-26T09:00:00.000Z" },
      { brandKey: "sinabro", status: "published", publishedAt: "2026-08-10T09:00:00.000Z" },
      { brandKey: "gore", status: "published", publishedAt: "2026-08-25T09:00:00.000Z" },
    ],
  }), { now: NOW });

  const sinabro = selectBrand(directory, "sinabro");
  assert.deepEqual(sinabro.counts, { ideas: 1, drafts: 2, scheduled: 1, published: 2 });
  assert.equal(sinabro.publishedThisWeek, 1); // 8/10은 지난 주
  assert.equal(sinabro.quietDays, 3); // 8/26 → 8/29
  assert.equal(selectBrand(directory, "gore").counts.published, 1);
});

test("items reach their brand by id when the row carries no brand key", () => {
  const directory = buildBrandDirectory(liveLedger({
    brands: [brand("sinabro")],
    items: [{ brandId: "sinabro-id", status: "published", publishedAt: "2026-08-27T00:00:00.000Z" }],
  }), { now: NOW });

  assert.equal(selectBrand(directory, "sinabro").counts.published, 1);
  assert.equal(selectBrand(directory, "sinabro").publishedThisWeek, 1);
});

test("a brand that never published reports no publish record, not zero days quiet", () => {
  const directory = buildBrandDirectory(liveLedger({
    brands: [brand("sinabro")],
    items: [{ brandKey: "sinabro", status: "idea" }],
  }), { now: NOW });

  assert.equal(selectBrand(directory, "sinabro").quietDays, null);
  assert.equal(quietLabel(null), "발행 기록 없음");
  assert.equal(quietLabel(0), "오늘 발행");
  assert.equal(quietLabel(12), "12일 조용함");
});

test("failed publishes are counted per brand so danger stays on real loss", () => {
  const directory = buildBrandDirectory(liveLedger({
    brands: [brand("sinabro"), brand("gore")],
    publishLogs: [
      { brandKey: "sinabro", status: "failed" },
      { brandKey: "sinabro", status: "published" },
      { brandKey: "gore", status: "queued" },
    ],
  }), { now: NOW });

  assert.equal(selectBrand(directory, "sinabro").failedPublishes, 1);
  assert.equal(selectBrand(directory, "gore").failedPublishes, 0);
  assert.equal(directory.totals.failedPublishes, 1);
});

test("brands are ordered by how far behind their own goal they are, not alphabetically", () => {
  const directory = buildBrandDirectory(liveLedger({
    brands: [
      brand("onTrack", { cadence: "low_frequency_high_quality" }),
      brand("behind", { cadence: "high_frequency_viral" }),
    ],
    items: [
      { brandKey: "onTrack", status: "published", publishedAt: "2026-08-28T00:00:00.000Z" },
      { brandKey: "behind", status: "published", publishedAt: "2026-08-28T00:00:00.000Z" },
    ],
  }), { now: NOW });

  // 둘 다 이번 주 1건이지만 목표가 5인 브랜드가 4건 밀렸다.
  assert.deepEqual(directory.brands.map((b) => b.key), ["behind", "onTrack"]);
});

test("totals separate quiet brands from brands merely behind this week", () => {
  const directory = buildBrandDirectory(liveLedger({
    brands: [
      brand("quiet", { cadence: "low_frequency_high_quality" }),
      brand("fresh", { cadence: "low_frequency_high_quality" }),
    ],
    items: [
      { brandKey: "quiet", status: "published", publishedAt: "2026-07-01T00:00:00.000Z" },
      { brandKey: "fresh", status: "published", publishedAt: "2026-08-28T00:00:00.000Z" },
    ],
  }), { now: NOW });

  assert.equal(directory.totals.brands, 2);
  assert.equal(directory.totals.quiet, 1);
  assert.equal(directory.totals.behind, 1);
});

test("a deep link to a brand outside the current scope resolves to null, not a wrong brand", () => {
  const directory = buildBrandDirectory(liveLedger({
    brands: [brand("classmoon", { orgScope: "classin" }), brand("sinabro")],
  }), { now: NOW, scope: "personal" });

  assert.deepEqual(directory.brands.map((b) => b.key), ["sinabro"]);
  assert.equal(selectBrand(directory, "classmoon"), null);
  assert.equal(selectBrand(directory, null), null);
});

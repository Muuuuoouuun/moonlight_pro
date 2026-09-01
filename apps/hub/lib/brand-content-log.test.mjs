import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BRAND_LOG_PALETTE,
  buildContentLogEntries,
  contentLogChannelOptions,
  contentLogStatusColumns,
  filterContentLogEntries,
  resolveBrandLogColors,
  sortContentLogEntries,
} from "./brand-content-log.js";

function brand(key, extra = {}) {
  return { key, name: key, colorHex: "#5274a8", ...extra };
}

function item(id, extra = {}) {
  return {
    id,
    title: `title-${id}`,
    summary: `memo-${id}`,
    status: "draft",
    kind: "카드뉴스",
    channel: "인스타그램",
    brandKey: "gore",
    brandName: "고래 Go;Re",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...extra,
  };
}

// ── resolveBrandLogColors ────────────────────────────────────────────────

test("an explicit non-default colorHex wins over canonical seed and palette", () => {
  const colors = resolveBrandLogColors([brand("gore", { colorHex: "#123456" })]);
  assert.equal(colors.get("gore"), "#123456");
});

test("the accent default #5274a8 is treated as unset, not an explicit choice", () => {
  const colors = resolveBrandLogColors([brand("gore", { colorHex: "#5274a8" })]);
  assert.equal(colors.get("gore"), "#4FB8C9"); // falls through to the canonical seed
});

test("colorHex comparison to the accent default is case-insensitive", () => {
  const colors = resolveBrandLogColors([brand("gore", { colorHex: "#5274A8" })]);
  assert.equal(colors.get("gore"), "#4FB8C9");
});

test("missing/blank colorHex also falls through to canonical seed", () => {
  const colors = resolveBrandLogColors([
    brand("holyfuncollector", { colorHex: "" }),
    brand("bridgemaker", { colorHex: null }),
  ]);
  assert.equal(colors.get("holyfuncollector"), "#E6C34A");
  assert.equal(colors.get("bridgemaker"), "#5B9BD5");
});

test("all four confirmed canonical seeds resolve to their design colors", () => {
  const colors = resolveBrandLogColors([
    brand("gore"), brand("holyfuncollector"), brand("bridgemaker"), brand("22nomad"),
  ]);
  assert.equal(colors.get("gore"), "#4FB8C9");
  assert.equal(colors.get("holyfuncollector"), "#E6C34A");
  assert.equal(colors.get("bridgemaker"), "#5B9BD5");
  assert.equal(colors.get("22nomad"), "#A0764B");
});

test("unseeded brands get a deterministic palette assignment in given order, skipping taken colors", () => {
  // classin/moon.classin/정상화/눈이 부시게 have no canonical seed — they fall back to the
  // palette. gore/holyfuncollector/bridgemaker/22nomad already claim 4 of the 8 palette
  // colors via canonical seeds, so the unseeded four should receive exactly the remaining
  // four palette colors, in palette order, matching the original v5 attachment layout.
  const colors = resolveBrandLogColors([
    brand("classin"),
    brand("moon.classin"),
    brand("gore"),
    brand("holyfuncollector"),
    brand("bridgemaker"),
    brand("22nomad"),
    brand("정상화"),
    brand("눈이부시게"),
  ]);
  assert.equal(colors.get("classin"), "#9ACD32");
  assert.equal(colors.get("moon.classin"), "#A78BDA");
  assert.equal(colors.get("정상화"), "#E5484D");
  assert.equal(colors.get("눈이부시게"), "#E8B4B8");
  // and every assigned color is actually a member of the published palette
  for (const key of ["classin", "moon.classin", "정상화", "눈이부시게"]) {
    assert.ok(BRAND_LOG_PALETTE.includes(colors.get(key)), `${key} color must come from the palette`);
  }
});

test("a 9th brand needing the palette cycles back to the top instead of erroring", () => {
  const brands = Array.from({ length: 9 }, (_, i) => brand(`brand-${i}`));
  const colors = resolveBrandLogColors(brands);
  assert.equal(colors.size, 9);
  // first 8 are unique (palette has exactly 8 colors and none are pre-claimed)
  const firstEight = brands.slice(0, 8).map((b) => colors.get(b.key));
  assert.equal(new Set(firstEight).size, 8);
  // the 9th cycles back to the first palette color
  assert.equal(colors.get("brand-8"), BRAND_LOG_PALETTE[0]);
});

test("resolution is deterministic for the same input", () => {
  const brands = [brand("classin"), brand("gore"), brand("정상화")];
  const first = resolveBrandLogColors(brands);
  const second = resolveBrandLogColors(brands);
  assert.deepEqual([...first.entries()], [...second.entries()]);
});

test("resolveBrandLogColors tolerates non-array input", () => {
  assert.deepEqual([...resolveBrandLogColors(undefined).entries()], []);
});

// ── buildContentLogEntries — status mapping ──────────────────────────────

test("idea maps to plan/기획, draft|review|scheduled map to making/제작중, published maps to published/발행", () => {
  const items = [
    item("i1", { status: "idea" }),
    item("i2", { status: "draft" }),
    item("i3", { status: "review" }),
    item("i4", { status: "scheduled" }),
    item("i5", { status: "published" }),
  ];
  const entries = buildContentLogEntries(items, [brand("gore")]);
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.deepEqual([byId.i1.status, byId.i1.statusLabel], ["plan", "기획"]);
  assert.deepEqual([byId.i2.status, byId.i2.statusLabel], ["making", "제작중"]);
  assert.deepEqual([byId.i3.status, byId.i3.statusLabel], ["making", "제작중"]);
  assert.deepEqual([byId.i4.status, byId.i4.statusLabel], ["making", "제작중"]);
  assert.deepEqual([byId.i5.status, byId.i5.statusLabel], ["published", "발행"]);
});

test("archived items are excluded from the log entirely", () => {
  const items = [item("i1", { status: "archived" }), item("i2", { status: "published" })];
  const entries = buildContentLogEntries(items, [brand("gore")]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "i2");
});

test("an unrecognized status is defensively excluded rather than mislabeled", () => {
  const entries = buildContentLogEntries([item("i1", { status: "bogus" })], []);
  assert.equal(entries.length, 0);
});

// ── buildContentLogEntries — timestamp fallback + when formatting ───────

test("at prefers publishedAt, then scheduledAt, then updatedAt, then createdAt", () => {
  const full = item("i1", {
    publishedAt: "2026-08-31T10:00:00.000Z",
    scheduledAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
    createdAt: "2026-08-28T10:00:00.000Z",
  });
  assert.equal(buildContentLogEntries([full], [])[0].at, "2026-08-31T10:00:00.000Z");

  const noPublished = item("i2", {
    scheduledAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
    createdAt: "2026-08-28T10:00:00.000Z",
  });
  assert.equal(buildContentLogEntries([noPublished], [])[0].at, "2026-08-30T10:00:00.000Z");

  const onlyUpdated = item("i3", { updatedAt: "2026-08-29T10:00:00.000Z", createdAt: "2026-08-28T10:00:00.000Z" });
  assert.equal(buildContentLogEntries([onlyUpdated], [])[0].at, "2026-08-29T10:00:00.000Z");

  const onlyCreated = item("i4", { createdAt: "2026-08-28T10:00:00.000Z" });
  assert.equal(buildContentLogEntries([onlyCreated], [])[0].at, "2026-08-28T10:00:00.000Z");
});

test("a null timestamp chain produces a null at and a 미정 when, without throwing", () => {
  const entry = buildContentLogEntries([item("i1", { createdAt: null })], [])[0];
  assert.equal(entry.at, null);
  assert.equal(entry.when, "미정");
});

test("when formats as MM.DD in Asia/Seoul, crossing the UTC day boundary correctly", () => {
  // 2026-08-31T15:30:00Z is 2026-09-01 00:30 KST — must display as the KST date (09.01),
  // not the UTC date (08.31), or every late-night entry would show yesterday's date.
  const entry = buildContentLogEntries([item("i1", { createdAt: "2026-08-31T15:30:00.000Z" })], [])[0];
  assert.equal(entry.when, "09.01");
});

test("when formats a normal daytime UTC timestamp as the same KST calendar date", () => {
  const entry = buildContentLogEntries([item("i1", { createdAt: "2026-08-31T02:00:00.000Z" })], [])[0];
  assert.equal(entry.when, "08.31"); // 11:00 KST, same day
});

// ── buildContentLogEntries — shape, color, honest metrics ───────────────

test("entries carry memo from summary, type from kind, and color from brand resolution", () => {
  const entry = buildContentLogEntries(
    [item("i1", { summary: "요약 메모", kind: "릴스", brandKey: "gore" })],
    [brand("gore")],
  )[0];
  assert.equal(entry.memo, "요약 메모");
  assert.equal(entry.type, "릴스");
  assert.equal(entry.color, "#4FB8C9");
});

test("an item with no resolvable brand gets the neutral unassigned token color, not a hardcoded hex", () => {
  const entry = buildContentLogEntries([item("i1", { brandKey: null, brandName: null })], [brand("gore")])[0];
  assert.equal(entry.color, "var(--fg-faint)");
  assert.equal(entry.brandName, "No brand");
});

test("metricValue and metricLabel are always honest zero/dash — never fabricated", () => {
  const entries = buildContentLogEntries(
    [item("i1", { status: "published" }), item("i2", { status: "draft" })],
    [brand("gore")],
  );
  for (const entry of entries) {
    assert.equal(entry.metricValue, 0);
    assert.equal(entry.metricLabel, "—");
  }
});

// ── filterContentLogEntries ───────────────────────────────────────────────

function sampleEntries() {
  return buildContentLogEntries(
    [
      item("i1", { title: "9월 신학기 프로모션", summary: "브랜드 톤1", brandKey: "gore", brandName: "고래 Go;Re", channel: "인스타그램", status: "draft" }),
      item("i2", { title: "주일 밈 시리즈", summary: "예배 후 업로드", brandKey: "holyfuncollector", brandName: "기독밈", channel: "인스타그램", status: "idea" }),
      item("i3", { title: "다낭 카페 지도", summary: "위치 핀 정리", brandKey: "22nomad", brandName: "22th nomad", channel: "블로그", status: "published" }),
    ],
    [brand("gore"), brand("holyfuncollector"), brand("22nomad")],
  );
}

test("filters by brand exactly", () => {
  const filtered = filterContentLogEntries(sampleEntries(), { brand: "gore" });
  assert.deepEqual(filtered.map((e) => e.id), ["i1"]);
});

test("filters by channel exactly", () => {
  const filtered = filterContentLogEntries(sampleEntries(), { channel: "블로그" });
  assert.deepEqual(filtered.map((e) => e.id), ["i3"]);
});

test("filters by status key", () => {
  const filtered = filterContentLogEntries(sampleEntries(), { status: "plan" });
  assert.deepEqual(filtered.map((e) => e.id), ["i2"]);
});

test("query matches case-insensitively across title, memo, and brand name", () => {
  assert.deepEqual(filterContentLogEntries(sampleEntries(), { query: "프로모션" }).map((e) => e.id), ["i1"]);
  assert.deepEqual(filterContentLogEntries(sampleEntries(), { query: "업로드" }).map((e) => e.id), ["i2"]);
  assert.deepEqual(filterContentLogEntries(sampleEntries(), { query: "22TH NOMAD" }).map((e) => e.id), ["i3"]);
});

test("combined brand + channel + query + status filters intersect", () => {
  const filtered = filterContentLogEntries(sampleEntries(), {
    brand: "gore", channel: "인스타그램", query: "프로모션", status: "making",
  });
  assert.deepEqual(filtered.map((e) => e.id), ["i1"]);
  assert.deepEqual(
    filterContentLogEntries(sampleEntries(), { brand: "gore", status: "published" }),
    [],
  );
});

test("no filters returns every entry untouched", () => {
  assert.equal(filterContentLogEntries(sampleEntries(), {}).length, 3);
  assert.equal(filterContentLogEntries(sampleEntries()).length, 3);
});

// ── sortContentLogEntries ─────────────────────────────────────────────────

function entryAt(id, at, metricValue = 0) {
  return { id, at, metricValue };
}

test("latest sorts at descending with null timestamps last", () => {
  const input = [entryAt("a", "2026-08-29"), entryAt("b", null), entryAt("c", "2026-08-31"), entryAt("d", "2026-08-30")];
  const sorted = sortContentLogEntries(input, "latest");
  assert.deepEqual(sorted.map((e) => e.id), ["c", "d", "a", "b"]);
});

test("oldest sorts at ascending with null timestamps last", () => {
  const input = [entryAt("a", "2026-08-29"), entryAt("b", null), entryAt("c", "2026-08-31"), entryAt("d", "2026-08-30")];
  const sorted = sortContentLogEntries(input, "oldest");
  assert.deepEqual(sorted.map((e) => e.id), ["a", "d", "c", "b"]);
});

test("metrics sorts metricValue descending", () => {
  const input = [entryAt("a", "2026-08-29", 10), entryAt("b", "2026-08-30", 900), entryAt("c", "2026-08-31", 100)];
  const sorted = sortContentLogEntries(input, "metrics");
  assert.deepEqual(sorted.map((e) => e.id), ["b", "c", "a"]);
});

test("ties preserve original order (stable sort) for both at and metrics", () => {
  const sameAt = [entryAt("a", "2026-08-29"), entryAt("b", "2026-08-29"), entryAt("c", "2026-08-29")];
  assert.deepEqual(sortContentLogEntries(sameAt, "latest").map((e) => e.id), ["a", "b", "c"]);
  assert.deepEqual(sortContentLogEntries(sameAt, "oldest").map((e) => e.id), ["a", "b", "c"]);

  const sameMetric = [entryAt("a", "2026-08-29", 5), entryAt("b", "2026-08-30", 5), entryAt("c", "2026-08-31", 5)];
  assert.deepEqual(sortContentLogEntries(sameMetric, "metrics").map((e) => e.id), ["a", "b", "c"]);
});

test("sorting never mutates the input array", () => {
  const input = [entryAt("a", "2026-08-29"), entryAt("b", "2026-08-31")];
  const snapshot = input.map((e) => e.id);
  sortContentLogEntries(input, "latest");
  assert.deepEqual(input.map((e) => e.id), snapshot);
});

// ── contentLogChannelOptions ──────────────────────────────────────────────

test("channel options are ordered by frequency descending, then label", () => {
  const entries = [
    { channel: "블로그" }, { channel: "인스타그램" }, { channel: "인스타그램" },
    { channel: "유튜브" }, { channel: "유튜브" }, { channel: "뉴스레터" },
  ];
  // 블로그/뉴스레터 are tied at count 1 — tie-break is Korean locale order (ㄴ < ㅂ),
  // so 뉴스레터 sorts before 블로그.
  assert.deepEqual(contentLogChannelOptions(entries), ["유튜브", "인스타그램", "뉴스레터", "블로그"]);
});

test("channel options exclude empty/missing channels", () => {
  const entries = [{ channel: "" }, { channel: null }, { channel: "블로그" }, {}];
  assert.deepEqual(contentLogChannelOptions(entries), ["블로그"]);
});

test("equal-frequency channels tie-break alphabetically by label", () => {
  const entries = [{ channel: "블로그" }, { channel: "뉴스레터" }];
  assert.deepEqual(contentLogChannelOptions(entries), ["뉴스레터", "블로그"]);
});

// ── contentLogStatusColumns ────────────────────────────────────────────────

test("status columns partition into exactly plan/making/published, preserving entry order", () => {
  const entries = [
    { id: "a", status: "making" },
    { id: "b", status: "plan" },
    { id: "c", status: "making" },
    { id: "d", status: "published" },
    { id: "e", status: "plan" },
  ];
  const columns = contentLogStatusColumns(entries);
  assert.deepEqual(columns.map((c) => c.key), ["plan", "making", "published"]);
  assert.deepEqual(columns.map((c) => c.label), ["기획", "제작중", "발행"]);
  assert.deepEqual(columns.find((c) => c.key === "plan").items.map((e) => e.id), ["b", "e"]);
  assert.deepEqual(columns.find((c) => c.key === "making").items.map((e) => e.id), ["a", "c"]);
  assert.deepEqual(columns.find((c) => c.key === "published").items.map((e) => e.id), ["d"]);
});

test("an empty column still renders with a zero-length items array, not undefined", () => {
  const columns = contentLogStatusColumns([]);
  for (const column of columns) {
    assert.deepEqual(column.items, []);
  }
});

// 발행 로그 화면 렌더 — 상태는 모양·글로, 빨강은 놓침 1px 왼쪽 선에만, 수치는 읽기 전용(입력은 성과가 소유).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { PublishLogView } = await import("./publish-log-view.jsx");
const { buildPublishLog, countLog, filterLog, weekStrip } = await import("../../../lib/content-publish-log.js");
const css = await readFile(new URL("./content-publish-log.css", import.meta.url), "utf8");
const kst = (m, d, h, min = 0) => Date.UTC(2026, m - 1, d, h, min) - 9 * 3600 * 1000;
const iso = (t) => new Date(t).toISOString();
const now = kst(9, 29, 12, 40);
const sched = (id, patch = {}) => ({ variantId: id, contentId: `c-${id}`, title: `글 ${id}`, channel: "threads", scheduledAt: iso(kst(9, 29, 19)), status: "scheduled", revision: 1, createdAt: iso(kst(9, 28, 22)), ...patch });
const pub = (id, patch = {}) => ({ variantId: id, contentId: `c-${id}`, status: "published", provider: "manual", event: "operator_published", channel: "threads", title: `글 ${id}`, publishedAt: iso(kst(9, 29, 8, 34)), targetUrl: "https://www.threads.net/@a/post/1", provenance: "operator_confirmed", ...patch });

function render({ schedules = [], publishLogs = [], metricsById = {}, filter = "all", selectedId = "" } = {}) {
  const allRows = buildPublishLog({ schedules, publishLogs, metricsById }, now);
  return renderToStaticMarkup(React.createElement(PublishLogView, {
    rows: filterLog(allRows, filter), allRows, counts: countLog(allRows), filter, onFilter() {}, week: weekStrip(allRows, now),
    selectedId, onSelect() {}, onOpenDraft() {}, onOpenPerformance() {},
  }));
}

test("rows carry a lifecycle label per state; the week strip marks today and lists chips", () => {
  const html = render({ schedules: [sched("soon"), sched("due", { scheduledAt: iso(kst(9, 29, 12, 30)) }), sched("gone", { status: "cancelled" })], publishLogs: [pub("done")] });
  for (const label of ["예약됨", "올릴 차례", "예약 해제", "발행됨"]) assert.match(html, new RegExp(label));
  assert.match(html, /aria-current="date"/);
  assert.match(html, /class="pl-chip"/);
  assert.match(html, /전체 4/);
  assert.match(html, /올릴 차례 1/);
});

test("a missed row gets the danger rail state; more than three collapse to neutral", () => {
  const missed = (n) => sched(`m${n}`, { status: "missed", scheduledAt: iso(kst(9, 28, 21)), missedAt: iso(kst(9, 28, 22)) });
  const few = render({ schedules: [missed(1), missed(2)] });
  assert.equal((few.match(/class="pl-row hub-row" data-state="missed"/g) || []).length, 2);
  const many = render({ schedules: [1, 2, 3, 4].map(missed) });
  assert.doesNotMatch(many, /class="pl-row hub-row" data-state="missed"/, "빨간 선을 행마다 반복하지 않는다");
  assert.match(many, /data-state="neutral"/);
});

test("published rows show metrics read-only and point to 성과 for edits; missing metrics say so", () => {
  const withMetrics = render({ publishLogs: [pub("a")], metricsById: { a: { views: 1200, shares: 4, replies: null } }, selectedId: "a" });
  assert.match(withMetrics, /1,200/);
  assert.match(withMetrics, /답글 <b class="num">—<\/b>/, "미기록은 0이 아니라 —");
  assert.match(withMetrics, /성과에서 수정/);
  assert.doesNotMatch(withMetrics, /<input/, "발행 로그에서는 수치를 입력하지 않는다");
  const bare = render({ publishLogs: [pub("a")], selectedId: "a" });
  assert.match(bare, /성과 미기록/);
  assert.match(bare, /성과 기록/);
});

test("the selected item's history is chronological, links the recorded URL safely, and offers 원고 열기", () => {
  const html = render({ schedules: [sched("a", { scheduledAt: iso(kst(9, 29, 8)) })], publishLogs: [pub("a")], selectedId: "a" });
  assert.match(html, /aria-label="선택한 글의 이력"/);
  assert.match(html, /예약 만듦/);
  assert.match(html, /발행 기록 · 운영자 확인/);
  assert.match(html, /href="https:\/\/www\.threads\.net\/@a\/post\/1" target="_blank" rel="noopener noreferrer"/);
  assert.ok(html.indexOf("예약 만듦") < html.indexOf("발행 기록 · 운영자 확인"));
  assert.match(html, /원고 열기/);
});

test("rows are keyboard-operable buttons (§11) and empty filters say so", () => {
  const html = render({ schedules: [sched("soon")] });
  assert.match(html, /role="button" tabindex="0" aria-pressed="false"/);
  assert.match(render({ schedules: [sched("soon")], filter: "published" }), /이 조건의 기록이 없습니다/);
});

test("stylesheet uses tokens only: 1px danger rail, no raw colors or durations", () => {
  assert.match(css, /\[data-state="missed"\] \{ box-shadow: inset 1px 0 0 var\(--danger\)/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/);
  assert.doesNotMatch(css, /\b\d+ms\b/);
});

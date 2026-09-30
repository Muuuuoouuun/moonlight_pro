// 홈 '지금 올릴 글' 렌더 — 놓침은 1px 왼쪽 선 + 직접 라벨, 낮의 시각 지남은 중립, 놓침이 많으면 개수로 접는다(§5.3 빨강 예산).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { PublishDueView } = await import("./publish-due-view.jsx");
const css = await readFile(new URL("./publish-due.css", import.meta.url), "utf8");
const kst = (h, min = 0) => Date.UTC(2026, 8, 29, h, min) - 9 * 3600 * 1000;
const now = kst(12, 40);
const row = (n, patch = {}) => ({ variantId: `v${n}`, contentId: `c${n}`, title: `글 ${n}`, channel: "threads", scheduledAt: new Date(kst(12, 30)).toISOString(), state: "due", status: "scheduled", revision: 1, ...patch });
const render = (items) => renderToStaticMarkup(React.createElement(PublishDueView, { items, now, onOpen() {}, onSnooze() {} }));

test("due within the hour reads 지금 and is the only primary; earlier in the day is neutral 시각 지남", () => {
  const html = render([row(1), row(2, { scheduledAt: new Date(kst(9)).toISOString() })]);
  assert.match(html, /data-state="now"/);
  assert.match(html, /data-state="late"/);
  assert.match(html, /시각 지남 · 아직 안 올림/);
  assert.equal((html.match(/hub-btn--primary/g) || []).length, 1, "화면당 주 행동은 하나");
  assert.doesNotMatch(html, /data-state="missed"/);
});

test("a missed item gets the danger rail state and a direct label; snooze is not offered for it", () => {
  const html = render([row(1, { state: "missed", status: "missed" })]);
  assert.match(html, /data-state="missed"/);
  assert.match(html, /놓침 · 밤에 정리됨/);
  assert.match(html, /1건 놓침/);
  assert.match(html, /다른 시간으로/);
  assert.doesNotMatch(html, /30분 뒤/);
});

test("more than three missed collapse to a count: rows go neutral so red stays within budget", () => {
  const many = [1, 2, 3, 4].map((n) => row(n, { state: "missed", status: "missed", scheduledAt: new Date(kst(9)).toISOString() }));
  const html = render(many);
  assert.match(html, /4건 놓침/);
  assert.doesNotMatch(html, /data-state="missed"/, "행마다 빨간 선을 반복하지 않는다");
  const few = render(many.slice(0, 3));
  assert.equal((few.match(/data-state="missed"/g) || []).length, 3);
});

test("stylesheet uses tokens only: 1px danger rail, no raw colors or durations", () => {
  assert.match(css, /\[data-state="missed"\] \{ box-shadow: inset 1px 0 0 var\(--danger\)/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/);
  assert.doesNotMatch(css, /\d+m?s\b/);
});

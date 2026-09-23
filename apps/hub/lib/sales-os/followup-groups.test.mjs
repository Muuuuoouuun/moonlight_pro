import assert from "node:assert/strict";
import { test } from "node:test";

import { FOLLOWUP_GROUPS, MAX_DANGER_RAILS, groupFollowups } from "./followup-groups.js";

const item = (id, bucket) => ({ id, bucket });

test("three groups: missed promises, today's promises, everything else", () => {
  const groups = groupFollowups([
    item("a", "overdue"),
    item("b", "today"),
    item("c", "week"),
    item("d", "later"),
    item("e", "overdue"),
  ]);
  assert.deepEqual(groups.missed.map((i) => i.id), ["a", "e"]);
  assert.deepEqual(groups.today.map((i) => i.id), ["b"]);
  // 약속 날짜가 미래거나 없는 건은 "지켜보는 고객" — 오늘 화면을 채우지 않는다.
  assert.deepEqual(groups.rest.map((i) => i.id), ["c", "d"]);
});

test("input order is preserved inside a group (the ledger already sorted by priority)", () => {
  const groups = groupFollowups([item("hi", "overdue"), item("lo", "overdue")]);
  assert.deepEqual(groups.missed.map((i) => i.id), ["hi", "lo"]);
});

test("missing or malformed buckets fall into rest, never into the red section", () => {
  const groups = groupFollowups([{ id: "x" }, null, undefined, { id: "y", bucket: "nonsense" }]);
  assert.deepEqual(groups.missed, []);
  assert.deepEqual(groups.today, []);
  assert.equal(groups.rest.length, 4);
});

test("empty input still returns all three keys", () => {
  assert.deepEqual(groupFollowups(), { missed: [], today: [], rest: [] });
});

test("the rendered section contract matches the group keys", () => {
  assert.deepEqual(FOLLOWUP_GROUPS.map((g) => g.key), ["missed", "today", "rest"]);
  // 빨강 예산(§5.3 전체 3개) — 레일 수가 늘면 긴급이 배경이 된다.
  assert.equal(MAX_DANGER_RAILS, 3);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { diffKstDays, dueBucket, kstDayKey, kstDayKeyAfter } from "./kst-day.js";

// 서버는 UTC로 돈다. 이 파일이 고정하는 것은 "오늘"이 KST 자정 경계라는 사실이다.
test("kstDayKey converts an instant to the Seoul calendar day", () => {
  // UTC 15:30 = KST 다음 날 00:30 — 서버 시각 기준으로 세면 하루가 어긋난다.
  assert.equal(kstDayKey("2026-09-20T15:30:00Z"), "2026-09-21");
  assert.equal(kstDayKey("2026-09-20T14:59:00Z"), "2026-09-20");
  assert.equal(kstDayKey(new Date("2026-09-21T00:00:00+09:00")), "2026-09-21");
});

test("date-only strings pass through untouched", () => {
  // 사용자가 고른 날짜는 시각이 없다 — 파싱해서 되돌리면 하루가 밀릴 수 있다.
  assert.equal(kstDayKey("2026-09-26"), "2026-09-26");
});

test("blank and unparsable values produce an empty key, never today", () => {
  for (const value of [null, undefined, "", "not-a-date"]) {
    assert.equal(kstDayKey(value), "");
  }
});

test("diffKstDays counts calendar days, not 24h blocks", () => {
  assert.equal(diffKstDays("2026-09-20", "2026-09-21"), 1);
  assert.equal(diffKstDays("2026-09-21", "2026-09-20"), -1);
  assert.equal(diffKstDays("2026-09-21", "2026-09-21"), 0);
  assert.equal(diffKstDays("", "2026-09-21"), 0);
});

test("dueBucket splits overdue / today / week / later on the day key", () => {
  const today = "2026-09-21";
  const weekEnd = "2026-09-27";
  assert.equal(dueBucket("2026-09-20", today, weekEnd), "overdue");
  assert.equal(dueBucket("2026-09-21", today, weekEnd), "today");
  assert.equal(dueBucket("2026-09-27", today, weekEnd), "week");
  assert.equal(dueBucket("2026-09-28", today, weekEnd), "later");
  // 오후에 잡은 "내일 09:00"은 today가 아니다(24h floor의 고전적 결함).
  assert.equal(dueBucket("2026-09-22T00:00:00+09:00", today, weekEnd), "week");
  assert.equal(dueBucket(null, today, weekEnd), "later");
});

test("kstDayKeyAfter walks forward in calendar days", () => {
  const base = Date.parse("2026-09-21T03:00:00Z"); // KST 12:00
  assert.equal(kstDayKeyAfter(0, base), "2026-09-21");
  assert.equal(kstDayKeyAfter(6, base), "2026-09-27");
});

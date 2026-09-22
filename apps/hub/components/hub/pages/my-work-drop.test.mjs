import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 보드 드래그 계약 — 컴포넌트를 렌더하지 않고 소스로 고정한다(이 페이지의 기존 패턴,
// my-work-mute.test.mjs와 같다). 회귀는 "카드가 드롭한 열에 남지 않는다"였다.
const page = readFileSync(new URL("./my-work.jsx", import.meta.url), "utf8");

test("오늘 3개로 고른 카드를 기한 열로 끌면 선택만 풀지 않고 그 열로 옮긴다", () => {
  // 이전 회귀: `if (item.focusToday) { toggleFocus(item, false); return; }` — rescheduleTask가
  // 실행되지 않아 기한이 그대로였고, 선택이 풀린 카드는 원래 기한 버킷(지남·나중)으로 튀었다.
  assert.doesNotMatch(page, /if \(item\.focusToday\) \{ toggleFocus\(item, false\); return; \}/);
  assert.match(page, /if \(item\.focusToday\) \{ unfocusAndReschedule\(item, bucketKey, dueAt\); return; \}/);
  // focus 열로 끌어오는 경로는 그대로 선택 토글이다.
  assert.match(page, /if \(bucketKey === 'focus'\) \{ toggleFocus\(item, true\); return; \}/);
});

test("선택 해제 + 기한 변경은 낙관 패치 한 엔트리와 reload 한 번으로 끝낸다", () => {
  const fn = page.slice(page.indexOf("const unfocusAndReschedule"), page.indexOf("const dropOnBucket"));
  assert.ok(fn.length > 0, "unfocusAndReschedule가 dropOnBucket 앞에 있어야 한다");
  // 두 PATCH를 순차로 보낸다 — 선택 해제 먼저, 그다음 기한.
  assert.match(fn, /patchTask\(\{ focus: \{ on: false \} \}/);
  assert.match(fn, /patchTask\(\{ dueAt \}/);
  // 낙관 패치는 드롭한 열을 한 엔트리로 선언한다(버킷·날짜·선택 해제를 함께).
  assert.match(fn, /\{ bucket: bucketKey, whenAt: dueAt \|\| null, focusToday: false \}/);
  // toggleFocus·rescheduleTask를 겹쳐 부르면 각자의 clearPatch가 상대의 낙관 상태를 지운다.
  assert.doesNotMatch(fn, /toggleFocus\(|rescheduleTask\(/);
  // reload·clearPatch는 마지막에 한 번만.
  assert.equal((fn.match(/reload\(\)/g) || []).length, 1);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// 첫 화면 슬롯 순서를 고정한다.
//
// 2026-09-20 이전에는 빠른 입력이 3번째 슬롯, 오늘 할 일 목록이 **9번째**(신호 아래)였다.
// 할 일을 적는 자리와 적은 결과가 보이는 자리가 떨어져 있어서 방금 넣은 것이 보이지 않았다.
// `docs/README.md` 의 운영자 확정("첫 화면은 **할 일**, 매출, 메시지, 기획, 콘텐츠 순서의
// 판단을 돕는다")도 할 일을 1순위로 적고 있었으므로, 구현이 문서를 따라가지 못한 쪽이었다.
// 2026-09-20 운영자 재확정으로 캡처 바로 아래로 올렸다. 긴급 KA·집중 고객 ≤5 제한은 그대로다.

const source = await readFile(new URL("./daily-brief.jsx", import.meta.url), "utf8");

// JSX 주석 안의 컴포넌트 이름 언급이 순서 판정을 흔들지 않도록 주석을 지우고 본다.
const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const indexOf = (marker) => {
  const at = code.indexOf(marker);
  assert.ok(at > 0, `${marker} 를 찾지 못했다 — 테스트가 소스와 어긋났다`);
  return at;
};

test("오늘 할 일이 빠른 입력 바로 다음에 온다", () => {
  const capture = indexOf("<QuickCaptureForm");
  const tasks = indexOf("<TaskToday");
  const focus = indexOf("<FocusSlots");
  const nav = indexOf("<BriefNavigation");

  assert.ok(capture < tasks, "할 일 목록이 빠른 입력보다 앞에 있다");
  assert.ok(tasks < focus, "할 일 목록이 긴급 KA·집중 고객(FocusSlots)보다 뒤에 있다 — 폴드 밖으로 밀린다");
  assert.ok(tasks < nav, "할 일 목록이 빠른 이동 칩보다 뒤에 있다");
});

test("긴급 KA·집중 고객 슬롯은 그대로 남아 있다", () => {
  // 할 일을 올린 것이지 확정 슬롯을 없앤 것이 아니다.
  assert.match(code, /<FocusSlots\s/, "FocusSlots 가 사라졌다");
  assert.match(code, /<BriefNavigation\s/, "빠른 이동이 사라졌다");
});

test("할 일 목록은 한 벌만 렌더된다", () => {
  // 옮기다 두 벌이 남으면 같은 목록이 화면에 두 번 나온다.
  assert.equal((code.match(/<TaskToday\s/g) || []).length, 1, "TaskToday 렌더가 1개가 아니다");
  assert.equal((code.match(/<QuickCaptureForm\s/g) || []).length, 1, "QuickCaptureForm 렌더가 1개가 아니다");
});

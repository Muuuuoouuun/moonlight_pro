import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { keyboardInset } from "./visual-viewport.js";

test("the keyboard inset is what the visible viewport lost at the bottom", () => {
  // 키보드 없음 — 보이는 창이 배치 창과 같다.
  assert.deepEqual(keyboardInset({ innerHeight: 844, viewportHeight: 844, offsetTop: 0 }), { keyboard: 0, viewport: 844 });
  // 키보드가 올라왔다(배치 창은 그대로, 보이는 창만 줄었다 — iOS Safari · Android Chrome 108+).
  assert.deepEqual(keyboardInset({ innerHeight: 844, viewportHeight: 508, offsetTop: 0 }), { keyboard: 336, viewport: 508 });
  // 브라우저가 배치 창까지 줄였다(옛 Android · resizes-content) — 더 올릴 것이 없다.
  assert.deepEqual(keyboardInset({ innerHeight: 508, viewportHeight: 508, offsetTop: 0 }), { keyboard: 0, viewport: 508 });
});

test("an iOS pan is not keyboard — the visible viewport's offset is taken out", () => {
  // iOS가 입력 칸을 보이려고 보이는 창을 120px 아래로 끌었다 — 그만큼은 키보드가 아니다.
  assert.deepEqual(keyboardInset({ innerHeight: 844, viewportHeight: 508, offsetTop: 120 }), { keyboard: 216, viewport: 508 });
  // 끌린 만큼이 가려진 높이보다 커도 음수가 되지 않는다.
  assert.deepEqual(keyboardInset({ innerHeight: 844, viewportHeight: 508, offsetTop: 400 }), { keyboard: 0, viewport: 508 });
});

test("without a visual viewport nothing is raised — never a negative or NaN inset", () => {
  // visualViewport가 없는 브라우저 · 서버.
  assert.deepEqual(keyboardInset({ innerHeight: 800 }), { keyboard: 0, viewport: 800 });
  assert.deepEqual(keyboardInset({ innerHeight: 800, viewportHeight: undefined, offsetTop: undefined }), { keyboard: 0, viewport: 800 });
  assert.deepEqual(keyboardInset(), { keyboard: 0, viewport: 0 });
  // 확대(핀치 줌)로 보이는 창이 더 커 보이는 값이 와도 음수로 내려가지 않는다.
  assert.deepEqual(keyboardInset({ innerHeight: 700, viewportHeight: 760, offsetTop: 0 }), { keyboard: 0, viewport: 760 });
  for (const odd of [NaN, "x", null, -5]) {
    const inset = keyboardInset({ innerHeight: odd, viewportHeight: odd, offsetTop: odd });
    assert.ok(Number.isFinite(inset.keyboard) && inset.keyboard >= 0, String(odd));
    assert.ok(Number.isFinite(inset.viewport) && inset.viewport >= 0, String(odd));
  }
});

// 계산은 한 곳이다 — 빠른 메모와 전체 높이 기록 시트가 같은 훅으로 같은 값을 쓴다.
test("the quick memo and the full-height sheet share one hook and one formula", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const hook = read("../components/hub/use-keyboard-inset.js");
  assert.match(hook, /import \{ keyboardInset \} from "@\/lib\/visual-viewport";/);
  assert.match(hook, /keyboardInset\(\{ innerHeight: window\.innerHeight, viewportHeight: viewport\?\.height, offsetTop: viewport\?\.offsetTop \}\)/);
  // 보이는 창의 크기와 끌림(스크롤) 둘 다 듣고, 떠날 때 둘 다 뗀다.
  for (const event of ["resize", "scroll"]) {
    assert.match(hook, new RegExp(`viewport\\?\\.addEventListener\\("${event}", update\\);`));
    assert.match(hook, new RegExp(`viewport\\?\\.removeEventListener\\("${event}", update\\);`));
  }
  // 끄면 적어 둔 값을 지운다 — 스타일시트의 기본값으로 돌아간다.
  assert.match(hook, /if \(!enabled \|\| !el \|\| typeof window === "undefined"\) return undefined;/);
  assert.match(hook, /el\.style\.removeProperty\(keyboardVar\)/);

  const memo = read("../components/hub/quick-memo.jsx");
  assert.match(memo, /useKeyboardInset\(root, \{ keyboardVar: "--memo-keyboard", viewportVar: "--memo-viewport" \}\);/);
  assert.doesNotMatch(memo, /window\.visualViewport|innerHeight/, "빠른 메모는 계산을 다시 쓰지 않는다");

  const primitives = read("../components/hub/hub-primitives.jsx");
  assert.match(primitives, /useKeyboardInset\(asideRef, \{ enabled: fullSheet, keyboardVar: '--hub-sheet-keyboard', viewportVar: '--hub-sheet-viewport' \}\);/);
});

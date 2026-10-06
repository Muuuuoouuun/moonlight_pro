import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const toastSource = await readFile(new URL("./hub-toast.jsx", import.meta.url), "utf8");
const toastCss = await readFile(new URL("./hub-toast.css", import.meta.url), "utf8");
const primitivesSource = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const appSource = await readFile(new URL("./hub-app.jsx", import.meta.url), "utf8");

test("toast primitives and hook are properly exported", () => {
  assert.match(toastSource, /export function ToastProvider\b/);
  assert.match(toastSource, /export function useToast\b/);
  assert.match(primitivesSource, /export \{ useToast, ToastProvider \} from '\.\/hub-toast';/);
  assert.match(appSource, /import \{ ToastProvider \} from "\.\/hub-toast";/);
  assert.match(appSource, /<ToastProvider>/);
});

test("toast conforms to accessibility and DESIGN.md tokens", () => {
  // A11y live region
  assert.match(toastSource, /aria-live="polite"/);
  assert.match(toastSource, /role=\{isDanger \? "alert" : "status"\}/);
  // Design tokens
  assert.match(toastCss, /var\(--elevated\)/);
  assert.match(toastCss, /var\(--line-strong\)/);
  assert.match(toastCss, /var\(--shadow-pop\)/);
  assert.match(toastCss, /var\(--dur-panel\)/);
  assert.match(toastCss, /var\(--ease-hub\)/);
});

test("errors stay longer, and reading pauses only toasts whose action does not expire", () => {
  assert.match(toastSource, /DANGER_DURATION = 7000/);
  assert.match(toastSource, /options\.duration \?\? \(tone === "danger" \? DANGER_DURATION : DEFAULT_DURATION\)/);
  // 되돌리기처럼 행동이 붙은 알림은 그 행동의 유효 시간과 맞물려 멈추지 않는다.
  assert.match(toastSource, /startTimer\(id, duration, !action\)/);
  for (const handler of ["onMouseEnter={pauseTimers}", "onMouseLeave={resumeTimers}", "onFocus={pauseTimers}", "onBlur={resumeTimers}"]) {
    assert.ok(toastSource.includes(handler), handler);
  }
  // 손으로 닫은 알림의 타이머는 남지 않는다.
  assert.match(toastSource, /const dismiss = React\.useCallback\(\(id\) => \{\s*clearTimer\(id\);/);
});

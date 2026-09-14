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

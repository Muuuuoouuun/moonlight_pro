import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

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
  // 손으로 닫은 알림의 타이머는 남지 않는다.
  assert.match(toastSource, /const dismiss = React\.useCallback\(\(id\) => \{\s*clearTimer\(id\);/);
});

// Execute the real provider callbacks with deterministic hook state and time.
// No browser, real timers, or production messages are needed for this ordering race.
function providerFixture() {
  let now = 0, serial = 0;
  const jobs = new Map(), states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  const React = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useCallback: fn => fn,
    useMemo: fn => fn(),
  };
  const setTimeout = (fn, delay) => { const id = ++serial; jobs.set(id, { fn, at: now + delay }); return id; };
  const clearTimeout = id => jobs.delete(id);
  const code = ts.transpileModule(toastSource.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, ''), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Provider = new Function('React', 'Iconed', 'Button', 'Date', 'setTimeout', 'clearTimeout', `${code}\nreturn ToastProvider;`)(
    React, () => null, () => null, { now: () => now }, setTimeout, clearTimeout,
  );
  const render = () => { stateIndex = refIndex = 0; return Provider({ children: null }); };
  const element = render();
  const handlers = element.props.children[1].props;
  const advance = ms => {
    const until = now + ms;
    for (;;) {
      const next = [...jobs.entries()].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; jobs.delete(next[0]); next[1].fn();
    }
    now = until;
  };
  return { show: element.props.value, handlers, advance, toasts: () => states[0] };
}

const blurOutside = { currentTarget: { contains: () => false }, relatedTarget: null };
const blurInside = { currentTarget: { contains: () => true }, relatedTarget: {} };

test('mouse leaving cannot expire a toast while its close button still has keyboard focus', () => {
  const f = providerFixture();
  f.show('synthetic notice', { id: 'notice', duration: 1000 });
  f.handlers.onMouseEnter();
  f.handlers.onFocus();
  f.handlers.onMouseLeave();
  f.advance(2000);
  assert.equal(f.toasts()[0]?.exiting, false);
  f.handlers.onBlur(blurOutside);
  f.advance(1199);
  assert.equal(f.toasts()[0]?.exiting, false);
  f.advance(1);
  assert.equal(f.toasts()[0]?.exiting, true);
});

test('focus moving between toast controls stays paused and pointer hover still protects after blur', () => {
  const f = providerFixture();
  f.show('synthetic notice', { id: 'notice', duration: 1000 });
  f.handlers.onFocus();
  f.handlers.onBlur(blurInside);
  f.advance(2000);
  assert.equal(f.toasts()[0]?.exiting, false);
  f.handlers.onMouseEnter();
  f.handlers.onBlur(blurOutside);
  f.advance(2000);
  assert.equal(f.toasts()[0]?.exiting, false);
  f.handlers.onMouseLeave();
  f.advance(1200);
  assert.equal(f.toasts()[0]?.exiting, true);
});

test('new ordinary notices pause during reading while expiring actions keep their deadline', () => {
  const f = providerFixture();
  f.handlers.onFocus();
  f.show('synthetic ordinary notice', { id: 'ordinary', duration: 1000 });
  f.show('synthetic action notice', { id: 'action', duration: 1000, action: { label: 'undo', onClick() {} } });
  f.advance(1000);
  assert.equal(f.toasts().find(t => t.id === 'ordinary').exiting, false);
  assert.equal(f.toasts().find(t => t.id === 'action').exiting, true);
  f.advance(150);
  assert.equal(f.toasts().length, 1);
  f.handlers.onBlur(blurOutside);
  f.advance(1200);
  assert.equal(f.toasts()[0]?.exiting, true);
});

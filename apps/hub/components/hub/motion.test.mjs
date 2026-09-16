import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

// DESIGN.md §9: 2026-07-29 이후 유일하게 허용되는 duration은 hub-tokens.css의 모션 토큰
// (--dur-hover/enter/panel/overlay, --stagger-step)이고 곡선은 --ease-hub다. 페이지 안 raw
// `ms` 리터럴은 갚아야 할 부채다 (CLAUDE.md UI 체크). 이 파일은 apps/hub 아래 CSS·JSX·JS를
// 전부 훑어 transition/animation 선언 값 안의 `Nms`와 인라인 `cubic-bezier(`를 잡는다.
// - hub-tokens.css의 토큰 정의 줄(--dur-*, --ease-hub, --stagger-step)은 정의 자체라 예외.
// - globals.css는 public web과 hub를 섞어 담으므로 `.hub-app`이 셀렉터에 든 규칙만 본다
//   (public `.button`은 hub 토큰 스코프 밖이라 var()가 풀리지 않는다).
// - `s` 단위(mlMoonPulse 1.4s 등 §9가 명시한 라이브 인디케이터 루프)는 대상이 아니다.
// - JS 숫자 상수(STRIKE_MS = 180)와 주석은 선언 값이 아니라 대상이 아니다.
async function collect(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) await collect(child, acc);
    else if (/\.(css|jsx|js)$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) {
      acc.push([child.pathname.replace(/.*\/apps\/hub\//, "apps/hub/"), await readFile(child, "utf8")]);
    }
  }
  return acc;
}
const sources = await collect(new URL("../../", import.meta.url));
const MS = /(?<![\w.-])\d+(?:\.\d+)?ms\b/;
const BEZIER = /cubic-bezier\(/;

function cssOffenders(path, css) {
  const out = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (/^@/.test(selector) || (path.endsWith("app/globals.css") && !selector.includes(".hub-app"))) continue;
    for (const decl of m[2].split(";")) {
      const [prop, ...rest] = decl.split(":");
      const value = rest.join(":").trim();
      if (!/^\s*(transition|animation)(-[a-z]+)?$/.test(prop || "")) continue;
      if (MS.test(value) || BEZIER.test(value)) out.push(`${path}: ${selector.slice(0, 70)} → ${prop.trim()}: ${value}`);
    }
  }
  return out;
}
function jsxOffenders(path, src) {
  const out = [];
  // 인라인 style 객체의 transition/animation 계열 키. 값은 문자열 리터럴·템플릿·삼항 안의 문자열까지 본다.
  for (const m of src.matchAll(/\b(transition|animation)(?:Delay|Duration|TimingFunction|Property)?\s*:\s*([^,\n}]+)/g)) {
    const value = m[2];
    if (/^\s*(reducedMotion|prefersReduced)/.test(value) && !MS.test(value)) continue;
    if (MS.test(value) || BEZIER.test(value)) out.push(`${path}:${src.slice(0, m.index).split("\n").length} → ${m[1]}: ${value.trim().slice(0, 90)}`);
  }
  return out;
}

test("hub motion uses only the §9 tokens — no raw ms literals or inline cubic-bezier in transition/animation values", () => {
  assert.ok(sources.length > 50, `sweep must reach the tree, saw ${sources.length}`);
  const offenders = [];
  for (const [path, src] of sources) {
    if (path.endsWith(".css")) offenders.push(...cssOffenders(path, src));
    else offenders.push(...jsxOffenders(path, src));
  }
  assert.deepEqual(offenders, [], "raw ms / inline cubic-bezier in a motion value — use var(--dur-*) / var(--ease-hub) (DESIGN.md 9)");
});

test("motion tokens and the reveal classes stay defined as §9 specifies", () => {
  const tokens = sources.find(([p]) => p.endsWith("hub-tokens.css"))[1];
  for (const [name, value] of [["--dur-hover", "120ms"], ["--dur-enter", "200ms"], ["--dur-panel", "180ms"], ["--dur-overlay", "160ms"], ["--stagger-step", "45ms"], ["--ease-hub", "cubic-bezier(0.2, 0.7, 0.3, 1)"]]) {
    assert.match(tokens, new RegExp(`${name.replace(/[-]/g, "\\-")}:\\s*${value.replace(/[().,]/g, "\\$&")}`), `${name} must be ${value}`);
  }
  // 진입/퇴장 곡선은 언제나 --ease-hub (§9 표). .fade-up이 ease-out으로 새던 것을 고정.
  assert.match(tokens, /\.hub-app \.fade-up \{ animation: mlFadeUp var\(--dur-enter\) var\(--ease-hub\); \}/);
  assert.match(tokens, /\.hub-app \.stagger-up > \* \{ animation: mlFadeUp var\(--dur-enter\) var\(--ease-hub\) both; \}/);
  // 허브 전역 reduced-motion 안전망 — 새 애니메이션이 자동으로 상속한다.
  assert.match(tokens, /@media \(prefers-reduced-motion: reduce\) \{\s*\.hub-app \*, \.hub-app \*::before, \.hub-app \*::after \{[^}]*animation: none !important;[^}]*transition: none !important;/);
  // 안티-공회전: 스윕이 실제로 모션 선언을 보고 있다.
  const seen = sources.reduce((n, [, s]) => n + (s.match(/\btransition\s*:/g) || []).length, 0);
  assert.ok(seen >= 40, `transition 선언 추출 실패 — saw ${seen}`);
});

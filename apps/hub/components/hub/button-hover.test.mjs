import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

// 2026-09-15 회귀 방어. Button은 2026-07-29 design-review 이후로
// `transition: background var(--dur-hover)…`를 선언해 두고도 :hover 규칙이 한 곳도
// 없어서 전이가 한 번도 발동하지 않았다. 원인은 특이도다 — variant의 휴지 배경/보더/
// 색이 인라인이면 어떤 클래스 hover 규칙도 이길 수 없다. 이 파일은 (1) 클래스가
// 붙어 있고 (2) 휴지 chrome이 인라인으로 되돌아오지 않았고 (3) 5개 variant 전부
// CSS hover를 갖고 (4) hover가 토큰·중립을 유지하는 것을 한꺼번에 고정한다.

const primitivesSource = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");

const VARIANTS = ["primary", "secondary", "ghost", "outline", "danger"];

const buttonSource = primitivesSource.match(/export const Button = React\.forwardRef\([\s\S]*?\n\}\);/)?.[0];

// 규칙 추출은 줄머리에 flush-left로 선언된 `.hub-app .hub-btn…` 선택자만 잡는다
// (주석 안의 언급이 규칙으로 오인되지 않게).
const buttonRules = [...css.matchAll(/\n(\.hub-app \.hub-btn[^{}]*?)\s*\{([^}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body }));

test("Button carries the shared hover classes and never overwrites the caller's className", () => {
  assert.ok(buttonSource, "Button component body must be findable in hub-primitives.jsx");
  assert.match(buttonSource, /const cls = \['hub-btn', `hub-btn--\$\{variant\}`, className\]\.filter\(Boolean\)\.join\(' '\)/);
  assert.match(buttonSource, /className=\{cls\}/);
  // className={className} 로 되돌리면 hub-btn 쪽이 사라져 hover가 다시 죽는다.
  assert.doesNotMatch(buttonSource, /className=\{className\}/);
});

test("Button keeps no resting variant chrome inline — inline styles outrank every hover rule", () => {
  for (const prop of ["background", "border", "boxShadow", "color"]) {
    assert.doesNotMatch(
      buttonSource,
      new RegExp(`(?<![A-Za-z])${prop}:`),
      `${prop} must live in hub-tokens.css .hub-btn--*, not inline on <button> — inline wins the cascade and kills :hover`,
    );
  }
  assert.doesNotMatch(buttonSource, /const variants = \{/);
  // 인라인 raw oklch/hex도 함께 사라졌는지 확인 (CLAUDE.md UI 체크리스트).
  assert.doesNotMatch(buttonSource, /oklch\(|#[0-9a-fA-F]{3,8}\b/);
});

test("Button never reintroduces JS hover handlers (DESIGN.md 8.1)", () => {
  assert.doesNotMatch(buttonSource, /onMouseEnter|onMouseLeave/);
});

test("the ghost pressed state is a data attribute the stylesheet owns", () => {
  assert.match(buttonSource, /data-active=\{active \? 'true' : undefined\}/);
  assert.match(css, /\.hub-app \.hub-btn--ghost\[data-active="true"\]\s*\{[^}]*background:\s*var\(--surface-2\)/);
});

test("every Button variant has a resting rule and a hover rule a disabled button cannot trigger", () => {
  assert.ok(buttonRules.length >= 12, `expected the .hub-btn block, found ${buttonRules.length} rules`);
  for (const variant of VARIANTS) {
    assert.match(
      css,
      new RegExp(`\\n\\.hub-app \\.hub-btn--${variant}\\s*\\{`),
      `${variant} resting chrome must live in hub-tokens.css`,
    );
    assert.match(
      css,
      new RegExp(`\\n\\.hub-app \\.hub-btn--${variant}:hover:not\\(:disabled\\)\\s*\\{[^}]+\\}`),
      `${variant} needs a CSS hover rule guarded against :disabled (DESIGN.md 8.1)`,
    );
  }
});

test("Button chrome uses only design tokens and 1px borders", () => {
  for (const { selector, body } of buttonRules) {
    assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, `${selector}: hex literals are forbidden, use tokens (DESIGN.md 5.1)`);
    assert.doesNotMatch(body, /\brgba?\(|\bhsla?\(/, `${selector}: use tokens (DESIGN.md 5.1)`);
    for (const [, value] of body.matchAll(/\b(?:background|color|border-color)\s*:\s*([^;]+);/g)) {
      assert.match(
        value.trim(),
        /^(var\(--[a-z0-9-]+\)|transparent)$/,
        `${selector}: "${value.trim()}" must be a token or transparent`,
      );
    }
    for (const [, value] of body.matchAll(/(?<![\w-])border\s*:\s*([^;]+);/g)) {
      assert.match(
        value.trim(),
        /^1px solid (var\(--[a-z0-9-]+\)|transparent)$/,
        `${selector}: borders are always 1px + a --line*/token colour (DESIGN.md 5.2)`,
      );
    }
  }
  // 유일한 예외: primary의 inset/drop shadow는 구 인라인 값을 그대로 옮긴 것이다.
  // --shadow-* 토큰으로의 승격은 별도 후속 작업.
  const primary = buttonRules.find((r) => r.selector === ".hub-app .hub-btn--primary");
  assert.match(primary.body, /box-shadow: 0 1px 0 0 oklch\(1 0 0 \/ 0\.2\) inset, 0 2px 8px -2px oklch\(0 0 0 \/ 0\.3\);/);
});

test("Button hover is neutral emphasis, never accent or a semantic category colour", () => {
  for (const { selector, body } of buttonRules.filter((r) => r.selector.includes(":hover"))) {
    assert.doesNotMatch(
      body,
      /--accent|--success|--warning|--info|--personal|--company/,
      `${selector}: hover means "the pointer is here", not current/selected or a category (DESIGN.md 5.2)`,
    );
  }
  // danger만 hover에서 색을 유지한다 — .hub-iconbtn--danger와 같은 이유.
  const dangerHover = buttonRules.find((r) => r.selector === ".hub-app .hub-btn--danger:hover:not(:disabled)");
  assert.match(dangerHover.body, /color:\s*var\(--danger\)/);
  assert.match(dangerHover.body, /border-color:\s*var\(--danger\)/);
  assert.doesNotMatch(dangerHover.body, /background:/);
});

test("Button motion uses the shared tokens and stays reduced-motion safe (DESIGN.md 9)", () => {
  const base = buttonRules.find((r) => r.selector === ".hub-app .hub-btn");
  assert.ok(base, ".hub-app .hub-btn base rule must exist");
  assert.match(base.body, /transition:[^;]*var\(--dur-hover\)/);
  for (const { selector, body } of buttonRules) {
    assert.doesNotMatch(body, /\d+ms/, `${selector}: raw ms literals are forbidden, use --dur-* (DESIGN.md 9)`);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.hub-app \.hub-btn \{ transition: none; \}\s*\}/);
  // 허브 전역 안전망이 여전히 !important로 인라인까지 덮는지 확인.
  assert.match(css, /\.hub-app \*, \.hub-app \*::before, \.hub-app \*::after \{[\s\S]*?transition: none !important/);
});

test("Button radius stays inline (IconButton parity) and no .hub-btn rule owns it (DESIGN.md 7)", () => {
  // radius는 hover 전이 대상이 아니므로 CSS 소유일 이유가 없다. IconButton과 같은 방식.
  // 전역 `:focus-visible`이 border-radius를 덮던 문제는 focus-ring.test.mjs가 별도로 막는다.
  assert.match(buttonSource, /borderRadius:\s*'var\(--r-sm\)'/);
  for (const { selector, body } of buttonRules) {
    assert.doesNotMatch(body, /border-radius:/, `${selector}: radius stays inline like IconButton`);
  }
});

test("Button never suppresses the keyboard focus ring (DESIGN.md 11)", () => {
  for (const { selector, body } of buttonRules) {
    assert.doesNotMatch(body, /outline:\s*none/, `${selector}: would remove the :focus-visible ring`);
  }
  assert.doesNotMatch(buttonSource, /outline:\s*['"]?none/);
  assert.match(css, /\.hub-app :focus-visible \{ outline: 1px solid var\(--moon-300\); outline-offset: 2px;/);
});

// 2026-09-15 검증 기록: globals.css / hub-tokens.css에 남은 네 개의 bespoke
// `button:hover` 블록은 Button primitive의 중복이 아니라 raw <button>을 겨냥한다.
// 그래서 삭제하지 않았다. 아래가 그 근거를 코드로 고정한다 — 이 컨테이너들이
// <Button>으로 바뀌는 날 테스트가 깨지면서 중복 규칙을 지우라고 알려준다.
test("the bespoke button:hover rules left in place target raw <button>, not the Button primitive", async () => {
  const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
  const portfolio = await read("./pages/project-portfolio-workspace.jsx");
  const createDrawer = await read("./pages/project-create-drawer.jsx");
  const topbar = await read("./hub-topbar.jsx");

  const slice = (src, startNeedle, endNeedle) => {
    const start = src.indexOf(startNeedle);
    assert.ok(start >= 0, `missing ${startNeedle}`);
    const end = src.indexOf(endNeedle, start);
    assert.ok(end > start, `missing ${endNeedle} after ${startNeedle}`);
    return src.slice(start, end);
  };

  const filters = slice(portfolio, 'className="hub-project-portfolio-index__filters"', "</div>");
  assert.match(filters, /<button type="button" aria-pressed=/);
  assert.doesNotMatch(filters, /<Button/);

  const footer = slice(portfolio, 'className="hub-project-portfolio-index__footer"', "</div>");
  assert.match(footer, /<button type="button" onClick=/);
  assert.doesNotMatch(footer, /<Button/);

  const terminalRow = slice(portfolio, 'className="hub-project-portfolio-terminal__row"', "</div>");
  assert.doesNotMatch(terminalRow, /<Button/);

  assert.match(createDrawer, /<button\s+type="button"\s+className="project-create-disclosure__trigger"/);

  const tabs = slice(topbar, 'className="hub-topbar__tabs"', "</nav>");
  assert.match(tabs, /<button\n/);
  assert.doesNotMatch(tabs, /<Button/);
});

// `.hub-app .hub-btn--<variant>`는 특이도 (0,2,0)이다. 클래스를 2개 이상 쓰면서
// bare `button` 엘리먼트를 겨냥하는 descendant 규칙은 이를 이기므로, 그런 컨테이너에
// <Button> 프리미티브를 넣는 순간 variant chrome이 조용히 덮인다 — 인라인이던
// 시절에는 불가능했던 회귀다. 그래서 목록을 손으로 들고 있지 않고 실제로 훑는다.
// 새 규칙이 생기면 이 테스트가 실패해서 사람이 한 번 보게 만드는 게 목적이다.
const CHROME = /(?:^|[;{\s])(?:background|color|border)(?:-[a-z]+)?\s*:/;

function qualifyingButtonRules(css) {
  const found = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectorList = m[1].trim();
    const body = m[2];
    if (!CHROME.test(body)) continue;
    for (const selector of selectorList.split(",").map(s => s.trim())) {
      // 주체(맨 마지막 compound)가 button인 규칙만 센다. `.x button span`처럼 button
      // 내부 엘리먼트를 겨냥하는 규칙은 button 자신의 chrome을 덮지 못한다.
      const subject = selector.split(/[\s>+~]+/).filter(Boolean).pop() || "";
      if (!/^button(?:[:[.]|$)/.test(subject)) continue;
      const classes = (selector.match(/\.[A-Za-z_-][\w-]*/g) || []).length
        + (selector.match(/\[[^\]]+\]/g) || []).length
        + (selector.match(/:(?!:)(?!hover\b|focus-visible\b|disabled\b)[a-z-]+/g) || []).length;
      if (classes >= 2) found.push(selector);
    }
  }
  return found;
}

// 검증 완료(2026-09-15): 아래 셀렉터의 컨테이너는 전부 raw <button>만 렌더한다.
// 새 항목을 추가하려면 해당 JSX를 직접 읽고 <Button> 프리미티브가 없는지 확인할 것.
const AUDITED_RAW_BUTTON_CONTAINERS = [
  // project-portfolio-workspace.jsx — index 필터/푸터, terminal 행 2개 모두 raw <button>
  ".hub-app .hub-project-portfolio-index__filters button",
  '.hub-app .hub-project-portfolio-index__filters button[data-active="true"]',
  ".hub-app .hub-project-portfolio-index__filters button:hover",
  ".hub-app .hub-project-portfolio-index__footer button",
  ".hub-app .hub-project-portfolio-index__footer button:hover",
  ".hub-app .hub-project-portfolio-schedule-list > button",
  ".hub-app .hub-project-portfolio-terminal > button",
  ".hub-app .hub-project-portfolio-terminal__row > button:first-child",
  ".hub-app .hub-project-portfolio-terminal__row > button:last-child",
  ".hub-app .hub-project-portfolio-terminal__row > button:last-child:hover",
  // project-portfolio-workspace.jsx — 모바일 관리 메뉴와 급한 하위 항목 레일도 raw <button>
  ".hub-app .hub-project-portfolio-mobile-manage > div > button",
  ".hub-app .hub-project-portfolio-mobile-manage > div > button:hover",
  ".hub-app .hub-project-portfolio-urgent__list > button",
  // hub-topbar.jsx — 탭은 raw <button>, 유일한 <Button>은 nav 밖의 primary action이다
  ".hub-app .hub-topbar__tabs button",
  '.hub-topbar__tabs button[aria-current="page"]',
  '.hub-topbar__tabs button[aria-current="page"]::after',
  '.hub-app .hub-topbar__tabs button[aria-selected="true"]',
  // daily-review.jsx / discovery.jsx — 둘 다 <button className="hub-row">
  ".hub-app .daily-review-history li button",
  '.daily-review-history li button[aria-current="date"]',
  ".hub-app .discovery-list li > button",
  // memo-workspace.jsx (CSS module) — 필터는 raw <button aria-pressed>
  ".workspace .filters button",
  '.workspace .filters button[aria-pressed="true"]',
  // project-work-list.jsx (CSS module) — 추가 항목 유형 메뉴는 raw <button aria-pressed>
  '.addOptions button[aria-pressed="true"]',
];

test("every high-specificity descendant button rule under apps/hub is audited (DESIGN.md 8.1)", async () => {
  const dir = new URL("../../", import.meta.url);
  const files = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".next")) continue;
      const child = new URL(`${e.name}${e.isDirectory() ? "/" : ""}`, d);
      if (e.isDirectory()) await walk(child);
      else if (e.name.endsWith(".css")) files.push(child);
    }
  };
  await walk(dir);
  assert.ok(files.length >= 10, `CSS 스윕이 트리에 닿아야 한다, saw ${files.length}`);

  const seen = new Set();
  for (const f of files) {
    for (const sel of qualifyingButtonRules(await readFile(f, "utf8"))) seen.add(sel);
  }
  const unaudited = [...seen].filter(s => !AUDITED_RAW_BUTTON_CONTAINERS.includes(s)).sort();
  assert.deepEqual(
    unaudited,
    [],
    "새 고특이도 descendant button 규칙이다 — 컨테이너 JSX를 읽고 <Button> 프리미티브가 없는지 확인한 뒤 AUDITED_RAW_BUTTON_CONTAINERS에 추가하라",
  );
});

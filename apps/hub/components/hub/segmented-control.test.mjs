import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// SegmentedControl은 §8.1이 "필터/뷰 토글의 canonical"로 못 박은 primitive인데(호출처 31곳),
// Button처럼 색·배경을 인라인으로 들고 있어 어떤 :hover/전이도 붙을 수 없었다 — 인라인
// 선언이 모든 클래스 규칙을 이긴다(§15 2026-09-15 Button 결정과 같은 cascade). 휴지 chrome을
// .hub-seg__btn / [aria-pressed="true"]로 옮기고 --dur-hover 전이를 준다. 이 파일이 그 계약을 고정한다.
const primitives = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");
const start = primitives.indexOf("export function SegmentedControl(");
const end = primitives.indexOf("\n}\n", start) + 3;
const seg = primitives.slice(start, end);
assert.ok(start >= 0 && end > start, "SegmentedControl body must be findable");

test("SegmentedControl buttons carry the CSS class and keep no resting chrome inline", () => {
  assert.match(seg, /className=\{\['hub-seg', className\]\.filter\(Boolean\)\.join\(' '\)\}/, "group composes caller className, never overwrites it");
  assert.match(seg, /className="hub-seg__btn"/);
  assert.match(seg, /aria-pressed=\{isActive\}/, "active state is the aria attribute the CSS selects on — one source of truth");
  for (const prop of ["color", "background", "border"]) {
    assert.doesNotMatch(seg, new RegExp(`(?<![A-Za-z])${prop}:`), `${prop} must live in hub-tokens.css .hub-seg__btn — inline would kill :hover and the transition`);
  }
  assert.doesNotMatch(seg, /onMouseEnter|onMouseLeave/, "DESIGN.md 8.1: no JS hover");
});

test("hub-tokens.css owns rest / active / hover for .hub-seg__btn with the hover token (DESIGN.md 8.1, 9)", () => {
  const rule = (sel) => { const m = css.match(new RegExp(`\\n\\.hub-app ${sel.replace(/[.[\]"=:()]/g, "\\$&")} \\{([^}]*)\\}`)); assert.ok(m, `missing rule: .hub-app ${sel}`); return m[1]; };
  const rest = rule(".hub-seg__btn");
  assert.match(rest, /color:\s*var\(--fg-faint\)/);
  assert.match(rest, /background:\s*transparent/);
  assert.match(rest, /transition:[^;]*var\(--dur-hover\)/);
  assert.doesNotMatch(rest, /\d+ms/);
  const active = rule('.hub-seg__btn[aria-pressed="true"]');
  assert.match(active, /background:\s*var\(--surface-3\)/);
  assert.match(active, /color:\s*var\(--fg\)/);
  const hover = rule('.hub-seg__btn:hover:not([aria-pressed="true"])');
  // hover는 중립 한 단계(§5.2 "hover stays neutral") — 배경은 건드리지 않고 글자만 한 칸 밝게.
  assert.match(hover, /color:\s*var\(--fg-muted\)/);
  assert.doesNotMatch(hover, /background/);
  assert.doesNotMatch(hover, /--moon-|--accent/);
});

test("the group container keeps its chrome in CSS and no rule sets border-radius on focus", () => {
  const m = css.match(/\n\.hub-app \.hub-seg \{([^}]*)\}/);
  assert.ok(m, ".hub-app .hub-seg rule must exist");
  assert.match(m[1], /background:\s*var\(--surface-2\)/);
  assert.match(m[1], /border:\s*1px solid var\(--line-soft\)/);
  assert.doesNotMatch(css, /\.hub-seg[^{]*:focus-visible[^{]*\{[^}]*border-radius/);
});

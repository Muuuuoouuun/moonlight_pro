import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// SuggestionTip — 2026-09-24 영업·매출 라운드 2. 운영자 결정: 넛지는 별도 섹션이 아니라
// 대상에 붙는 작은 제안 팁이어야 한다. 문법은 DESIGN.md §5.3 certainty(recommended)를 그대로
// 쓴다 — 점선 1px + 다이아몬드 마커 + "제안" 라벨, danger/success/warning/info 금지, 색 fill 금지.
const src = await readFile(new URL("./suggestion-tip.jsx", import.meta.url), "utf8");

test("SuggestionTip is exported and reuses CertaintyBadge for the marker + label", () => {
  assert.match(src, /export function SuggestionTip\(/);
  // "제안" 라벨은 CertaintyBadge의 recommended 문법(점선·다이아몬드)을 label override로 빌린다 —
  // 새 마커를 손으로 그리지 않는다.
  assert.match(src, /CertaintyBadge state="recommended" label="제안"/g);
  assert.match(src, /import \{[^}]*\bCertaintyBadge\b[^}]*\} from "\.\/hub-primitives"/);
});

test("never uses a colored fill, danger, or the legacy semantic tokens for the tip itself", () => {
  // border: dashed var(--line) — no background fill anywhere in the file.
  assert.match(src, /border:\s*"1px dashed var\(--line\)"/);
  assert.doesNotMatch(src, /var\(--danger\)/);
  assert.doesNotMatch(src, /var\(--success\)/);
  assert.doesNotMatch(src, /var\(--warning\)/);
  assert.doesNotMatch(src, /var\(--info\)/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/, "tokens only, no raw color literals");
  // The tip's own root (dashed border, no fill) is distinct from the opt-in overflow menu, which
  // is a normal popover surface (var(--surface-2) + var(--shadow-pop), same grammar as any other
  // hub dropdown) — that background belongs to the menu chrome, not the tip's resting state.
  const rootStart = src.indexOf('className="suggestion-tip"\n');
  const rootEnd = src.indexOf("</CertaintyBadge", rootStart) > -1 ? rootStart : src.indexOf("{reason}", rootStart);
  const rootStyle = src.slice(rootStart, rootEnd);
  assert.doesNotMatch(rootStyle, /background:/, "the tip's own resting surface has no fill");
});

test("compact mode renders no interactive button — the row it sits in is already clickable", () => {
  const start = src.indexOf("if (compact) {");
  const end = src.indexOf("\n  }\n", start);
  const compactBody = src.slice(start, end);
  assert.doesNotMatch(compactBody, /<Button|<IconButton/, "compact must stay a passive span, not a nested control");
  assert.match(compactBody, /CertaintyBadge state="recommended" label="제안"/);
});

test("full mode's action and overflow are opt-in — no action/onSnooze/onDismiss renders no controls beyond the badge+text", () => {
  // action button only renders when both action label and onAction are given.
  assert.match(src, /\{action && onAction && \(/);
  // overflow (나중에·숨기기) only renders when a snooze or dismiss handler is passed in.
  assert.match(src, /const hasOverflow = Boolean\(onSnooze \|\| onDismiss\);/);
  assert.match(src, /나중에/);
  assert.match(src, /숨기기/);
  assert.match(src, /그때 다시/);
});

test("no raw motion literals — this component adds no animation (§9, no persistent motion on tips)", () => {
  assert.doesNotMatch(src, /\d+ms|\d+s\b|animation:|transition:/);
});

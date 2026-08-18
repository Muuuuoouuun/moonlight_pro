import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const primitivesSource = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const tokensSource = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");

test("shared Moonstone accent token is exact and theme-stable", () => {
  const matches = tokensSource.match(/--accent:\s*#5274a8;/g) || [];
  assert.equal(matches.length, 2, "dark and light themes must share the exact Moonstone accent");
});

test("semantic state primitives are exported from the shared primitive layer", () => {
  for (const component of ["AttentionRail", "CertaintyBadge", "LifecycleBadge", "TruthBadge"]) {
    assert.match(primitivesSource, new RegExp(`export function ${component}\\b`));
  }
});

test("certainty is communicated by geometry and direct labels instead of semantic color", () => {
  assert.match(primitivesSource, /confirmed:\s*\{[^}]*label:\s*["']확정["'][^}]*borderStyle:\s*["']solid["']/s);
  assert.match(primitivesSource, /recommended:\s*\{[^}]*label:\s*["']권장["'][^}]*borderStyle:\s*["']dashed["']/s);
  assert.match(primitivesSource, /unknown:\s*\{[^}]*label:\s*["']미정["'][^}]*borderStyle:\s*["']dotted["']/s);
});

test("truth states stay neutral unless the source is actually in error", () => {
  assert.match(primitivesSource, /live:\s*\{[^}]*tone:\s*["']neutral["'][^}]*label:\s*["']live["']/s);
  assert.match(primitivesSource, /partial:\s*\{[^}]*tone:\s*["']neutral["'][^}]*label:\s*["']일부 데이터["']/s);
  // DESIGN.md §11 Source truth — 라벨은 운영자 문장이어야 한다(개발 토큰 노출 금지).
  assert.match(primitivesSource, /preview:\s*\{[^}]*tone:\s*["']neutral["'][^}]*label:\s*["']Preview · 연결 필요["']/s);
  assert.match(primitivesSource, /error:\s*\{[^}]*tone:\s*["']danger["'][^}]*label:\s*["']읽기 실패["']/s);
  assert.match(primitivesSource, /export function SyncBadge[\s\S]*?<TruthBadge state=\{state\}/);
});

test("urgent attention uses a one-pixel danger rail and a visible label", () => {
  assert.match(primitivesSource, /inset 1px 0 0 var\(--danger\)/);
  assert.match(primitivesSource, /urgent:\s*["']긴급["']/);
  assert.match(primitivesSource, /critical:\s*["']즉시 확인["']/);
});

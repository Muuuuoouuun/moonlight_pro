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
  assert.match(primitivesSource, /live:\s*\{[^}]*tone:\s*["']neutral["'][^}]*label:\s*["']실시간["']/s);
  assert.match(primitivesSource, /partial:\s*\{[^}]*tone:\s*["']neutral["'][^}]*label:\s*["']일부 데이터["']/s);
  assert.match(primitivesSource, /preview:\s*\{[^}]*tone:\s*["']neutral["'][^}]*label:\s*["']Preview · 연결 필요["']/s);
  assert.match(primitivesSource, /error:\s*\{[^}]*tone:\s*["']danger["'][^}]*label:\s*["']읽기 실패["']/s);
  assert.match(primitivesSource, /export function SyncBadge[\s\S]*?<TruthBadge state=\{state\}/);
});

test("truth badge labels are operator Korean, not raw state tokens", () => {
  // DESIGN §5.3/§10: 배지가 운영자에게 "믿어도 되는 화면인지"를 말해야 한다. `live`/`preview`/
  // `error`는 개발 토큰이라 다음 행동을 지시하지 못했다(2026-08-07 사용성 재감사 C).
  const truthBlock = primitivesSource.match(/const TRUTH_STATES = \{[\s\S]*?\n\};/);
  assert.ok(truthBlock, "TRUTH_STATES table must exist");
  for (const devToken of ["'live'", "'preview'", "'error'", "'partial'", "'syncing'", "'loading'"]) {
    assert.doesNotMatch(truthBlock[0], new RegExp(`label:\\s*${devToken}`));
  }
  // §5.3 preview 계약 문구 · §5.3 error는 평문 원인을 실을 슬롯을 갖는다.
  assert.match(primitivesSource, /export function TruthBadge\(\{[^}]*\breason\b/);
  assert.match(primitivesSource, /const fullLabel = reason \? `\$\{visibleLabel\} · \$\{reason\}` : visibleLabel;/);
  // 상태 라벨은 §6 mono 대상(ID·타임스탬프·키바인딩·계기 수치)이 아니다.
  const badgeBody = primitivesSource.match(/export function TruthBadge[\s\S]*?\n\}/);
  assert.doesNotMatch(badgeBody[0], /var\(--font-mono\)/);
});

test("urgent attention uses a one-pixel danger rail and a visible label", () => {
  assert.match(primitivesSource, /inset 1px 0 0 var\(--danger\)/);
  assert.match(primitivesSource, /urgent:\s*["']긴급["']/);
  assert.match(primitivesSource, /critical:\s*["']즉시 확인["']/);
});

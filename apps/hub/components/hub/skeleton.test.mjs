import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// DESIGN.md §11 "Loading / empty / success / error states are part of the design". 2026-09-04
// 아젠다 B2가 "스켈레톤 0개"를 모바일 성능 체감(60점)의 원인으로 명명했고, 로딩은 전부
// "불러오는 중…" 한 줄이었다. Skeleton primitive가 레이아웃을 예고한다. 펄스는 §9의 라이브
// 인디케이터 단일 duration(mlMoonPulse 1.4s)을 그대로 쓴다 — 새 duration을 만들지 않는다.
const primitives = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");
const app = await readFile(new URL("./hub-app.jsx", import.meta.url), "utf8");

test("Skeleton primitive exposes a status role, an accessible label, and CSS-owned lines", () => {
  const start = primitives.indexOf("export function Skeleton(");
  assert.ok(start >= 0, "Skeleton must be exported from hub-primitives.jsx");
  const body = primitives.slice(start, primitives.indexOf("\n}\n", start) + 3);
  assert.match(body, /role="status"/);
  assert.match(body, /aria-busy="true"/);
  assert.match(body, /aria-label=\{label\}/);
  assert.match(body, /label = '불러오는 중'/, "default accessible label is Korean operator copy (DESIGN.md 10)");
  assert.match(body, /className="hub-skeleton"/);
  assert.match(body, /className="hub-skeleton__line"/);
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/, "tokens only");
  assert.doesNotMatch(body, /\d+ms|animation:/, "motion lives in hub-tokens.css, never inline");
});

test("skeleton lines pulse with the single live-indicator duration and use surface tokens (DESIGN.md 9)", () => {
  const m = css.match(/\n\.hub-app \.hub-skeleton__line \{([^}]*)\}/);
  assert.ok(m, ".hub-app .hub-skeleton__line rule must exist");
  assert.match(m[1], /background:\s*var\(--surface-3\)/);
  assert.match(m[1], /border-radius:\s*var\(--r-xs\)/);
  assert.match(m[1], /animation:\s*mlMoonPulse 1\.4s ease-in-out infinite/);
  // 라인마다 위상을 어긋나게 하면 물결이 된다 — "deliberate, never playful"(§9). 지연 없음.
  assert.doesNotMatch(css, /\.hub-skeleton__line:nth-child/);
});

test("every route-level chunk load shows the skeleton instead of a bare text line", () => {
  const start = app.indexOf("function PageChunkFallback()");
  const body = app.slice(start, app.indexOf("\n}\n", start) + 3);
  assert.match(body, /<Skeleton/);
  assert.doesNotMatch(body, /불러오는 중…<\/span>/, "the old text-only fallback is gone");
  assert.match(app, /import \{[^}]*\bSkeleton\b[^}]*\} from "\.\/hub-primitives"/);
});

test("skeletons appear only in loading branches, never beside preview or error copy", async () => {
  for (const file of ["pages/brands.jsx", "pages/daily-brief.jsx", "pages/projects.jsx"]) {
    const src = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/<Skeleton[^>]*\/>/g)) {
      const before = src.slice(Math.max(0, m.index - 400), m.index);
      assert.match(before, /['"]loading['"]|=== ?["']loading["']|syncState === 'loading'|state === 'loading'/, `${file}: <Skeleton> must sit under a loading condition (context: …${before.slice(-120).replace(/\s+/g, ' ')})`);
    }
  }
});

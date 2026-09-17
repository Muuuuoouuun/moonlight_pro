import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

// DESIGN.md §11: "Focus uses `outline: 1px solid var(--moon-300)` with 2px offset".
// 링은 폭·오프셋만 규정한다. 이 파일은 apps/hub 아래 모든 스타일시트·JSX를 실제로 훑는다 —
// 한 파일만 읽고 "전역"이라고 적으면 다음 위반을 그대로 통과시킨다 (content-studio.css가 그랬다).
async function collectStyleSources(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) await collectStyleSources(child, acc);
    else if (/\.(css|jsx|js)$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) {
      acc.push([child.pathname.replace(/.*\/apps\/hub\//, "apps/hub/"), await readFile(child, "utf8")]);
    }
  }
  return acc;
}
const sources = await collectStyleSources(new URL("../../", import.meta.url));

test("focus rings are 1px wide everywhere under apps/hub (DESIGN.md 11)", () => {
  assert.ok(sources.length > 50, `sweep must actually reach the tree, saw ${sources.length} files`);
  // 토큰이 아니라 폭을 검사한다. --moon-300만 보면 `outline: 2px solid var(--accent)`나
  // 하드코딩 rgba 링을 통과시킨다. 색 토큰 통일(--moon-300 / --accent / rgba 혼재, 7개 파일)은
  // 별도 관례 결정이라 여기서 강제하지 않는다 (TODOS.md).
  const offenders = [];
  let rings = 0;
  for (const [path, source] of sources) {
    for (const m of source.matchAll(/outline:\s*(\d+)px\s+solid/g)) {
      rings += 1;
      if (m[1] !== "1") offenders.push(`${path}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], "focus ring must be 1px wide (DESIGN.md 11)");
  assert.ok(rings >= 8, `포커스 링 추출 실패 — saw ${rings}`);
});

test(":focus-visible rules never override border-radius (DESIGN.md 7, 11)", () => {
  // `.hub-app :focus-visible { border-radius: 2px }`는 특이도 (0,2,0)라 단일 클래스(0,1,0)로
  // radius를 갖는 모든 요소를 키보드 포커스 순간에만 2px로 튀게 했다 — 2026-09-16 브라우저 실측:
  // 사이드바 nav 11곳(6→2px), PMS 칩(999→2px), 포트폴리오 메트릭, 개인 매출 타임라인 카드.
  // outline은 요소 자신의 radius를 따라가므로 포커스 규칙이 radius를 만질 이유가 없다.
  const offenders = [];
  for (const [path, source] of sources) {
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of stripped.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g)) {
      if (/border-radius\s*:/.test(m[2])) offenders.push(`${path}: ${m[1].trim().replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(offenders, [], "a :focus-visible rule must not set border-radius");
  // 안티-공회전: 전역 규칙이 살아 있고 outline만 갖는지 확인한다.
  const tokens = sources.find(([p]) => p.endsWith("hub-tokens.css"))[1];
  assert.match(tokens, /\.hub-app :focus-visible \{ outline: 1px solid var\(--moon-300\); outline-offset: 2px; \}/);
});

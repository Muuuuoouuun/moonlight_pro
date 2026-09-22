import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

// DESIGN.md §4는 warm gold / amber / champagne 액센트의 재도입을 금지하고, §5.2는 페이지
// 코드의 raw hex/OKLCH를 금지한다. 두 규칙 모두 2026-09-21까지 강제 장치가 없었고, 그 사이
// 앰버·골드 계열 원색이 허브 전역에 85건 쌓였다 — 첫 화면 최상단 카드를 포함해서.
// (모션은 45건이 쌓인 뒤에야 가드가 생겼다 — §15 2026-09-16. 같은 실수를 반복하지 않는다.)
//
// 이 파일은 래칫이다: 알려진 부채는 BASELINE에 파일별 상한으로 박제하고, 그 수를 넘거나
// 목록에 없는 파일이 warm 원색을 들이면 실패한다. 부채를 갚을 때마다 BASELINE의 수를
// 내리고, 0이 되면 줄을 지운다. 새 위반은 오늘부터 0이다.

const ROOT = new URL("../../", import.meta.url); // apps/hub
const EXT = new Set([".js", ".jsx", ".mjs", ".css", ".ts", ".tsx"]);

// §15 2026-09-01 운영자 확정 예외 — 브랜드 컨텐츠 로그의 8색 아이덴티티 팔레트.
// `dashboard/brands/log` 한 표면에 한정되고 언제나 브랜드 이름 라벨과 동반한다.
const EXEMPT = new Set([
  "lib/brand-content-log.js",
  "lib/brand-content-log.test.mjs",
]);

// 남은 부채 — 각 줄은 갚아야 할 항목이다. 기획: docs/superpowers/specs/2026-09-21-home-screen-design-development.md §8
const BASELINE = {
  // 축하·골드 마일스톤 어휘 (Q134와 함께 결정)
  "components/hub/celebration-fx.jsx": 6,
  "components/hub/hub-tokens.css": 14,
  "components/hub/pages/overview.jsx": 4,
  // 차트 색계열 — §5.3(Moonstone 명도 + 패턴)으로 재설계 필요
  "components/hub/pages/revenue-heatmap.jsx": 8,
};

// 정확히 3·4·6·8자리만 색으로 본다 — `#55296`(테스트 픽스처의 번호)이 5자리라 걸리면 오탐이다.
const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const FUNC = /\b(rgba?)\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)/g;

function hexToRgb(raw) {
  const h = raw.length === 3 || raw.length === 4
    ? raw.slice(0, 3).split("").map((c) => c + c).join("")
    : raw.slice(0, 6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// 색상환에서 warm(주황~노랑) 영역인지. 채도가 낮으면 중립 회색이라 통과시킨다.
function isWarm([r, g, b]) {
  if (![r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) return false;
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  if (d === 0) return false;
  let h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  return s > 0.25 && h >= 15 && h <= 70;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".next") || entry.name === "node_modules" || entry.name === ".git") continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) yield* walk(child);
    else if (EXT.has(path.extname(entry.name))) yield child;
  }
}

async function scan() {
  const counts = new Map();
  const samples = new Map();
  for await (const file of walk(ROOT)) {
    const rel = decodeURIComponent(file.pathname.slice(ROOT.pathname.length));
    if (EXEMPT.has(rel)) continue;
    const src = await readFile(file, "utf8");
    src.split("\n").forEach((line, i) => {
      const found = [];
      for (const m of line.matchAll(HEX)) if (isWarm(hexToRgb(m[1]))) found.push(m[0]);
      for (const m of line.matchAll(FUNC)) if (isWarm([+m[2], +m[3], +m[4]])) found.push(`${m[1]}(${m[2]}, ${m[3]}, ${m[4]}…)`);
      if (!found.length) return;
      counts.set(rel, (counts.get(rel) || 0) + found.length);
      if (!samples.has(rel)) samples.set(rel, `${rel}:${i + 1} → ${found[0]}`);
    });
  }
  return { counts, samples };
}

test("no new warm gold/amber literals in apps/hub (DESIGN.md §4, §5.2)", async () => {
  const { counts, samples } = await scan();

  const unexpected = [...counts.keys()].filter((f) => !(f in BASELINE));
  assert.deepEqual(
    unexpected.map((f) => samples.get(f)),
    [],
    "warm gold/amber 원색은 §4가 금지한다 — 토큰(var(--…))을 쓰거나, 승인된 예외라면 EXEMPT에 근거와 함께 올려라",
  );

  const regressions = Object.entries(BASELINE)
    .filter(([file, max]) => (counts.get(file) || 0) > max)
    .map(([file, max]) => `${file}: ${counts.get(file)} > 허용 ${max}`);
  assert.deepEqual(regressions, [], "BASELINE을 넘었다 — 부채는 늘리지 않는다");
});

test("BASELINE has no stale rows — pay down and delete the line", async () => {
  const { counts } = await scan();
  const stale = Object.entries(BASELINE)
    .filter(([file, max]) => (counts.get(file) || 0) < max)
    .map(([file, max]) => `${file}: 실제 ${counts.get(file) || 0} < BASELINE ${max} — 이 줄을 내리거나 지워라`);
  assert.deepEqual(stale, [], "부채를 갚았으면 BASELINE도 같이 줄인다");
});

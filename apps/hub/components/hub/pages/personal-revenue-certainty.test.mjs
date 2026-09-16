import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CERTAINTY_BY_STAGE,
  LIFECYCLE_BY_STAGE,
} from "../../../lib/personal-revenue-roadmap.js";

const [pageSource, tokensSource] = await Promise.all([
  readFile(new URL("./personal-revenue.jsx", import.meta.url), "utf8"),
  readFile(new URL("../hub-tokens.css", import.meta.url), "utf8"),
]);

// DESIGN.md §5.3 Certainty 표 · §8.2 CertaintyBadge 계약.
const CERTAINTY_ENUM = ["confirmed", "recommended", "unknown"];
// DESIGN.md §5.3 Lifecycle 표 · §8.2 LifecycleBadge 계약.
const LIFECYCLE_ENUM = ["queued", "active", "waiting", "blocked", "done", "cancelled"];
// deal-stages.js DEAL_STAGES의 6단계 — 폴백이 의미를 감추지 않도록 전부 매핑돼야 한다.
const DEAL_STAGE_KEYS = ["closing", "consult", "contact", "final", "potential", "quote"];

test("개인 매출 확실성 어휘는 §5.3의 3키를 벗어나지 않는다", () => {
  assert.deepEqual(Object.keys(CERTAINTY_BY_STAGE).sort(), DEAL_STAGE_KEYS);

  const keys = Object.values(CERTAINTY_BY_STAGE).map((entry) => entry.key);
  for (const key of keys) {
    assert.ok(CERTAINTY_ENUM.includes(key), `확실성 채널에 없는 값: ${key}`);
  }
  // 세 값이 전부 실제로 쓰인다 — 죽은 값을 남겨 4키가 슬그머니 돌아오지 않게 한다.
  assert.deepEqual([...new Set(keys)].sort(), [...CERTAINTY_ENUM].sort());

  // §5.3 첫 문장: 한 채널이 두 의미를 겸직하지 않는다.
  const lifecycleOnly = LIFECYCLE_ENUM.filter((value) => !CERTAINTY_ENUM.includes(value));
  for (const key of keys) {
    assert.ok(!lifecycleOnly.includes(key), `라이프사이클 값이 확실성 채널에 샜다: ${key}`);
  }
  for (const entry of Object.values(CERTAINTY_BY_STAGE)) {
    assert.ok(entry.label && entry.label !== "진행 중", "확실성 라벨이 lifecycle `active` 라벨을 재사용한다");
  }
});

test('"입금 대기"는 확정된 딜의 라이프사이클이지 확실성이 아니다', () => {
  // closing = deal-stages.js의 won. 금액은 확정, 현금은 미도착.
  assert.deepEqual(CERTAINTY_BY_STAGE.closing, { key: "confirmed", label: "확정" });
  assert.deepEqual(LIFECYCLE_BY_STAGE.closing, { key: "waiting", label: "입금 대기" });

  // 라이프사이클 맵은 의도적으로 희소하다(값이 있는 단계만). 다만 실재하지 않는 단계 키가
  // 오타로 들어오면 배지가 영영 렌더되지 않으므로 키 자체는 퍼널 안에 있어야 한다.
  for (const [stage, entry] of Object.entries(LIFECYCLE_BY_STAGE)) {
    assert.ok(DEAL_STAGE_KEYS.includes(stage), `퍼널에 없는 단계에 라이프사이클이 붙었다: ${stage}`);
    assert.ok(LIFECYCLE_ENUM.includes(entry.key), `${stage}: 라이프사이클 채널에 없는 값 ${entry.key}`);
  }
  for (const [stage, entry] of Object.entries(CERTAINTY_BY_STAGE)) {
    assert.notEqual(entry.label, "입금 대기", `${stage}: 라이프사이클 라벨이 확실성에 남아 있다`);
  }
  // `final`(negotiation)은 입금 단계가 아니다 — 원래 오기였던 매핑의 회귀 방어.
  assert.equal(CERTAINTY_BY_STAGE.final.key, "recommended");
});

test("개인 매출 표면은 상태를 공유 프리미티브로 선언한다", () => {
  // §8.1 primitives-first · §8.2 상태 프리미티브.
  assert.match(pageSource, /import \{[\s\S]*?CertaintyBadge[\s\S]*?\} from "\.\.\/hub-primitives"/);
  assert.match(pageSource, /import \{[\s\S]*?LifecycleBadge[\s\S]*?\} from "\.\.\/hub-primitives"/);

  assert.match(pageSource, /<CertaintyBadge state=\{event\.certainty\.key\} label=\{event\.certainty\.label\} \/>/);
  assert.match(pageSource, /<CertaintyBadge state=\{deal\.certainty\.key\} label=\{deal\.certainty\.label\} \/>/);
  assert.match(pageSource, /<CertaintyBadge state=\{event\.action\.source\} \/>/);
  assert.match(pageSource, /<CertaintyBadge state=\{deal\.action\.source\} \/>/);
  assert.match(pageSource, /<LifecycleBadge state=\{event\.lifecycle\.key\} label=\{event\.lifecycle\.label\} \/>/);
  assert.match(pageSource, /<LifecycleBadge state=\{deal\.lifecycle\.key\} label=\{deal\.lifecycle\.label\} \/>/);

  // raw Badge tone으로 되돌아가지 않는다 (§8.2).
  assert.doesNotMatch(pageSource, /<Badge\b/);
  assert.doesNotMatch(pageSource, /\bBadge,\n/);
  // 페이지 안 하드코딩 색 금지 (CLAUDE.md UI 체크 · DESIGN.md §5.2).
  assert.doesNotMatch(pageSource, /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/);
  // 죽은 4키가 마크업에 남지 않는다.
  assert.doesNotMatch(pageSource, /["'](likely|possible)["']/);
});

test("personal-revenue 포커스/선택 링은 §11의 1px를 지킨다", () => {
  const start = tokensSource.indexOf(".personal-revenue-page {");
  const end = tokensSource.indexOf("/* ── Brand content log");
  assert.ok(start > 0 && end > start, "personal-revenue 블록을 찾지 못했다");
  const block = tokensSource.slice(start, end);

  assert.doesNotMatch(block, /outline:\s*2px/);
  const rings = block.match(/outline:\s*1px solid var\(--moon-300\)/g) || [];
  assert.equal(rings.length, 3, "타임라인 스크롤 · 이벤트 · 액션 행 세 링이 모두 1px이어야 한다");
  // 스크롤 컨테이너(overflow:hidden) 안의 전폭 행은 `.hub-row`와 같은 음수 오프셋을 쓴다.
  assert.match(block, /\.personal-revenue-action-row:focus-visible \{\s*outline: 1px solid var\(--moon-300\);\s*outline-offset: -2px;/);
  // hub-tokens.css 안에서 2px moon-300 링이 남지 않는다 (§11).
  // 저장소 전역 검사는 components/hub/focus-ring.test.mjs가 실제로 파일을 훑어서 한다.
  assert.doesNotMatch(tokensSource, /outline:\s*2px solid var\(--moon-300\)/);

  // 죽은 4키 확실성 CSS와 그 훅이 남지 않는다.
  assert.doesNotMatch(tokensSource, /data-certainty="(likely|possible|waiting)"/);
  assert.match(block, /\[data-certainty="recommended"\]/);
  assert.match(block, /\[data-certainty="unknown"\]/);
  assert.doesNotMatch(tokensSource, /personal-revenue-event-certainty/);
  assert.doesNotMatch(tokensSource, /personal-revenue-action-source/);
  assert.doesNotMatch(tokensSource, /personal-revenue-legend-item/);
  // 모바일 3열 붕괴 훅이 새 래퍼를 가리킨다.
  assert.match(block, /\.personal-revenue-action-value,\s*\.personal-revenue-action-state \{\s*display: none;/);
});

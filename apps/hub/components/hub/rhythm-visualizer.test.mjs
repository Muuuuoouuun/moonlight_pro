import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./rhythm-visualizer.jsx", import.meta.url), "utf8");

// 매트릭스는 할 일(tasksStatus)과 루틴(rhythmState) 두 소스를 합산한다. 한쪽 truth만 보고
// 빈 상태를 그리면 나머지 read 실패가 "완료 0건"으로 위장된다 (DESIGN.md §5.3).
test("빈 매트릭스는 두 소스의 truth를 합쳐 판정한다", () => {
  assert.match(source, /rhythmState = "live"/);
  assert.match(source, /const matrixTruth = React\.useMemo/);
  assert.match(source, /\[norm\(tasksStatus\), norm\(rhythmState\)\]/);
  // 'live-empty'(읽기 성공한 빈 기록)는 live로 접는다.
  assert.match(source, /"live-empty" \? "live"/);
});

// §11: 로딩은 레이아웃을 예고하는 Skeleton이고 EmptyState("비어 있음")가 아니다.
test("로딩은 Skeleton, 비-live는 단정 문구 없이 원인만 말한다", () => {
  assert.match(source, /!hasMatrix && matrixTruth === "loading" \?[\s\S]{0,400}<Skeleton/);
  assert.match(source, /matrixTruth === "live" \? "최근 7일 체크인이 없습니다" : "매트릭스를 그릴 수 없습니다"/);
  assert.match(source, /할 일·루틴 데이터를 읽지 못해 7일 매트릭스를 그릴 수 없습니다/);
  // 빈 상태는 EmptyState primitive로 — 인라인 div 재구현 금지 (§8.1 primitives first).
  assert.doesNotMatch(source, /padding: "32px 16px", textAlign: "center"/);
});

// 포인터가 막대를 한 번 지나가면 hoveredDay가 영구 고정돼 강조와 상세 스트립이 풀리지 않았다.
test("차트 hover는 이탈 시 기본값(오늘)으로 풀리고 강조 기준은 focusedIndex 하나다", () => {
  assert.match(source, /onMouseLeave=\{\(\) => setHoveredDay\(null\)\}/);
  assert.match(source, /const isHovered = focusedIndex === i;/);
  assert.doesNotMatch(source, /const isHovered = hoveredDay === i;/);
});

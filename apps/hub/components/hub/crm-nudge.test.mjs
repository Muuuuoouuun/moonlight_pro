import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { TIP_RULE_IDS, nudgeTipReason } from "./crm-nudge.jsx";

// 2026-09-24 영업·매출 라운드 2 — 운영자 결정: 넛지는 별도 섹션이 아니라 대상에 붙는 작은
// 제안 팁이어야 한다. 이 파일은 그 재배선의 계약을 고정한다: 어떤 규칙이 팁으로 되살아나는지,
// 그리고 예전 전용 섹션 컴포넌트(CrmNudgeCard/CrmNudgeSection)가 깔끔히 걷혔는지.
const src = await readFile(new URL("./crm-nudge.jsx", import.meta.url), "utf8");

test("only rules with no existing on-screen representation resurface as tips", () => {
  assert.deepEqual([...TIP_RULE_IDS].sort(), ["dormant_recheck", "reaction_open"]);
  // meeting_unrecorded는 '기록할까요'(RecordCandidates)와 중복이라 뺀다.
  assert.equal(TIP_RULE_IDS.has("meeting_unrecorded"), false);
  // promise_missed/promise_due는 놓친 약속·오늘 약속 행 자체(그리고 고객 목록의 'N일 지남'
  // 표시)가 이미 그 사실이라 뺀다 — 같은 행에 다시 얹으면 중복.
  assert.equal(TIP_RULE_IDS.has("promise_missed"), false);
  assert.equal(TIP_RULE_IDS.has("promise_due"), false);
  // no_next_action은 '다음 약속 없음' 카드의 기존 CTA, 템플릿 서브케이스는 customer-list.js의
  // template state가 대신한다.
  assert.equal(TIP_RULE_IDS.has("no_next_action"), false);
});

test("nudgeTipReason combines title and reason into one line, falling back to the title alone", () => {
  assert.equal(
    nudgeTipReason({ title: "우려를 들은 뒤 정리가 안 됐어요", reason: '"가격이 부담된다고" · 5일 전' }),
    '우려를 들은 뒤 정리가 안 됐어요 · "가격이 부담된다고" · 5일 전',
  );
  assert.equal(nudgeTipReason({ title: "한 달 지났어요 — 다시 볼까요?", reason: "" }), "한 달 지났어요 — 다시 볼까요?");
  assert.equal(nudgeTipReason(null), "");
});

test("the old dedicated nudge section/card is retired — nudges are inline tips now, not a panel", () => {
  assert.doesNotMatch(src, /export function CrmNudgeCard/);
  assert.doesNotMatch(src, /export function CrmNudgeSection/);
  assert.match(src, /export function useCrmNudges/);
});

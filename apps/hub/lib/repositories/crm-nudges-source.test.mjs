// 넛지 억제 왕복: crm-nudges POST가 meta.nudges에 쓴 숨기기·미루기를 넛지 읽기가 실제로
// 읽는지. 순수 엔진 테스트는 suppressions를 직접 넣어서, 읽기 경로가 이를 넘기지 않던 결함
// (2026-09-23 병합 검증 — 억제 후 새로고침하면 같은 넛지가 다시 떴다)을 잡지 못했다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { mapDeal, mapLead } from "./revenue-ledger.js";
import { collectNudgeSuppressions } from "./crm-nudges-source.js";
import { buildCrmNudges } from "../sales-os/crm-nudges.js";
import { buildNudgeMetaPatch } from "../sales-os/nudge-suppression.js";

const NOW = Date.parse("2026-09-22T03:00:00Z"); // KST todayKey 2026-09-22
const day = (offset) => new Date(NOW + offset * 86400000).toISOString();

const customerFrom = (lead) => ({
  id: lead.id,
  kind: "lead",
  name: lead.name,
  companyId: lead.companyId,
  nextAction: lead.nextAction,
  nextActionAt: lead.nextActionAt,
  dormant: lead.dormant,
  open: true,
});

test("the ledger mappers project meta.nudges for the nudge read", () => {
  const nudges = buildNudgeMetaPatch({}, { action: "snooze", until: "2026-09-25", at: day(0) });
  const lead = mapLead({ id: "lead-1", name: "한빛학원", meta: { nudges } }, new Map(), new Map());
  assert.deepEqual(lead.nudgeSuppression, nudges);
  const deal = mapDeal({ id: "deal-1", title: "한빛 도입", meta: { nudges } }, new Map());
  assert.deepEqual(deal.nudgeSuppression, nudges);
  assert.equal(mapLead({ id: "lead-2", name: "B", meta: {} }, new Map(), new Map()).nudgeSuppression, null);
});

test("stored snooze and dismiss suppress the nudge on the next read", () => {
  const row = { id: "lead-1", name: "한빛학원", next_action: "견적서 발송", meta: { next_action_at: day(-3) } };
  const shown = buildCrmNudges({ customers: [customerFrom(mapLead(row, new Map(), new Map()))], activities: [], now: NOW });
  assert.equal(shown.length, 1);

  // 숨기기: 같은 triggerKey만.
  const dismissed = buildNudgeMetaPatch({}, { action: "dismiss", triggerKey: shown[0].triggerKey, at: day(0) });
  const dismissedLead = mapLead({ ...row, meta: { ...row.meta, nudges: dismissed } }, new Map(), new Map());
  const afterDismiss = buildCrmNudges({
    customers: [customerFrom(dismissedLead)],
    activities: [],
    suppressions: collectNudgeSuppressions({ leads: [dismissedLead], deals: [] }),
    now: NOW,
  });
  assert.equal(afterDismiss.length, 0);

  // 미루기: 그 날짜까지 레코드 전체.
  const snoozed = buildNudgeMetaPatch({}, { action: "snooze", until: "2026-09-25", at: day(0) });
  const snoozedLead = mapLead({ ...row, meta: { ...row.meta, nudges: snoozed } }, new Map(), new Map());
  assert.deepEqual(collectNudgeSuppressions({ leads: [snoozedLead] }), { "lead-1": snoozed });
  const afterSnooze = buildCrmNudges({
    customers: [customerFrom(snoozedLead)],
    activities: [],
    suppressions: collectNudgeSuppressions({ leads: [snoozedLead], deals: [] }),
    now: NOW,
  });
  assert.equal(afterSnooze.length, 0);
});

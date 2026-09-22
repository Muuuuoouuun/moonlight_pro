import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTACT_CHANNELS,
  REACTIONS,
  buildContactRecordPayload,
  buildRawNoteWrite,
  channelLabel,
  isContactChannel,
  reactionRequired,
  validateContactRecord,
} from "./contact-record.js";

// 채널↔반응 규약(ClassIn contact-log.ts가 겪은 결함): 발신했을 뿐인 기록에 통화 결과가
// 붙으면 응대 통계가 조용히 부푼다.
test("only conversation channels ask for a reaction", () => {
  for (const kind of ["call", "meeting", "visit", "demo"]) {
    assert.equal(reactionRequired(kind), true, kind);
  }
  for (const kind of ["kakao", "email", "note"]) {
    assert.equal(reactionRequired(kind), false, kind);
  }
});

test("outbound channels ask only once the operator says a reply came back", () => {
  assert.equal(reactionRequired("kakao", { replied: true }), true);
  assert.equal(reactionRequired("email", { replied: true }), true);
  // 메모는 회신 개념 자체가 없다.
  assert.equal(reactionRequired("note", { replied: true }), false);
  assert.equal(reactionRequired("unknown", { replied: true }), false);
});

test("validation blocks on missing facts and warns once on a missing follow-up", () => {
  // 요약은 어느 채널에서든 필수 — 없으면 나중에 이 기록을 읽을 수 없다.
  assert.deepEqual(validateContactRecord({ kind: "note", summary: "" }).missing, ["summary"]);
  // 통화는 반응까지.
  assert.deepEqual(
    validateContactRecord({ kind: "call", summary: "통화함" }).missing,
    ["reaction"],
  );
  // 카톡은 반응을 묻지 않으므로 요약만 있으면 통과.
  assert.equal(validateContactRecord({ kind: "kakao", summary: "자료 보냄" }).ok, true);
  // 날짜 모드인데 날짜가 없으면 막는다.
  assert.deepEqual(
    validateContactRecord({ kind: "note", summary: "메모", followup: "dated", at: "" }).missing,
    ["at"],
  );
  // 막지는 않고 한 번 경고: 후속 없음 + 다음 행동도 없음.
  const warned = validateContactRecord({ kind: "kakao", summary: "보냄", followup: "none" });
  assert.equal(warned.ok, true);
  assert.equal(warned.warn, true);
  // 후속 없음이어도 다음 행동을 적었으면 경고하지 않는다.
  assert.equal(
    validateContactRecord({ kind: "kakao", summary: "보냄", followup: "none", nextAction: "재확인" }).warn,
    false,
  );
});

test("payload omits the reaction for channels that never asked", () => {
  const kakao = buildContactRecordPayload(
    { kind: "kakao", summary: "자료 전달", reaction: "positive", followup: "none" },
    { kind: "lead", id: "lead-1" },
  );
  // 묻지 않은 값은 실어 보내지 않는다 — state에 남은 옛 선택이 그대로 새는 경로를 막는다.
  assert.equal(kakao.reaction, "");
  assert.equal(kakao.entityType, "lead");

  const call = buildContactRecordPayload(
    { kind: "call", summary: "단가 문의", reaction: "concern", followup: "dated", at: "2026-09-26", nextAction: "견적서" },
    { kind: "lead", id: "lead-1" },
  );
  assert.equal(call.reaction, "concern");
  assert.equal(call.nextActionAt, "2026-09-26");
  assert.equal(call.nextAction, "견적서");
  assert.equal(call.dormant, false);
});

test("the three follow-up states map onto the RPC contract", () => {
  const base = { kind: "call", summary: "s", reaction: "neutral" };
  const target = { kind: "lead", id: "l1" };

  const dormant = buildContactRecordPayload({ ...base, followup: "dormant", at: "2026-09-26" }, target);
  assert.equal(dormant.dormant, true);
  // 기약 없음이면 날짜를 실어 보내지 않는다 — 휴면이 날짜를 들고 있으면 큐가 다시 집어 간다.
  assert.equal(dormant.nextActionAt, null);

  const none = buildContactRecordPayload({ ...base, followup: "none" }, target);
  assert.equal(none.dormant, false);
  assert.equal(none.nextActionAt, null);
  assert.equal(none.nextAction, null);
});

test("entity type follows the target, not the channel", () => {
  const forDeal = buildContactRecordPayload({ kind: "call", summary: "s", reaction: "neutral" }, { kind: "deal", id: "d1" });
  assert.equal(forDeal.entityType, "deal");
  const forAccount = buildContactRecordPayload({ kind: "call", summary: "s", reaction: "neutral" }, { kind: "account", id: "a1" });
  assert.equal(forAccount.entityType, "account");
});

test("unknown channels fall back to call rather than failing the RPC check", () => {
  const p = buildContactRecordPayload({ kind: "made-up", summary: "s" }, { kind: "lead", id: "l1" });
  assert.equal(p.kind, "call");
  assert.equal(isContactChannel("made-up"), false);
  assert.equal(channelLabel("call"), "통화");
});

test("the pasted original is a separate note write, linked by company as well", () => {
  assert.equal(buildRawNoteWrite({ body: "   " }, { kind: "lead", id: "l1" }), null);
  const note = buildRawNoteWrite({ body: "긴 원문" }, { kind: "lead", id: "l1", companyId: "co-1" });
  assert.deepEqual(note, { op: "create", type: "note", body: "긴 원문", leadId: "l1", companyId: "co-1" });
});

test("reaction vocabulary matches the crm_activities CHECK", () => {
  assert.deepEqual(REACTIONS.map((r) => r.key), ["positive", "neutral", "concern", "rejected", "no_response"]);
  // 채널 목록은 0016 kind CHECK 안에 있어야 저장이 거부되지 않는다.
  const allowed = new Set(["call", "meeting", "info_session", "demo", "visit", "email", "update", "note", "deal", "kakao", "quote", "ai"]);
  for (const c of CONTACT_CHANNELS) assert.ok(allowed.has(c.key), c.key);
});

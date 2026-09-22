import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTACT_CHANNELS,
  REACTIONLESS_KINDS,
  REACTIONS,
  applyContactExtraction,
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

// RPC 계약: 빈 반응은 0042가 REACTIONLESS_KINDS에서만 받는다. 폼이 빈 반응을 보내는 모든
// 경우가 그 목록 안에 있어야 한다 — 아니면 저장이 invalid-reaction으로 실패한다.
test("every payload that carries no reaction uses a kind the RPC accepts without one", () => {
  const target = { kind: "lead", id: "lead-1" };
  for (const channel of CONTACT_CHANNELS) {
    for (const replied of [false, true]) {
      const payload = buildContactRecordPayload(
        { kind: channel.key, summary: "s", replied, reaction: null, followup: "none" },
        target,
      );
      // 반응을 물은 조합은 validate가 저장 전에 막는다 — 빈 반응이 실제로 나가는 건
      // 반응을 묻지 않은 조합뿐이다.
      if (reactionRequired(channel.key, { replied })) continue;
      assert.equal(payload.reaction, "");
      assert.ok(REACTIONLESS_KINDS.has(payload.kind), `${channel.key} (replied=${replied}) would be rejected`);
    }
  }
  // 대화 채널은 반응 없는 목록에 들어가지 않는다.
  for (const channel of CONTACT_CHANNELS.filter((c) => c.reaction)) {
    assert.equal(REACTIONLESS_KINDS.has(channel.key), false, channel.key);
  }
});

test("AI extraction only marks an outbound channel replied when the reply itself was extracted", () => {
  const base = { kind: "kakao", reaction: null, replied: false, summary: "", nextAction: "", at: "", followup: "dated" };

  // 카톡 + 무응답: 회신이 아니다 — 반응도 회신도 켜지 않는다.
  const silent = applyContactExtraction(base, { kind: "kakao", reaction: "no_response", replied: true, summary: "견적 보냄" });
  assert.equal(silent.form.replied, false);
  assert.equal(silent.form.reaction, null);
  assert.equal(silent.filled, 2);

  // 카톡 + 중립이지만 회신 여부가 없다: 보낸 메시지일 수 있으므로 회신을 추정하지 않는다.
  const unknown = applyContactExtraction(base, { kind: "kakao", reaction: "neutral", replied: null });
  assert.equal(unknown.form.replied, false);
  assert.equal(unknown.form.reaction, null);

  // 카톡 + 긍정 + 회신 확인: 회신 받음 + 반응.
  const answered = applyContactExtraction(base, { kind: "kakao", reaction: "positive", replied: true });
  assert.equal(answered.form.replied, true);
  assert.equal(answered.form.reaction, "positive");
  assert.equal(answered.filled, 2);

  // 통화는 대화 채널 — 반응을 그대로 받는다(회신 토글과 무관).
  const call = applyContactExtraction(base, { kind: "call", reaction: "concern" });
  assert.equal(call.form.reaction, "concern");
  assert.equal(call.form.replied, false);

  // 메모는 반응을 묻지 않는다 — 채우지도, 채운 개수로 세지도 않는다.
  const note = applyContactExtraction({ ...base, kind: "note" }, { reaction: "positive", summary: "메모" });
  assert.equal(note.form.reaction, null);
  assert.equal(note.filled, 1);
});

test("AI extraction preserves fields it did not extract", () => {
  const edited = { kind: "call", reaction: null, replied: false, summary: "", body: "원문", nextAction: "운영자가 고친 후속", at: "2026-10-01", followup: "dated" };
  const { form } = applyContactExtraction(edited, { summary: "요약만" });
  assert.equal(form.summary, "요약만");
  assert.equal(form.body, "원문");
  assert.equal(form.nextAction, "운영자가 고친 후속");
  assert.equal(form.at, "2026-10-01");
});

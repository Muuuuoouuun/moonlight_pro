import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  CONTACT_CHANNELS,
  REACTIONLESS_KINDS,
  REACTIONS,
  applyContactExtraction,
  buildContactRecordPayload,
  buildRawNoteWrite,
  channelLabel,
  draftHintCopy,
  draftPlaceLabel,
  draftRestoredCopy,
  RECORD_DRAWER_WIDTH,
  RECORD_MODES,
  addSavedNoteRow,
  applyReceiptEvent,
  detailFieldHeight,
  isContactChannel,
  isPlainEnter,
  isSaveChord,
  memoModeContactNote,
  normalizeRecordMode,
  reactionRequired,
  receiptTimeLabel,
  recordChannelOptions,
  recordModeOptions,
  recordModeSentence,
  recordReceipt,
  recordSaveLabel,
  recordSaveLine,
  recordWindowLayout,
  saveChordReachesRecord,
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

// 저장 정직성(DESIGN.md §8.1 Save envelope) — 서버가 saved로 답하기 전의 글자는 끝난 말이 아니다.
const COMPLETION_WORD = /기록됨|저장됨|완료|됐|했어요/;

test("labels shown before the server acknowledges never claim completion", () => {
  assert.equal(recordSaveLabel("pending"), "기록 중");
  assert.equal(recordSaveLabel("sending"), "저장 중");
  for (const phase of ["pending", "sending"]) {
    assert.doesNotMatch(recordSaveLabel(phase), COMPLETION_WORD, phase);
    assert.match(recordSaveLabel(phase), / 중$/, `${phase} reads as in progress`);
  }
  // 되돌리기 창(아직 안 보냄)과 보낸 뒤는 다른 상태다 — 같은 글자로 뭉개지 않는다.
  assert.notEqual(recordSaveLabel("pending"), recordSaveLabel("sending"));
  // 모르는 단계는 아무 말도 하지 않는다 — 기본값이 완료 문구가 되는 일은 없다.
  for (const phase of ["saved", "done", "", undefined, null]) assert.equal(recordSaveLabel(phase), "");
});

test("the save line walks 기록 중 → 저장 중 → idle and offers undo only before the request leaves", () => {
  const hint = "닫아도 이 탭에 초안으로 남아요";
  // 되돌리기 창 — 아직 보내지 않았다.
  assert.deepEqual(recordSaveLine({ pending: { phase: "pending" }, draftHint: hint }), {
    progress: { label: "기록 중", canUndo: true },
    note: null,
  });
  // 보낸 뒤 — 답을 기다리는 동안에도 줄은 비지 않고, 되돌리기는 없다(죽은 버튼 금지).
  assert.deepEqual(recordSaveLine({ pending: { phase: "sending" }, draftHint: hint }), {
    progress: { label: "저장 중", canUndo: false },
    note: null,
  });
  // 서버가 답했다 — 진행 글자를 걷고 쉬는 초안 글자로 돌아온다.
  assert.deepEqual(recordSaveLine({ pending: null, draftHint: hint }), { progress: null, note: { tone: "hint", text: hint } });
  assert.deepEqual(recordSaveLine({}), { progress: null, note: null });
  assert.deepEqual(recordSaveLine(), { progress: null, note: null });
  // 모르는 단계는 진행으로 치지 않는다 — 끝난 말이 기본값으로 새지 않는다.
  assert.equal(recordSaveLine({ pending: { phase: "saved" } }).progress, null);
  for (const phase of ["pending", "sending"]) {
    assert.doesNotMatch(recordSaveLine({ pending: { phase } }).progress.label, COMPLETION_WORD);
  }
});

test("the save line keeps an in-flight save and a note about the current form apart", () => {
  const warnCopy = "다음 약속이 비어 있어요 — 한 번 더 누르면 '기약 없음'으로 저장돼요.";
  // 앞선 기록이 가는 동안 다음 기록에서 경고를 만났다 — 둘은 다른 말이라 각자 자기 자리에 선다.
  for (const phase of ["pending", "sending"]) {
    const line = recordSaveLine({ pending: { phase }, state: "warn", warnCopy, draftHint: "초안 · 이 탭 · 서버에는 아직 없어요" });
    assert.equal(line.progress.label, recordSaveLabel(phase));
    assert.deepEqual(line.note, { tone: "warn", text: warnCopy });
  }
  // 되돌리기 창에 빈 폼에서 저장을 한 번 더 눌러도(⌘↵ 두 번) 앞선 기록의 진행과 되돌리기는 남는다.
  const doubled = recordSaveLine({ pending: { phase: "pending" }, showMissing: true });
  assert.deepEqual(doubled.progress, { label: "기록 중", canUndo: true });
  assert.deepEqual(doubled.note, { tone: "missing", text: "위 필수 항목을 채우면 저장됩니다." });

  // 폼에 대한 말은 하나만 — 빠진 항목 > 빈 약속 경고 > 실패 원인 > 쉬는 초안 글자.
  const all = { showMissing: true, state: "warn", warnCopy, errorMsg: "저장에 실패했습니다.", draftHint: "초안" };
  assert.equal(recordSaveLine(all).note.tone, "missing");
  assert.equal(recordSaveLine({ ...all, showMissing: false }).note.tone, "warn");
  assert.deepEqual(recordSaveLine({ ...all, showMissing: false, state: "error" }).note, { tone: "error", text: "저장에 실패했습니다." });
  assert.equal(recordSaveLine({ ...all, showMissing: false, state: "idle" }).note.tone, "hint");
  // 실패 원인을 말하는 중에는 초안 글자가 그 자리를 덮지 않는다.
  assert.doesNotMatch(recordSaveLine({ state: "error", errorMsg: "저장에 실패했습니다.", draftHint: "초안" }).note.text, /초안/);
});

test("draft copy names where the draft actually lives", () => {
  assert.equal(draftPlaceLabel("tab"), "초안 · 이 탭");
  assert.equal(draftPlaceLabel("memory"), "초안 · 새로고침 전까지");
  // localStorage("이 기기")는 Q-CR4 결정 전이다 — 약속하지 않은 곳을 말하지 않는다.
  assert.equal(draftPlaceLabel("device"), "");
  assert.equal(draftPlaceLabel(undefined), "");

  assert.equal(draftRestoredCopy("tab"), "초안 · 이 탭 · 쓰던 내용을 불러왔어요");
  assert.equal(draftRestoredCopy("memory"), "초안 · 새로고침 전까지 · 쓰던 내용을 불러왔어요");

  // 아직 쓴 게 없으면 "어디에 남을지", 쓰기 시작했으면 "어디에 있고 서버에는 없다".
  assert.equal(draftHintCopy("tab"), "닫아도 이 탭에 초안으로 남아요");
  assert.equal(draftHintCopy("tab", { dirty: true }), "초안 · 이 탭 · 서버에는 아직 없어요");
  assert.equal(draftHintCopy("memory"), "닫아도 초안으로 남아요 · 새로고침하면 사라져요");
  assert.equal(draftHintCopy("memory", { dirty: true }), "초안 · 새로고침 전까지 · 서버에는 아직 없어요");
  // 메모리 사본뿐인데 "이 탭"에 남는다고 하지 않는다(탭 저장소는 새로고침을 견디지만 메모리는 아니다).
  for (const dirty of [false, true]) assert.doesNotMatch(draftHintCopy("memory", { dirty }), /이 탭|이 기기/);
  // 초안을 둘 곳이 없으면(저장된 고객이 아님) 남는다는 약속을 하지 않는다.
  for (const place of [null, undefined, "", "device"]) {
    assert.equal(draftHintCopy(place), "");
    assert.equal(draftHintCopy(place, { dirty: true }), "");
  }
  // 초안 글자는 어디서도 서버 저장을 뜻하는 말을 쓰지 않는다.
  for (const place of ["tab", "memory"]) {
    for (const copy of [draftRestoredCopy(place), draftHintCopy(place), draftHintCopy(place, { dirty: true })]) {
      assert.doesNotMatch(copy, /기록됨|저장됨|저장했/, copy);
    }
  }
});

// ── 2026-09-30 넓은 기록창 ②(권장 · 화면 확인 뒤 확정) ─────────────────────────────

test("the record window is the same drawer — only the width changes, and only while writing on a desktop", () => {
  assert.deepEqual(RECORD_DRAWER_WIDTH, { rest: "min(480px, 96vw)", wide: "min(960px, calc(100% - 56px))" });
  // 읽을 땐 좁게.
  assert.deepEqual(recordWindowLayout({ recording: false, mobile: false }), { width: RECORD_DRAWER_WIDTH.rest, form: "compact", context: false });
  assert.deepEqual(recordWindowLayout(), { width: RECORD_DRAWER_WIDTH.rest, form: "compact", context: false });
  // 쓸 때만 넓게 — 요약 · 자세히 두 칸 + 오른쪽 읽기 칸.
  assert.deepEqual(recordWindowLayout({ recording: true, mobile: false }), { width: RECORD_DRAWER_WIDTH.wide, form: "wide", context: true });
  // 휴대폰은 지금 바닥 시트 그대로(전체 높이 시트는 다음 조각).
  assert.deepEqual(recordWindowLayout({ recording: true, mobile: true }), { width: RECORD_DRAWER_WIDTH.rest, form: "compact", context: false });
  assert.deepEqual(recordWindowLayout({ recording: false, mobile: true }), { width: RECORD_DRAWER_WIDTH.rest, form: "compact", context: false });
});

test("Enter in the summary moves on only when it is a plain Enter — never mid-composition, never a save chord", () => {
  assert.equal(isPlainEnter({ key: "Enter" }), true);
  assert.equal(isPlainEnter({ key: "Enter", nativeEvent: { isComposing: false }, keyCode: 13 }), true);
  // ⌘↵ · Ctrl+↵는 저장이고, Shift · Alt 조합은 건드리지 않는다.
  for (const mod of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) assert.equal(isPlainEnter({ key: "Enter", [mod]: true }), false, mod);
  // 한글 조합을 끝내는 Enter — 브라우저마다 알리는 방식이 다르다(isComposing · nativeEvent · keyCode 229).
  assert.equal(isPlainEnter({ key: "Enter", isComposing: true }), false);
  assert.equal(isPlainEnter({ key: "Enter", nativeEvent: { isComposing: true } }), false);
  assert.equal(isPlainEnter({ key: "Enter", keyCode: 229 }), false);
  assert.equal(isPlainEnter({ key: "a" }), false);
  assert.equal(isPlainEnter(), false);
});

test("⌘↵ · Ctrl+↵ is the save chord — never a plain Enter, never the Enter that ends a Hangul composition", () => {
  assert.equal(isSaveChord({ key: "Enter", metaKey: true }), true);
  assert.equal(isSaveChord({ key: "Enter", ctrlKey: true }), true);
  assert.equal(isSaveChord({ key: "Enter" }), false, "그냥 Enter는 저장이 아니다");
  assert.equal(isSaveChord({ key: "s", metaKey: true }), false);
  assert.equal(isSaveChord(), false);
  // 조합을 끝내는 Enter — React 합성 이벤트(nativeEvent)와 창에서 받은 원래 이벤트(isComposing) 둘 다.
  assert.equal(isSaveChord({ key: "Enter", metaKey: true, nativeEvent: { isComposing: true } }), false);
  assert.equal(isSaveChord({ key: "Enter", metaKey: true, isComposing: true }), false);
  assert.equal(isSaveChord({ key: "Enter", ctrlKey: true, keyCode: 229 }), false);
  assert.equal(isSaveChord({ key: "Enter", metaKey: true, nativeEvent: { isComposing: false }, keyCode: 13 }), true);
});

test("the wide window takes ⌘↵ from anywhere inside its own drawer, and from nowhere else", () => {
  // 폼 안에서 난 것은 폼의 onKeyDown이 이미 받았다 — 창 리스너가 한 번 더 저장하지 않는다.
  assert.equal(saveChordReachesRecord({ inForm: true, inShell: true }), false);
  // 읽기 칸의 기록 줄 · 발판의 '고객 정보로' — 같은 드로어 안.
  assert.equal(saveChordReachesRecord({ inForm: false, inShell: true }), true);
  // 빈 곳을 누른 뒤(포커스가 body).
  assert.equal(saveChordReachesRecord({ inForm: false, inShell: false, onBody: true }), true);
  // 위에 뜬 다른 창(⌘K · 토스트)의 ⌘↵는 그 창의 것이다.
  assert.equal(saveChordReachesRecord({ inForm: false, inShell: false, onBody: false }), false);
  assert.equal(saveChordReachesRecord(), false);
});

test("the 자세히 field height is its content plus its own border — no phantom scrollbar, no negative height", () => {
  // border-box 높이 = 글 높이(scrollHeight) + 위아래 테두리(offsetHeight − clientHeight).
  assert.equal(detailFieldHeight({ scrollHeight: 320, offsetHeight: 322, clientHeight: 320 }), 322);
  assert.equal(detailFieldHeight({ scrollHeight: 1184, offsetHeight: 342, clientHeight: 340 }), 1186, "글이 길어지면 그만큼 자란다");
  // 테두리가 없거나 값이 비어도 던지지 않고, 음수를 내지 않는다.
  assert.equal(detailFieldHeight({ scrollHeight: 200, offsetHeight: 200, clientHeight: 200 }), 200);
  assert.equal(detailFieldHeight({ scrollHeight: 200, offsetHeight: 100, clientHeight: 120 }), 200);
  assert.equal(detailFieldHeight({ scrollHeight: -5 }), 0);
  assert.equal(detailFieldHeight(), 0);
});

test("a saved 자세히 joins the record stream as its own row — the long text is on screen right after 저장됨", () => {
  const at = "2026-09-30T01:42:00Z";
  const rows = [{ id: "srv-9", type: "call", msg: "요약 한 줄", receipt: "saved", savedAt: at }, { id: "old", msg: "지난 통화" }];
  const next = addSavedNoteRow(rows, { id: "note-1", body: "  [결정사항]\n- 시범 채점  " }, at);
  assert.equal(next.length, 3);
  assert.deepEqual(next[0], { id: "note-1", type: "note", msg: "[결정사항]\n- 시범 채점", at: "방금", occurredAt: at, receipt: "saved", savedAt: at });
  assert.equal(recordReceipt(next[0]).label, "저장됨");
  assert.equal(recordReceipt(next[0]).time, "10:42");
  assert.equal(next[1], rows[0], "요약 줄은 그대로(같은 객체) — 서버에 생긴 그대로 두 줄이다");
  // 자세히가 없던 저장 · 건너뛴 저장(note 없음)은 줄을 만들지 않는다.
  assert.equal(addSavedNoteRow(rows, null, at), rows);
  assert.equal(addSavedNoteRow(rows, { id: "note-2", body: "   " }, at), rows);
  assert.equal(addSavedNoteRow(rows, undefined), rows);
  // 다시 읽기가 먼저 닿아 같은 note가 이미 있으면 두 번 세우지 않는다.
  assert.equal(addSavedNoteRow(next, { id: "note-1", body: "[결정사항]" }, at), next);
  // 서버 ID를 못 받은 줄은 local- ID다 — 다시 읽기 전에는 삭제가 닿지 않는다(고객 드로어의 규칙).
  const idless = addSavedNoteRow(rows, { id: null, body: "긴 글" }, at);
  assert.match(String(idless[0].id), /^local-note-/);
  assert.equal(addSavedNoteRow(idless, { id: null, body: "긴 글" }, at), idless);
});

test("the receipt says 저장됨 with a time only after the server answered", () => {
  // 영수증이 없는 줄(읽어 온 기록)은 영수증을 달지 않는다.
  assert.equal(recordReceipt({ id: "a1", msg: "통화" }), null);
  assert.equal(recordReceipt(), null);
  assert.equal(recordReceipt({ receipt: "done" }), null, "모르는 단계를 끝난 말로 읽지 않는다");

  // 되돌리기 창 — 아직 보내지 않았다.
  assert.deepEqual(recordReceipt({ pending: true }), { phase: "pending", label: "기록 중", detail: "아직 보내지 않았어요", time: "", settled: false });
  // 보낸 뒤 — 답을 기다린다. 시각은 아직 없다(savedAt이 있어도 달지 않는다).
  assert.deepEqual(recordReceipt({ pending: true, receipt: "sending", savedAt: "2026-09-30T01:42:00Z" }), { phase: "sending", label: "저장 중", detail: "", time: "", settled: false });
  // 요약이 확인돼 pending이 풀려도, 자세히까지 확인되기 전에는 "저장 중"이다.
  assert.equal(recordReceipt({ pending: false, receipt: "sending" }).label, "저장 중");
  // 서버가 답했다 — 시각은 답을 받은 시각(KST hh:mm).
  assert.deepEqual(recordReceipt({ receipt: "saved", savedAt: "2026-09-30T01:42:00Z" }), { phase: "saved", label: "저장됨", detail: "", time: "10:42", settled: true });
  // 요약만 저장됐다 — 저장됨이라고 하지 않는다.
  const partial = recordReceipt({ receipt: "partial", savedAt: "2026-09-30T01:42:00Z" });
  assert.deepEqual([partial.phase, partial.label, partial.time, partial.settled], ["partial", "일부 저장", "10:42", true]);
  assert.match(partial.detail, /요약만 저장/);
  // 긴 글 칸의 이름은 배치마다 다르다(자세히 · 원문) — 같은 줄이 두 배치의 기록 줄에 서므로 어느 쪽 이름도 쓰지 않는다.
  assert.equal(partial.detail, "요약만 저장됐어요 · 긴 글은 아직");
  assert.doesNotMatch(partial.detail, /자세히|원문/);
  // 확인 전 단계는 끝난 말을 쓰지 않는다.
  for (const row of [{ pending: true }, { receipt: "sending" }, { receipt: "partial", savedAt: "2026-09-30T01:42:00Z" }]) {
    assert.doesNotMatch(recordReceipt(row).label, /저장됨|기록됨|완료/);
  }

  // 시각은 KST 24시간제 — 자정 직후가 24:05로 나오지 않고, 못 읽는 값은 지어내지 않는다.
  assert.equal(receiptTimeLabel("2026-09-29T15:05:00Z"), "00:05");
  assert.equal(receiptTimeLabel("2026-09-30T09:07:00Z"), "18:07");
  for (const bad of [null, undefined, "", "not a date"]) assert.equal(receiptTimeLabel(bad), "");
  assert.equal(recordReceipt({ receipt: "saved" }).time, "");
});

test("receipt events find their row by the optimistic or the server id and never touch other rows", () => {
  const other = { id: "other", msg: "지난 통화" };
  const rows = [{ id: "local-1", msg: "새 기록", pending: true }, other];

  const sending = applyReceiptEvent(rows, { type: "sending", optimisticId: "local-1" });
  assert.deepEqual(sending[0], { id: "local-1", msg: "새 기록", pending: true, receipt: "sending" });
  assert.equal(sending[1], other, "다른 줄은 그대로(같은 객체)");
  assert.equal(recordReceipt(sending[0]).label, "저장 중");

  // 요약이 저장되면 줄의 ID가 서버 ID로 바뀐다 — 그 뒤의 사건은 서버 ID로 찾는다.
  const swapped = sending.map((row) => (row.id === "local-1" ? { ...row, id: "srv-9", pending: false } : row));
  const saved = applyReceiptEvent(swapped, { type: "saved", optimisticId: "local-1", activityId: "srv-9", at: "2026-09-30T01:42:00Z" });
  assert.deepEqual(saved[0], { id: "srv-9", msg: "새 기록", pending: false, receipt: "saved", savedAt: "2026-09-30T01:42:00Z" });
  assert.equal(recordReceipt(saved[0]).time, "10:42");
  // 서버 ID를 못 받은 저장은 낙관 ID로 찾는다.
  assert.equal(applyReceiptEvent(sending, { type: "saved", optimisticId: "local-1", activityId: null, at: "2026-09-30T01:42:00Z" })[0].receipt, "saved");

  const partial = applyReceiptEvent(swapped, { type: "partial", optimisticId: "local-1", activityId: "srv-9", at: "2026-09-30T01:42:00Z" });
  assert.equal(recordReceipt(partial[0]).label, "일부 저장");
  // 다시 저장이 되면 같은 줄이 저장됨으로 넘어간다.
  assert.equal(recordReceipt(applyReceiptEvent(partial, { type: "saved", activityId: "srv-9", at: "2026-09-30T01:50:00Z" })[0]).time, "10:50");

  // 모르는 사건 · 대상 없는 사건은 아무것도 바꾸지 않는다(id 없는 줄에 붙지 않는다).
  assert.equal(applyReceiptEvent(rows, { type: "done", optimisticId: "local-1" }), rows);
  assert.equal(applyReceiptEvent(rows, { type: "saved", at: "2026-09-30T01:42:00Z" }), rows);
  const idless = [{ msg: "id 없는 줄" }];
  assert.deepEqual(applyReceiptEvent(idless, { type: "saved", activityId: "srv-9", at: "2026-09-30T01:42:00Z" }), idless);
});

test("a titled failure keeps its cause — the wide window names 저장 못 함 · 일부 저장 without changing the rule order", () => {
  assert.deepEqual(
    recordSaveLine({ state: "error", errorMsg: "서버에 닿지 않았어요.", errorTitle: "저장 못 함" }).note,
    { tone: "error", text: "서버에 닿지 않았어요.", title: "저장 못 함" },
  );
  // 제목은 실패 원인에만 붙는다 — 빠진 항목 · 경고 · 초안 글자에는 붙지 않는다.
  assert.equal(recordSaveLine({ showMissing: true, state: "error", errorMsg: "x", errorTitle: "저장 못 함" }).note.title, undefined);
  assert.equal(recordSaveLine({ state: "warn", warnCopy: "w", errorTitle: "저장 못 함" }).note.title, undefined);
  assert.equal(recordSaveLine({ draftHint: "초안", errorTitle: "저장 못 함" }).note.title, undefined);
});

// ── 2026-09-30 넓은 기록창 ⑥ — 같은 칸의 두 모드(Q-CR6) ─────────────────────────────────────

test("the record window has two modes and anything unknown is a contact record", () => {
  assert.deepEqual(RECORD_MODES, [{ key: "contact", label: "연락 기록" }, { key: "memo", label: "메모" }]);
  assert.equal(normalizeRecordMode("memo"), "memo");
  for (const value of ["contact", "", undefined, null, "note", "MEMO"]) assert.equal(normalizeRecordMode(value), "contact", String(value));
});

test("the mode sentence states what saving changes — and the code it describes really does that", () => {
  assert.equal(recordModeSentence("contact"), "연락한 일을 남겨요 · 마지막 연락일과 다음 약속이 바뀌어요");
  assert.equal(recordModeSentence("memo"), "연락이 아니에요 · 마지막 연락일과 약속은 그대로예요");
  assert.equal(recordModeSentence(), recordModeSentence("contact"));

  // 연락 기록 — record_contact_outcome_v1의 가장 최근 정의가 고객 행의 next_action과 마지막 접점을 언제나 쓴다.
  const dir = new URL("../../../../supabase/migrations/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const read = (name) => readFileSync(new URL(name, dir), "utf8");
  const outcome = files.filter((name) => /create or replace function public\.record_contact_outcome_v1/.test(read(name))).at(-1);
  assert.ok(outcome, "연락 기록 RPC 정의가 있다");
  const rpc = read(outcome);
  assert.match(rpc, /update public\.leads\s+set next_action = v_next_action,\s+last_touch_at = now\(\),/);
  assert.match(rpc, /update public\.customer_accounts\s+set next_action = v_next_action,\s+updated_at = now\(\),/);

  // 메모 — 일지 메모 RPC(journal_workflow_v1)를 정의하는 어느 마이그레이션도 고객 행 · 활동을 쓰지 않는다.
  const journal = files.filter((name) => /create or replace function public\.journal_workflow_v1/.test(read(name)));
  assert.ok(journal.length > 0, "일지 메모 RPC 정의가 있다");
  for (const name of journal) {
    assert.doesNotMatch(read(name), /(?:update|insert into)\s+public\.(?:leads|customer_accounts|crm_activities|deals)\b/, name);
  }
});

test("a contact record that failed while a memo is being written is named on the mode switch", () => {
  assert.deepEqual(recordModeOptions(), RECORD_MODES);
  assert.deepEqual(recordModeOptions({ mode: "memo" }), RECORD_MODES);
  assert.deepEqual(recordModeOptions({ mode: "memo", contactIssue: "저장 못 함" }).map((o) => [o.key, o.label]), [["contact", "연락 기록 · 저장 못 함"], ["memo", "메모"]]);
  assert.deepEqual(recordModeOptions({ mode: "memo", contactIssue: "일부 저장" })[0].label, "연락 기록 · 일부 저장");
  // 연락 기록을 보고 있을 때는 저장 줄이 말한다 — 전환 칸에 같은 말을 두 번 하지 않는다.
  assert.deepEqual(recordModeOptions({ mode: "contact", contactIssue: "저장 못 함" }), RECORD_MODES);
  assert.deepEqual(recordModeOptions({ mode: "memo", contactIssue: undefined }), RECORD_MODES);
});

test("the failed contact record also stands as a railed cause line above the memo save row — dim text alone is not a failure signal", () => {
  // RecordSaveLine이 그대로 그리는 모양(tone error + title → 1px 위급 레일 + 제목, 본문은 본문색).
  assert.deepEqual(memoModeContactNote("저장 못 함"), {
    tone: "error", title: "연락 기록 · 저장 못 함", text: "연락 기록으로 돌아가면 쓰던 글과 원인이 그대로 있어요.",
  });
  // 일부 저장은 요약이 이미 남았다는 것과 무엇을 다시 하면 되는지를 말한다.
  assert.deepEqual(memoModeContactNote("일부 저장"), {
    tone: "error", title: "연락 기록 · 일부 저장", text: "요약은 저장됐어요 · 연락 기록으로 돌아가면 자세히를 다시 저장할 수 있어요.",
  });
  // 실패가 없으면 줄도 없다 — 지어내지 않는다.
  for (const none of ["", null, undefined]) assert.equal(memoModeContactNote(none), null);
  assert.equal(memoModeContactNote(), null);
  // 전환 칸의 이름과 같은 말로 시작한다(한 실패에 이름 하나).
  assert.equal(memoModeContactNote("저장 못 함").title, recordModeOptions({ mode: "memo", contactIssue: "저장 못 함" })[0].label);
  for (const note of [memoModeContactNote("저장 못 함"), memoModeContactNote("일부 저장")]) assert.doesNotMatch(JSON.stringify(note), /저장됨|기록됨/);
});

test("with a memo mode the 메모만 channel steps aside unless it is already chosen", () => {
  const sheet = [{ key: "call", label: "통화" }, { key: "kakao", label: "카톡·문자" }, { key: "note", label: "메모만" }];
  assert.equal(recordChannelOptions(sheet, "call"), sheet, "메모 모드가 없으면 그대로");
  assert.equal(recordChannelOptions(sheet, "call", { memoMode: false }), sheet);
  assert.deepEqual(recordChannelOptions(sheet, "call", { memoMode: true }).map((o) => o.key), ["call", "kakao"]);
  // 이미 '메모만'을 골라 둔 폼(다른 진입점의 프리셋 · 쓰던 초안)은 그 칸을 잃지 않는다.
  assert.deepEqual(recordChannelOptions(sheet, "note", { memoMode: true }).map((o) => o.key), ["call", "kakao", "note"]);
  assert.deepEqual(recordChannelOptions(undefined, "call", { memoMode: true }), []);
});

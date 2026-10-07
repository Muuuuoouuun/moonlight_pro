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
  RECORD_HANDOFF_GUARD_MS,
  RECORD_LAYOUT_BREAKPOINTS,
  RECORD_LAYOUT_QUERIES,
  RECORD_MODES,
  RECORD_TABS,
  RECORD_TOUCH_QUERY,
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
  recordAwayLabel,
  recordChannelOptions,
  recordDetailLines,
  recordDraftChars,
  recordLayoutModeFromMedia,
  recordModeOptions,
  recordModeSentence,
  recordReceipt,
  recordSaveArmed,
  recordSaveButtons,
  recordSaveLabel,
  recordSaveLine,
  recordSaveLineResting,
  recordSheetChips,
  recordTab,
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

test("the record window is the same drawer — only the width changes, and only while writing", () => {
  assert.deepEqual(RECORD_DRAWER_WIDTH, { rest: "min(480px, 96vw)", wide: "min(960px, calc(100% - 56px))" });
  const REST = { width: RECORD_DRAWER_WIDTH.rest, form: "compact", context: false, tabs: false, headerSave: false };
  // 읽을 땐 좁게 — 어느 화면 폭에서든 쉬는 드로어는 그대로다(탭 · 머리 저장 없음).
  assert.deepEqual(recordWindowLayout({ recording: false, mobile: false }), { mode: "wide", ...REST });
  assert.deepEqual(recordWindowLayout(), { mode: "wide", ...REST });
  assert.deepEqual(recordWindowLayout({ recording: false, narrow: true }), { mode: "tabs", ...REST });
  assert.deepEqual(recordWindowLayout({ recording: false, mobile: true, narrow: true }), { mode: "sheet", ...REST });
  // 쓸 때만 넓게 — 요약 · 자세히 두 칸 + 오른쪽 읽기 칸.
  assert.deepEqual(recordWindowLayout({ recording: true, mobile: false }), { mode: "wide", width: RECORD_DRAWER_WIDTH.wide, form: "wide", context: true, tabs: false, headerSave: false });
});

// ── 2026-09-30 넓은 기록창 ③ — 좁은 화면(Q-CR3 · Q-CR11, 권장 · 화면 확인 뒤 확정) ─────────────────

// 드로어가 matchMedia에 건네는 바로 그 쿼리 문장을 읽어 그 폭에서의 답을 낸다(브라우저가 하는 일) — 상수를
// 다시 비교하지 않는다: 쿼리 문장이 바뀌면(min-width · 다른 폭) 아래 표가 깨진다.
const mediaAnswer = (query, width) => {
  const max = /^\(max-width: (\d+)px\)$/.exec(query);
  assert.ok(max, `읽을 수 있는 max-width 쿼리여야 한다: ${query}`);
  return width <= Number(max[1]);
};

test("the layout mode follows the viewport width — wide above 900, tabs to 601, a sheet at 600 and below", () => {
  // 중단점은 §7 Responsive의 둘뿐이다 — 새 폭을 만들지 않는다.
  assert.deepEqual(RECORD_LAYOUT_BREAKPOINTS, { sheet: 600, tabs: 900 });
  assert.deepEqual(RECORD_LAYOUT_QUERIES, { sheet: "(max-width: 600px)", tabs: "(max-width: 900px)" });
  // 터치 플로어의 쿼리는 배치를 고르지 않는다 — 전역 플로어(hub-tokens.css)와 같은 글자여야 한다.
  assert.equal(RECORD_TOUCH_QUERY, "(pointer: coarse), (max-width: 720px)");
  // 폭 → (드로어가 듣는 두 쿼리의 답) → 배치. 화면이 실제로 타는 길이다: 폭 숫자를 직접 받는 함수는 없다
  // (스타일시트와 같은 자로 재야 소수 폭에서 두 쪽이 어긋나지 않는다). 600 이하는 둘 다 맞고 sheet가 이긴다.
  const modeAt = (width) => recordLayoutModeFromMedia({
    mobile: mediaAnswer(RECORD_LAYOUT_QUERIES.sheet, width),
    narrow: mediaAnswer(RECORD_LAYOUT_QUERIES.tabs, width),
  });
  const cases = [
    [320, "sheet"], [390, "sheet"], [600, "sheet"],
    [601, "tabs"], [768, "tabs"], [900, "tabs"],
    [901, "wide"], [1280, "wide"], [1440, "wide"], [2560, "wide"],
    // 소수 폭(확대 · 분할 화면)도 같은 경계를 쓴다 — max-width는 600.4px을 600px 이하로 보지 않는다.
    [600.4, "tabs"], [900.5, "wide"],
  ];
  for (const [width, mode] of cases) {
    assert.equal(modeAt(width), mode, `${width}px`);
    assert.equal(recordWindowLayout({
      recording: true,
      mobile: mediaAnswer(RECORD_LAYOUT_QUERIES.sheet, width),
      narrow: mediaAnswer(RECORD_LAYOUT_QUERIES.tabs, width),
    }).mode, mode, `${width}px (layout)`);
  }
  // 쿼리를 아직 못 들었으면(서버 렌더 · 첫 그리기) 데스크톱 기본이다 — 빈 값으로 휴대폰 배치를 고르지 않는다.
  assert.equal(recordLayoutModeFromMedia(), "wide");
  assert.equal(recordLayoutModeFromMedia({}), "wide");
  assert.equal(recordLayoutModeFromMedia({ mobile: true }), "sheet", "sheet 쿼리만 맞았다고 알려 와도 휴대폰이다");
});

test("each layout mode decides the drawer's width, the form's layout, the tabs and where save lives", () => {
  // 601–900px — 같은 넓은 드로어(폭은 화면이 자른다)에 같은 넓은 폼. 두 칸은 탭이 되고 저장은 아래 띠 그대로다.
  assert.deepEqual(recordWindowLayout({ recording: true, narrow: true }),
    { mode: "tabs", width: RECORD_DRAWER_WIDTH.wide, form: "wide", context: true, tabs: true, headerSave: false });
  // 600px 이하 — 바닥 시트(폭은 시트가 정한다)에 시트 배치의 폼. 같은 탭, 저장은 머리에.
  assert.deepEqual(recordWindowLayout({ recording: true, mobile: true, narrow: true }),
    { mode: "sheet", width: RECORD_DRAWER_WIDTH.rest, form: "sheet", context: true, tabs: true, headerSave: true });
  // 어느 배치든 읽기 칸은 있다(좁은 화면에서는 탭 뒤에) — 쓰는 동안 읽던 약속 · 기록이 한 번에 닿는다.
  for (const media of [{}, { narrow: true }, { mobile: true, narrow: true }]) assert.equal(recordWindowLayout({ recording: true, ...media }).context, true);
  // 넓은 폭의 '화면이 자르는' 값 — 900px 화면에서 844px, 1440px 화면에서 960px.
  assert.match(RECORD_DRAWER_WIDTH.wide, /^min\(960px, calc\(100% - 56px\)\)$/);
});

test("the narrow tabs are 쓰기 | 이 고객 — and the tab only exists where the layout has tabs", () => {
  assert.deepEqual(RECORD_TABS, [{ key: "write", label: "쓰기" }, { key: "context", label: "이 고객" }]);
  assert.equal(recordTab("context", { tabs: true }), "context");
  assert.equal(recordTab("write", { tabs: true }), "write");
  // 탭이 없는 배치(넓은 화면)에서는 언제나 쓰기다 — '이 고객'을 보다가 창을 넓히면 두 칸이 다시 나란히 선다.
  assert.equal(recordTab("context", { tabs: false }), "write");
  assert.equal(recordTab("context"), "write");
  // 모르는 값은 쓰기다.
  for (const odd of [undefined, null, "", "memo", "읽기"]) assert.equal(recordTab(odd, { tabs: true }), "write", String(odd));
  // 배치가 그대로 넘어온다(recordWindowLayout의 결과).
  assert.equal(recordTab("context", recordWindowLayout({ recording: true, narrow: true })), "context");
  assert.equal(recordTab("context", recordWindowLayout({ recording: true })), "write");
});

test("the line under 이 고객 says how much writing is waiting — the draft is kept, not counted as saved", () => {
  assert.equal(recordDraftChars({ summary: "시범 채점 합의", body: "[결정사항]\n- 10월 셋째 주" }), 8 + 17);
  // 앞뒤 빈칸은 세지 않고, 쓴 글만 센다(다음 약속 · 채널 · 반응은 글쓰기 칸이 아니다).
  assert.equal(recordDraftChars({ summary: "  통화  ", body: "\n\n", nextAction: "견적서 보내기", kind: "call" }), 2);
  assert.equal(recordDraftChars(), 0);
  assert.equal(recordDraftChars({ summary: null, body: undefined }), 0);

  assert.equal(recordAwayLabel({ mode: "contact", chars: 366 }), "쓰던 기록 · 366자");
  assert.equal(recordAwayLabel({ mode: "memo", chars: 42 }), "쓰던 메모 · 42자");
  assert.equal(recordAwayLabel({ mode: "contact", chars: 12480 }), "쓰던 기록 · 12,480자");
  // 쓴 게 없으면 세지 않는다 — '0자'라고 하지 않고, 저장됐다는 말도 하지 않는다.
  assert.equal(recordAwayLabel({ mode: "contact", chars: 0 }), "아직 쓴 기록이 없어요");
  assert.equal(recordAwayLabel({ mode: "memo" }), "아직 쓴 메모가 없어요");
  assert.equal(recordAwayLabel(), "아직 쓴 기록이 없어요");
  for (const label of [recordAwayLabel({ chars: 5 }), recordAwayLabel({ mode: "memo", chars: 5 }), recordAwayLabel()]) assert.doesNotMatch(label, /저장됨|기록됨|완료/);
  // 모르는 모드는 연락 기록으로, 이상한 수는 0으로 읽는다.
  assert.equal(recordAwayLabel({ mode: "draft", chars: 3 }), "쓰던 기록 · 3자");
  assert.equal(recordAwayLabel({ chars: -4 }), "아직 쓴 기록이 없어요");
  assert.equal(recordAwayLabel({ chars: "abc" }), "아직 쓴 기록이 없어요");
  // 글은 없어도 고쳐 둔 것(다음 약속 · 반응 · 날짜)이 가려진 칸에 있으면 "쓴 게 없다"고 하지 않는다 — 몇 자라고
  // 지어내지도 않는다. 아무것도 안 만진 폼만 없다고 말한다.
  const onlyPromise = { summary: "", body: "", nextAction: "견적서 보내기" };
  assert.equal(recordDraftChars(onlyPromise), 0);
  assert.equal(recordAwayLabel({ mode: "contact", chars: recordDraftChars(onlyPromise), dirty: true }), "쓰던 기록이 남아 있어요");
  assert.equal(recordAwayLabel({ mode: "memo", chars: 0, dirty: true }), "쓰던 메모가 남아 있어요");
  assert.equal(recordAwayLabel({ mode: "contact", chars: 0, dirty: false }), "아직 쓴 기록이 없어요");
  assert.equal(recordAwayLabel({ mode: "contact", chars: 12, dirty: true }), "쓰던 기록 · 12자", "글이 있으면 글자 수가 이긴다");
  assert.doesNotMatch(recordAwayLabel({ chars: 0, dirty: true }), /저장됨|기록됨|완료|\d/);
});

test("the save line is resting only when it has nothing to say — then the phone sheet gives its row back to writing", () => {
  const hint = draftHintCopy("tab", { dirty: true });
  // 쉬는 중 — 할 말이 없거나 쉬는 초안 글자뿐이다(그 글자는 시트에서 머리의 둘째 줄로 간다).
  assert.equal(recordSaveLineResting(recordSaveLine({})), true);
  assert.equal(recordSaveLineResting(recordSaveLine({ draftHint: hint })), true);
  assert.equal(recordSaveLineResting(), true);
  // 할 말이 있으면 줄이 선다 — 앞선 저장의 진행(되돌리기 · 저장 중), 빠진 칸, 빈 약속 경고, 실패 원인.
  assert.equal(recordSaveLineResting(recordSaveLine({ pending: { phase: "pending" }, draftHint: hint })), false);
  assert.equal(recordSaveLineResting(recordSaveLine({ pending: { phase: "sending" } })), false);
  assert.equal(recordSaveLineResting(recordSaveLine({ showMissing: true, draftHint: hint })), false);
  assert.equal(recordSaveLineResting(recordSaveLine({ state: "warn", warnCopy: "다음 약속이 비어 있어요", draftHint: hint })), false);
  assert.equal(recordSaveLineResting(recordSaveLine({ state: "error", errorMsg: "서버에 닿지 않았어요", errorTitle: "저장 못 함" })), false);
  // 머리에 서는 말은 초안이 놓인 곳의 짧은 이름이다 — 저장됐다는 말이 아니다.
  assert.equal(draftPlaceLabel("tab"), "초안 · 이 탭");
  assert.doesNotMatch(draftPlaceLabel("tab") + draftPlaceLabel("memory"), /저장됨|기록됨|이 기기/);
});

test("the folded 자세히 line counts the lines that were written", () => {
  assert.equal(recordDetailLines("[결정사항]\n- 10월 셋째 주\n- 답안지 양식 유지"), 3);
  assert.equal(recordDetailLines("한 줄"), 1);
  // 앞뒤 빈 줄은 세지 않고, 가운데 빈 줄은 쓴 그대로 센다.
  assert.equal(recordDetailLines("\n\n첫 줄\n\n셋째 줄\n\n"), 3);
  assert.equal(recordDetailLines("윈도우 줄바꿈\r\n둘째 줄"), 2);
  for (const empty of ["", "   ", "\n\n", null, undefined]) assert.equal(recordDetailLines(empty), 0);
});

test("the sheet's chips summarise 어떻게 · 반응 and the promise in the words the fields use", () => {
  const base = { kind: "meeting", reaction: null, replied: false, nextAction: "", followup: "dated", at: "2026-10-03" };
  const labels = (form, options) => recordSheetChips(form, options).map((chip) => [chip.key, chip.label, chip.date]);

  // 대화 채널은 반응이 필수다 — 아직 안 골랐으면 칩이 그렇게 말한다(색이 아니라 글자로).
  assert.deepEqual(labels(base, { kindLabel: "미팅", whenLabel: "3일 뒤" }), [["how", "미팅 · 반응 필수", ""], ["promise", "약속 · 3일 뒤", "10/3"]]);
  assert.deepEqual(labels({ ...base, reaction: "positive" }, { kindLabel: "미팅", whenLabel: "3일 뒤" })[0], ["how", "미팅 · 긍정", ""]);
  assert.deepEqual(labels({ ...base, kind: "call", reaction: "no_response" }, { kindLabel: "통화" })[0], ["how", "통화 · 무응답", ""]);
  // 발신 채널은 회신을 받았을 때만 반응을 말한다 — 보낸 사실에 반응을 붙이지 않는다.
  assert.deepEqual(labels({ ...base, kind: "kakao" }, { kindLabel: "카톡·문자" })[0], ["how", "카톡·문자", ""]);
  assert.deepEqual(labels({ ...base, kind: "kakao", replied: true }, { kindLabel: "카톡·문자" })[0], ["how", "카톡·문자 · 회신 받음 · 반응 필수", ""]);
  assert.deepEqual(labels({ ...base, kind: "email", replied: true, reaction: "concern" }, { kindLabel: "메일" })[0], ["how", "메일 · 회신 받음 · 우려", ""]);
  // 남아 있던 반응 값은 묻지 않는 채널에서 말하지 않는다.
  assert.deepEqual(labels({ ...base, kind: "kakao", reaction: "positive" }, { kindLabel: "카톡·문자" })[0], ["how", "카톡·문자", ""]);
  assert.deepEqual(labels({ ...base, kind: "note", reaction: "positive" }, { kindLabel: "메모만" })[0], ["how", "메모만", ""]);
  // 칸 이름을 넘기지 않으면 저장 어휘의 이름으로 말한다.
  assert.deepEqual(labels({ ...base, kind: "visit", reaction: "neutral" })[0], ["how", "방문 · 중립", ""]);

  // 약속 — 무엇을(길면 자른다) · 언제. 날짜는 M/D로 따로 준다(화면은 mono).
  assert.deepEqual(labels({ ...base, nextAction: "견적서 보내기" }, { whenLabel: "3일 뒤" })[1], ["promise", "견적서 보내기 · 3일 뒤", "10/3"]);
  assert.deepEqual(labels({ ...base, nextAction: "  채점 기능 써 보시게 전달하고 원장회의 일정 확인  " }, { whenLabel: "다음 주" })[1], ["promise", "채점 기능 써 보시게 전달… · 다음 주", "10/3"]);
  // 직접 고른 날짜(프리셋 아님)는 날짜만.
  assert.deepEqual(labels({ ...base, at: "2026-12-25" })[1], ["promise", "약속", "12/25"]);
  // 기약 없음 · 후속 없음은 날짜를 달지 않는다(남아 있던 날짜 값을 말하지 않는다).
  assert.deepEqual(labels({ ...base, followup: "dormant", at: "2026-10-03" })[1], ["promise", "약속 · 기약 없음", ""]);
  assert.deepEqual(labels({ ...base, followup: "none", nextAction: "추후 연락" })[1], ["promise", "추후 연락 · 후속 없음", ""]);
  // 날짜가 비었거나 못 읽는 값이면 지어내지 않고 필요하다고 말한다.
  assert.deepEqual(labels({ ...base, at: "" })[1], ["promise", "약속 · 날짜 필요", ""]);
  assert.deepEqual(labels({ ...base, at: "10월 3일" }, { whenLabel: "3일 뒤" })[1], ["promise", "약속 · 날짜 필요", ""]);
  // 칩은 늘 둘이다 — 빈 폼에서도 던지지 않는다.
  assert.deepEqual(recordSheetChips().map((chip) => chip.key), ["how", "promise"]);
  // 칩은 요약일 뿐이다 — 폼을 바꾸지 않는다.
  const frozen = Object.freeze({ ...base });
  recordSheetChips(frozen, { kindLabel: "미팅" });
  assert.deepEqual(frozen, base);
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

test("a held ⌘↵ saves once — the repeats the keyboard sends while it is held are not saves", () => {
  // 첫 keydown만 저장이다. 누르고 있는 동안의 되풀이(repeat)는 저장 뒤 비워진 폼 · 넘어온 다음 사람의 폼을 다시 저장한다.
  assert.equal(isSaveChord({ key: "Enter", metaKey: true, repeat: false }), true);
  assert.equal(isSaveChord({ key: "Enter", metaKey: true, repeat: true }), false);
  assert.equal(isSaveChord({ key: "Enter", ctrlKey: true, repeat: true }), false);
  // React 합성 이벤트는 nativeEvent에도 같은 값이 있다.
  assert.equal(isSaveChord({ key: "Enter", metaKey: true, nativeEvent: { repeat: true } }), false);
});

test("a form the window just moved onto does not take the rest of the gesture that saved the previous person", () => {
  const openedAt = 10_000;
  // 넘어와 선 폼 — 더블 클릭의 둘째 클릭 · 연달아 누른 ⌘↵는 저장이 아니다.
  assert.equal(recordSaveArmed({ handoff: true, openedAt, now: openedAt }), false);
  assert.equal(recordSaveArmed({ handoff: true, openedAt, now: openedAt + 250 }), false);
  assert.equal(recordSaveArmed({ handoff: true, openedAt, now: openedAt + RECORD_HANDOFF_GUARD_MS - 1 }), false);
  // 한 박자 뒤부터는 받는다 — 미리 채워진 기록 후보를 읽고 누른 저장이다.
  assert.equal(recordSaveArmed({ handoff: true, openedAt, now: openedAt + RECORD_HANDOFF_GUARD_MS }), true);
  assert.equal(recordSaveArmed({ handoff: true, openedAt, now: openedAt + 5_000 }), true);
  // 직접 연 창(행 · 기록 후보 · N)은 선 직후에도 받는다 — 넘어온 폼만의 규칙이다.
  assert.equal(recordSaveArmed({ handoff: false, openedAt, now: openedAt }), true);
  assert.equal(recordSaveArmed(), true);
  // 더블 클릭 간격(흔히 500ms)보다 길고, 글을 읽고 누를 시간보다는 짧다.
  assert.ok(RECORD_HANDOFF_GUARD_MS > 500 && RECORD_HANDOFF_GUARD_MS <= 1000);
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

// 2026-09-30 넓은 기록창 ④(Q-CR8 · 권장): 버튼 글자는 진입점이 정한다 — '저장하고 다음'은 오늘 연락에서 연 창만.
test("the save buttons say what happens — 저장하고 다음 only where a next stop exists", () => {
  // 그 밖의 진입점(고객 드로어 · 거래 독 · 첫 화면 · 에이전트)은 언제나 '저장' 하나다.
  assert.deepEqual(recordSaveButtons(), { primary: "저장", secondary: "", chord: true });
  assert.deepEqual(recordSaveButtons({ queued: false, sheet: false }), { primary: "저장", secondary: "", chord: true });
  // 오늘 연락에서 연 넓은 기록창 — 주 버튼은 하나이고 '저장만'은 보조다.
  assert.deepEqual(recordSaveButtons({ queued: true }), { primary: "저장하고 다음", secondary: "저장만", chord: true });
  // 휴대폰 시트는 ⌘↵ 글자를 달지 않는다(키보드가 없다). 글자는 같다.
  assert.deepEqual(recordSaveButtons({ queued: true, sheet: true }), { primary: "저장하고 다음", secondary: "저장만", chord: false });
  // 실패 뒤에도 '저장하고 다음'이다 — 누르면 일어나는 일이 그것이다.
  assert.equal(recordSaveButtons({ queued: true, sheet: true, failed: true }).primary, "저장하고 다음");
  // 다음이 없는 휴대폰 시트의 머리 버튼은 실패 뒤 '다시 저장'이라고 말한다(원인 줄이 버튼과 떨어져 있다).
  assert.deepEqual(recordSaveButtons({ sheet: true, failed: true }), { primary: "다시 저장", secondary: "", chord: false });
  assert.equal(recordSaveButtons({ sheet: true }).primary, "저장");
  assert.equal(recordSaveButtons({ failed: true }).primary, "저장");
  // 일부 저장 뒤에는 긴 글만 다시 보낸다 — 넘어가지 않으므로 '다음'도 '저장만'도 없다.
  assert.deepEqual(recordSaveButtons({ retry: "자세히 다시 저장", queued: true }), { primary: "자세히 다시 저장", secondary: "", chord: false });
  assert.deepEqual(recordSaveButtons({ retry: "원문 저장 재시도" }), { primary: "원문 저장 재시도", secondary: "", chord: false });
});

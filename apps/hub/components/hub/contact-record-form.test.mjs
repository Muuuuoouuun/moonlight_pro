import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ContactRecordDrawer, ContactRecordForm, RecordAwayBar, RecordPrimarySlot, RecordSaveLine, RecordSheetFields, recordDraftStore } from "./contact-record-form.jsx";
import { RecordQueueStrip } from "./record-queue-strip.jsx";
import { Button } from "./hub-primitives.jsx";
import { RECORD_DRAWER_WIDTH, RECORD_TOUCH_QUERY, recordSaveButtons, recordSaveLine } from "../../lib/sales-os/contact-record.js";
import { applyTrailEvent, recordNextStop, trailItems } from "../../lib/sales-os/record-queue.js";

const source = readFileSync(new URL("./contact-record-form.jsx", import.meta.url), "utf8");

// 첫 렌더(쉬는 상태)만 그린다 — 효과는 돌지 않으므로 저장소에는 아무것도 쓰지 않는다.
const recordTarget = { kind: "lead", id: "lead-1", name: "기록 대상" };
const renderForm = (props = {}) => renderToStaticMarkup(React.createElement(ContactRecordForm, { target: recordTarget, autoFocus: true, ...props }));

// node에는 window가 없다 — 탭 저장소가 있는 창과 막힌 창을 각각 세운다.
function withWindow(sessionStorage, run) {
  const had = Object.hasOwn(globalThis, "window");
  const before = globalThis.window;
  globalThis.window = { sessionStorage };
  try { return run(); } finally {
    if (had) globalThis.window = before;
    else delete globalThis.window;
  }
}
const tabStorage = (seed = {}) => {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
};
const blockedStorage = () => {
  const refuse = () => { throw new Error("SecurityError"); };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
};

test("원문 저장 실패 뒤 재시도는 연락 RPC를 다시 보내지 않고 원문만 저장한다", () => {
  assert.match(source, /setPendingRawNote\(/);
  assert.match(source, /const retryRawNote = async \(\) =>/);
  assert.match(source, /if \(pendingRawNote\) retryRawNote\(\);\s*else save\(\{/);
  // 버튼 글자는 배치의 칸 이름을 따른다 — 좁은 시트는 '원문', 넓은 기록창은 '자세히'(같은 재시도 길).
  // 휴대폰 시트의 머리 버튼만 실패 뒤 '다시 저장'이라고 말한다(원인 줄이 버튼과 떨어져 있다 — 2026-09-30 ③).
  // 글자를 고르는 것은 순수 규칙이다(recordSaveButtons — 2026-09-30 ④에서 '저장하고 다음'이 같은 규칙에 들어왔다).
  assert.match(source, /const buttons = recordSaveButtons\(\{ retry: pendingRawNote \? noteCopy\.retry : "", queued, sheet, failed: state === "error" \}\);/);
  assert.match(source, /<Button variant="primary" size=\{wide \? "md" : "sm"\} disabled=\{rawNoteSaving\} onClick=\{primaryAction\}>\s*\{buttons\.primary\}/);
  assert.equal(recordSaveButtons({ retry: "자세히 다시 저장" }).primary, "자세히 다시 저장");
  assert.equal(recordSaveButtons({ sheet: true, failed: true }).primary, "다시 저장");
  assert.equal(recordSaveButtons({ failed: true }).primary, "저장");
  assert.match(source, /retry: "원문 저장 재시도",\s*skip: "원문 저장 건너뛰기",/);
  assert.match(source, /retry: "자세히 다시 저장",\s*skip: "건너뛰기",/);
  assert.match(source, /const noteCopy = wide \? RAW_NOTE_COPY\.wide : RAW_NOTE_COPY\.compact;/);
});

test("연락 저장 확인은 선택 원문까지 저장된 다음 전달한다", () => {
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const fail ="));
  assert.ok(persist.lastIndexOf("onPersisted?.") > persist.indexOf("if (note)"));
  assert.match(persist, /onPersisted\?\.\(\{ activityId/);
  assert.ok(persist.indexOf("onSummaryPersisted?.") >= 0);
  assert.ok(persist.indexOf("onSummaryPersisted?.") < persist.indexOf("if (note)"));
});

test("원문 저장 중 창이 닫혀도 같은 고객의 원문 재시도 상태를 복원한다", () => {
  assert.match(source, /const rawNoteRecoveries = new Map\(\)/);
  // 되살릴 곳은 둘이다 — 요청이 가는 동안의 메모리, 실패가 확인된 뒤의 탭 저장소(recallRawNote가 둘 다 읽는다).
  assert.match(source, /const \[recoveredRawNote\] = React\.useState\(\(\) => recallRawNote\(target\)\)/);
  assert.match(source, /const held = rawNoteRecoveries\.get\(rawNoteKey\(target\)\);\s*if \(held\) return held;/);
  assert.match(source, /const \[pendingRawNote, setPendingRawNote\] = React\.useState\(\(\) => recoveredRawNote/);
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  // 요청을 보내기 전에 메모리에 든다(창이 닫혀도 남게) — 탭에는 아직 두지 않는다.
  assert.ok(persist.indexOf("holdRawNote(target, held);") > 0);
  assert.ok(persist.indexOf("holdRawNote(target, held);") < persist.indexOf('fetch("/api/hub/revenue/activity"'));
  assert.match(source, /rawNoteRecoveries\.delete\(rawNoteKey\(target\)\)/);
});

// 일부 저장 상태에서 새로고침하면 메모리 사본은 사라진다 — 못 보낸 긴 글을 초안과 같은 탭 저장소에 둔다.
test("못 보낸 긴 글은 실패가 확인된 뒤 탭에도 남고, 다시 저장 · 건너뛰기가 끝나면 지운다", () => {
  const RAW_KEY = "crm-record:lead:lead-1:rawnote";
  assert.match(source, /const rawNoteDraftKey = \(target\) => `\$\{draftKey\(target\)\}:rawnote`;/);
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  // 탭에 두는 것은 note 요청의 실패가 확인된 다음이다 — 가는 중에 두면 새로고침 뒤 저장된 글을 "일부 저장"이라고 말한다.
  const failedAt = persist.indexOf('if (!noteResp?.ok || noteData.status !== "saved") {');
  assert.ok(failedAt > 0 && persist.indexOf("holdRawNote(target, held, { durable: true });") > failedAt);
  assert.equal((persist.match(/durable: true/g) || []).length, 1);
  // 잠긴 요약에 보일 글(이미 저장된 요약)도 함께 든다.
  assert.match(persist, /summary: snapshot\.form\.summary,\s*body: snapshot\.form\.body,/);
  // 끝나면(저장 · 다시 저장 · 건너뛰기) 두 곳 모두에서 지운다.
  assert.equal((source.match(/dropRawNote\(target\);/g) || []).length, 3);
  assert.match(source, /function dropRawNote\(target\) \{\s*rawNoteRecoveries\.delete\(rawNoteKey\(target\)\);\s*if \(target\?\.id\) recordDraftStore\.clear\(rawNoteDraftKey\(target\)\);/);

  // 새로고침 뒤(메모리 없음 · 탭에만 있음) 같은 고객의 기록창 — 긴 글과 재시도가 그대로 돌아온다.
  const held = { activityId: "act-1", optimisticId: "local-1", summary: "단원평가 채점 상담", body: "[결정사항]\n- 10월 셋째 주 시범 채점" };
  const compact = withWindow(tabStorage({ [RAW_KEY]: JSON.stringify(held) }), () => renderForm());
  assert.match(compact, /<textarea[^>]*>\[결정사항\]\n- 10월 셋째 주 시범 채점<\/textarea>/);
  assert.match(compact, />원문 저장 재시도<\/button>/);
  assert.match(compact, /요약은 저장됐지만 원문은 저장하지 못했습니다/);
  // 다른 고객의 것은 불러오지 않고, 글이 빈 사본은 일부 저장으로 치지 않는다.
  const other = withWindow(tabStorage({ "crm-record:lead:someone-else:rawnote": JSON.stringify(held) }), () => renderForm());
  assert.doesNotMatch(other, /원문 저장 재시도/);
  const empty = withWindow(tabStorage({ [RAW_KEY]: JSON.stringify({ ...held, body: "  " }) }), () => renderForm());
  assert.doesNotMatch(empty, /원문 저장 재시도/);
});

// ── 2026-09-24 30초 기록 시트(운영자 승인 목업 01) ────────────────────────────────

test("시트 채널은 다섯 개이고, 다른 진입점이 넘긴 방문·데모 프리셋은 사라지지 않는다", () => {
  const block = source.slice(source.indexOf("const SHEET_CHANNELS"), source.indexOf("];", source.indexOf("const SHEET_CHANNELS")));
  assert.deepEqual([...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]), ["통화", "미팅", "카톡·문자", "메일", "메모만"]);
  assert.match(source, /SHEET_CHANNELS\.some\(\(c\) => c\.key === form\.kind\)\s*\?\s*SHEET_CHANNELS\s*:\s*\[\.\.\.SHEET_CHANNELS, \{ key: form\.kind, label: channelLabel\(form\.kind\) \}\]/);
  // 반응은 대화 채널만 필수 — 카톡·메일은 "회신을 받았어요"를 켰을 때만 묻는다(기존 계약 유지).
  assert.match(source, /const wantsReaction = reactionRequired\(form\.kind, \{ replied: form\.replied \}\);/);
  assert.match(source, /text="회신을 받았어요"/);
});

test("다음 약속이 비면 한 번 알리고 기약 없음으로 저장한다 — 직접 고른 날짜는 날짜만 남긴다", () => {
  assert.match(source, /const promiseEmpty = !String\(form\.nextAction \|\| ""\)\.trim\(\) && form\.followup !== "dormant";/);
  assert.match(source, /const effective = promiseEmpty && !dateOnlyPromise \? \{ \.\.\.form, followup: "dormant", at: "" \} : form;/);
  assert.match(source, /if \(\(promiseEmpty \|\| check\.warn\) && !ignoreWarning\) \{\s*setState\("warn"\);/);
  // 저장은 effective로, 되돌리기·실패 복원은 운영자가 쓴 그대로(form)로.
  assert.match(source, /const payload = buildContactRecordPayload\(\{ \.\.\.effective, summary \}, target\);/);
  assert.match(source, /const snapshot = \{ optimisticId, form: \{ \.\.\.form, summary \}, capture, recordSeconds \};/);
  assert.match(source, /'기약 없음'으로 저장돼요/);
  // 언제 = 내일 · 3일 뒤 · 다음 주 · 날짜… · 기약 없음, 기본은 3일 뒤.
  assert.match(source, /\{ key: "date", label: "날짜…" \},\s*\{ key: "dormant", label: "기약 없음" \}/);
  assert.match(source, /if \(base\.followup === "dated" && !base\.at\) base\.at = localDateAfter\(3\);/);
});

test("⌘↵ 저장은 한글 조합 중이면 무시한다", () => {
  // 무엇이 저장 단축키인지는 순수 규칙(isSaveChord — contact-record.test.mjs가 조합 중 Enter까지 돌려 본다)이 정한다.
  assert.match(source, /const onKeyDown = \(e\) => \{\s*if \(!isSaveChord\(e\)\) return;/);
  assert.match(source, /<div onKeyDown=\{onKeyDown\}/);
});

test("쓰던 입력은 닫아도 같은 탭에 남고, 저장하면 지운다(저장소 실패는 조용히 메모리로)", () => {
  // 키는 고객마다 하나다(crm-record:<종류>:<id>). 자리를 나눈 호출처(scope — 오늘 연락의 기록 후보, 2026-09-30 ④)만
  // 뒤에 그 기록의 이름이 붙는다 — 그 밖의 호출처는 지금 키 그대로다.
  assert.match(source, /const draftKey = \(target, scope = ""\) => `crm-record:\$\{target\?\.kind \|\| "lead"\}:\$\{target\?\.id \|\| ""\}\$\{scope \? `:\$\{scope\}` : ""\}`;/);
  assert.match(source, /onNotice, handoff = false, draftScope = "" \}\) \{/, "자리를 나누지 않는 것이 기본이다");
  // 탭 저장소(sessionStorage)에 두고 막히면 메모리로 — 그 규칙은 저장소 모듈이 갖고
  // contact-record-draft.test.mjs가 막힌 창·중간에 막히는 창까지 실제로 돌려 본다.
  assert.match(source, /export const recordDraftStore = createRecordDraftStore\(\(\) => window\.sessionStorage\);/);
  assert.doesNotMatch(source, /sessionStorage\.(getItem|setItem|removeItem)/, "저장소는 저장소 모듈을 거쳐서만 만진다");
  withWindow(tabStorage(), () => {
    const key = "crm-record:lead:lead-tab";
    assert.equal(recordDraftStore.write(key, { summary: "탭에 둔 초안" }), "tab");
    assert.equal(window.sessionStorage.getItem(key), JSON.stringify({ summary: "탭에 둔 초안" }));
    recordDraftStore.clear(key);
    assert.equal(window.sessionStorage.getItem(key), null);
  });
  // window가 없는 환경에서도 던지지 않고 메모리 사본으로 버틴다.
  assert.equal(recordDraftStore.probe(), "memory");
  const save = source.slice(source.indexOf("const save = ("), source.indexOf("const showMissing"));
  assert.match(save, /clearDraft\(target, draftScope\);/);
  // 저장한 입력이 되살아나 두 번 저장되지 않게 — 토스트 모드도 폼을 프리셋으로 되돌린 뒤 닫는다.
  assert.match(save, /reset\(\);\s*onDone\?\.\(\);\s*return;/);
});

// ── 2026-09-30 저장 정직성 글자(넓은 기록창 ① · Q-CR4 결정 전이라 초안은 탭에 그대로 둔다) ──

test("쉬는 글자는 초안이 어디에 남는지 말한다 — 탭 저장소면 '이 탭', 막힌 창이면 새로고침 전까지", () => {
  const tab = withWindow(tabStorage(), () => renderForm());
  assert.match(tab, /닫아도 이 탭에 초안으로 남아요/);
  assert.doesNotMatch(tab, /새로고침/);

  // 저장소가 막힌 창(사생활 보호 등)과 저장소 자체가 없는 환경 — 메모리 사본뿐이다.
  for (const html of [withWindow(blockedStorage(), () => renderForm()), renderForm()]) {
    assert.match(html, /닫아도 초안으로 남아요 · 새로고침하면 사라져요/);
    assert.doesNotMatch(html, /이 탭/, "메모리 사본을 탭 저장소라고 말하지 않는다");
  }

  // 어디인지 말하지 않던 옛 글자는 남기지 않는다.
  assert.doesNotMatch(source, /입력은 닫아도 남아요/);
  // 아직 약속하지 않은 곳(localStorage)을 말하지 않는다.
  assert.doesNotMatch(source, /window\.localStorage|이 기기/);
});

test("되살린 초안은 어디 것인지 밝히고, 쓰던 글이 서버에는 없다고 말한다", () => {
  const draft = { kind: "meeting", reaction: null, replied: false, summary: "단원평가 채점 상담", body: "", nextAction: "", at: "", followup: "dated" };
  const html = withWindow(tabStorage({ "crm-record:lead:lead-1": JSON.stringify(draft) }), () => renderForm());
  assert.match(html, /role="status"[^>]*>.*초안 · 이 탭 · 쓰던 내용을 불러왔어요/s);
  assert.match(html, /value="단원평가 채점 상담"/);
  assert.match(html, />지우기</);
  assert.match(html, /초안 · 이 탭 · 서버에는 아직 없어요/);
  assert.doesNotMatch(html, /닫아도 이 탭에 초안으로 남아요/, "이미 쓴 글이 있으면 상태를 말한다");

  // 다른 고객의 초안은 불러오지 않는다.
  const other = withWindow(tabStorage({ "crm-record:lead:someone-else": JSON.stringify(draft) }), () => renderForm());
  assert.doesNotMatch(other, /쓰던 내용을 불러왔어요/);
});

test("초안을 둘 곳이 없거나 실패 원인을 말하는 중이면 남는다는 약속을 하지 않는다", () => {
  // 저장된 고객이 아니면(id 없음) 초안 키가 없다 — writeDraft가 아무것도 두지 않는다.
  const unsaved = withWindow(tabStorage(), () => renderForm({ target: { kind: "lead", name: "아직 저장 전" } }));
  assert.doesNotMatch(unsaved, /초안/);
  assert.match(source, /const writeDraft = \(target, form, scope\) => \(target\?\.id \? recordDraftStore\.write\(draftKey\(target, scope\), pickDraft\(form\)\) : null\);/);
  // 실패 뒤 다시 연 창은 원인을 말한다 — 쉬는 글자가 그 자리를 덮지 않는다.
  const failed = withWindow(tabStorage(), () => renderForm({ draft: { summary: "다시 열린 입력" }, initialError: "저장에 실패했습니다." }));
  assert.match(failed, /role="alert"[^>]*>저장에 실패했습니다\./);
  assert.doesNotMatch(failed, /초안으로 남아요|서버에는 아직 없어요/);
  // 쉬는 글자는 기록창으로 연 폼(autoFocus)만 보인다 — 기존 계약 그대로.
  assert.doesNotMatch(withWindow(tabStorage(), () => renderForm({ autoFocus: false })), /초안/);
});

test("막힌 창에서 되살린 초안은 '이 탭'이라고 하지 않는다 — 메모리 사본이라고 말한다", () => {
  const memTarget = { kind: "lead", id: "lead-mem", name: "막힌 창 고객" };
  const key = "crm-record:lead:lead-mem";
  const draft = { kind: "call", reaction: null, replied: false, summary: "막힌 창에서 쓰던 요약", body: "", nextAction: "", at: "", followup: "dated" };
  try {
    const html = withWindow(blockedStorage(), () => {
      assert.equal(recordDraftStore.write(key, draft), "memory");
      return renderForm({ target: memTarget });
    });
    assert.match(html, /role="status"[^>]*>.*초안 · 새로고침 전까지 · 쓰던 내용을 불러왔어요/s);
    assert.match(html, /value="막힌 창에서 쓰던 요약"/);
    assert.match(html, /초안 · 새로고침 전까지 · 서버에는 아직 없어요/);
    assert.doesNotMatch(html, /이 탭/, "메모리 사본을 탭 저장소라고 말하지 않는다");
  } finally {
    recordDraftStore.clear(key);
  }
  // 쓰다가 탭 저장소가 거절하면(용량 등) 그때부터 곳을 낮춰 말한다 — 쓴 결과가 곳을 정한다.
  assert.match(source, /const place = writeDraft\(target, form, draftScope\);\s*if \(place\) setDraftPlace\(place\);/);
});

test("호출처가 미리 채운 값은 쓰던 초안을 덮지 않는다 — 초안이 이기고, 씨앗만 있으면 초안이라고 하지 않는다", () => {
  const typed = { kind: "meeting", reaction: null, replied: false, summary: "운영자가 직접 쓴 긴 요약", body: "", nextAction: "", at: "", followup: "dated" };
  const stored = () => tabStorage({ "crm-record:lead:lead-1": JSON.stringify(typed) });
  const seed = { summary: "견적서 보내기" }; // 고객 드로어의 "했어요 · 기록"이 넘기는 약속 문구

  // 쓰던 초안 + 씨앗 → 초안이 이긴다(되살림 줄도 그대로 보인다).
  const both = withWindow(stored(), () => renderForm({ draft: seed }));
  assert.match(both, /value="운영자가 직접 쓴 긴 요약"/);
  assert.doesNotMatch(both, /value="견적서 보내기"/);
  assert.match(both, /초안 · 이 탭 · 쓰던 내용을 불러왔어요/);

  // 씨앗만 → 요약을 채우되, 운영자가 쓴 글이 아니므로 초안이 있다고 말하지 않는다.
  const seeded = withWindow(tabStorage(), () => renderForm({ draft: seed }));
  assert.match(seeded, /value="견적서 보내기"/);
  assert.doesNotMatch(seeded, /쓰던 내용을 불러왔어요|서버에는 아직 없어요/);
  assert.match(seeded, /닫아도 이 탭에 초안으로 남아요/);

  // 저장 실패 뒤 다시 연 창(입력 + 원인)은 그 입력이 이긴다 — 실패한 글을 옛 초안으로 덮지 않는다.
  const failed = withWindow(stored(), () => renderForm({ draft: { ...typed, summary: "저장에 실패한 입력" }, initialError: "저장에 실패했습니다." }));
  assert.match(failed, /value="저장에 실패한 입력"/);
  assert.doesNotMatch(failed, /쓰던 내용을 불러왔어요/);

  // 씨앗 그대로인 폼은 초안으로 쓰지 않는다 — 프리셋 그대로인 폼과 같이 지운다.
  assert.match(source, /const untouched = sameDraft\(form, baseForm\(presetForm\)\) \|\| Boolean\(seedForm && sameDraft\(form, seedForm\)\);/);
  assert.match(source, /if \(untouched\) clearDraft\(target, draftScope\);\s*else \{\s*const place = writeDraft\(target, form, draftScope\);/);
});

test("인라인 되돌리기 창은 '기록 중'이다 — 서버가 답하기 전에 기록됨·저장됨을 말하지 않는다", () => {
  const inline = source.slice(source.indexOf("reset();\n    scheduleUndoable("), source.indexOf("const showMissing"));
  assert.ok(inline.length > 0);
  // 저장을 누르면 되돌리기 창("보내기 전" 단계)으로 들어간다.
  assert.match(inline, /setPendingUndo\(\{\s*key,\s*phase: "pending",\s*undo: \(\) => \{/);
  // 창이 닫히면 요청이 나가고, 답이 올 때까지는 되돌릴 수 없는 "보낸 뒤" 단계다.
  const run = inline.slice(0, inline.indexOf("setPendingUndo({"));
  assert.match(run, /cur\?\.key === key \? \{ key, phase: "sending", undo: null \} : cur/);
  assert.ok(run.indexOf('phase: "sending"') < run.indexOf("persist(payload, snapshot)"), "보내기 전에 단계를 바꾼다");
  // 답이 오면(성공·실패 모두) 진행 글자를 걷고, 성공일 때만 닫는다 — 그 사이 메모 모드로 옮겨 쓰고 있으면
  // 닫지 않는다(쓰던 메모 밑에서 창이 접히지 않게, 2026-09-30 ⑥).
  assert.match(run, /persist\(payload, snapshot\)\.then\(\(ok\) => \{\s*setPendingUndo\(\(cur\) => \(cur\?\.key === key \? null : cur\)\);\s*\/\/[^\n]*\n\s*if \(ok && !memoModeRef\.current\) onDone\?\.\(\);/);
  // 저장 줄은 그 단계를 순수 규칙(recordSaveLine)에 넘겨 글자를 받고, 그리기는 RecordSaveLine이 한다.
  assert.match(source, /const saveLine = recordSaveLine\(\{\s*pending: pendingUndo,\s*showMissing,\s*state,\s*warnCopy,\s*errorMsg,/);
  assert.match(source, /<RecordSaveLine line=\{saveLine\} onUndo=\{pendingUndo\?\.undo\} \/>/);
  // 주석은 빼고 운영자가 보는 문자열만 — 폼 어디에도 확인 문구를 직접 쓰지 않는다(호출처의 onPersisted가 띄운다).
  const visible = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(visible, /기록됨|저장됨/);
});

test("저장 줄은 기록 중(되돌리기) → 저장 중(되돌리기 없음)으로 그려지고, 경고와 한 문장으로 붙지 않는다", () => {
  const renderLine = (input) => renderToStaticMarkup(React.createElement(RecordSaveLine, { line: recordSaveLine(input), onUndo() {} }));
  const warnCopy = "다음 약속이 비어 있어요 — 한 번 더 누르면 '기약 없음'으로 저장돼요.";

  const pending = renderLine({ pending: { phase: "pending" } });
  assert.match(pending, /role="status"[^>]*>기록 중<button/);
  assert.match(pending, />되돌리기<\/button>/);
  assert.doesNotMatch(pending, /기록됨|저장됨|저장 중/);

  // 보낸 뒤 — 줄이 비지 않고 "저장 중"이 보이며, 눌러도 소용없는 되돌리기는 없다.
  const sending = renderLine({ pending: { phase: "sending" } });
  assert.match(sending, /role="status"[^>]*>저장 중<\/span>/);
  assert.doesNotMatch(sending, /되돌리기|<button|기록됨|저장됨/);

  // 앞선 기록이 가는 동안 다음 기록의 경고 — 진행과 경고가 각자 자기 줄(자기 요소)에 선다.
  for (const phase of ["pending", "sending"]) {
    const html = renderLine({ pending: { phase }, state: "warn", warnCopy });
    const spans = html.match(/<span role="status"/g) || [];
    assert.equal(spans.length, 2, `${phase}: 진행 한 줄 + 경고 한 줄`);
    assert.match(html, /flex-direction:column/);
    assert.match(html, /(기록|저장) 중(<button.*?<\/button>)?<\/span><span role="status"[^>]*>다음 약속이 비어 있어요/);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, "|"), /저장돼요\.(기록|저장) 중/, "경고 문장 뒤에 진행 글자를 잇지 않는다");
  }

  // 실패 원인은 위급 색 한 곳, 쉬는 초안 글자는 조용한 색 — 진행이 없을 때만.
  const failed = renderLine({ state: "error", errorMsg: "저장에 실패했습니다." });
  assert.match(failed, /<span role="alert" style="color:var\(--danger\)">저장에 실패했습니다\.<\/span>/);
  const idle = renderLine({ draftHint: "닫아도 이 탭에 초안으로 남아요" });
  assert.match(idle, /<span style="color:var\(--fg-dim\)">닫아도 이 탭에 초안으로 남아요<\/span>/);
  assert.doesNotMatch(renderLine({ pending: { phase: "sending" }, draftHint: "닫아도 이 탭에 초안으로 남아요" }), /초안/);
  // 되돌릴 수단이 없으면(onUndo 없음) 버튼을 그리지 않는다.
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(RecordSaveLine, { line: recordSaveLine({ pending: { phase: "pending" } }) })), /<button/);
});

test("토스트 되돌리기는 '기록 중'이라고만 말한다 — 서버 saved 전에 저장됨을 말하지 않는다", () => {
  const toastMode = source.slice(source.indexOf('if (undoMode === "toast") {'), source.indexOf("reset();\n    scheduleUndoable("));
  assert.match(toastMode, /toast\(`기록 중 · \$\{target\?\.name \|\| "고객"\}`/);
  assert.match(toastMode, /duration: UNDO_WINDOW_MS/);
  assert.match(toastMode, /if \(!cancelDetached\(key\)\) return;/);
  // 주석은 빼고 운영자가 보는 문자열만 본다.
  assert.doesNotMatch(toastMode.replace(/\/\/[^\n]*/g, ""), /저장됨|완료/);
  // 탭을 닫아도 3.5초 창 안의 기록은 보낸다(use-undoable-action과 같은 최선 노력).
  assert.match(source, /window\.addEventListener\("pagehide", flushDetached\)/);
  // preview는 실패다 — 입력을 복원하고 저장되지 않았다고 말한다.
  assert.match(source, /data\.status === "preview" \? "Preview · 연결 필요 — 저장되지 않았습니다"/);
});

test("저장된 기록에만 기록 소요·실제 연락 시각을 단다", () => {
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  assert.ok(persist.indexOf("annotate(data.activityId") > persist.indexOf("onSummaryPersisted?."), "saved 뒤에만");
  assert.match(source, /action: "annotate-activity"/);
  assert.match(source, /const CAPTURE_KEYS = \["occurredAt", "durationSec", "captureSource", "candidateId"\];/);
});

test("기록창은 대상이 없으면 열리지 않는다 — 고객 고르기(searchTargets)를 준 호출처만 예외", () => {
  assert.match(source, /if \(!effectiveTarget\?\.id && !pickable\) return null;/);
  assert.match(source, /const pickable = typeof searchTargets === "function";/);
  // 고르기 읽기 실패를 "맞는 고객이 없어요"로 뭉개지 않는다.
  assert.match(source, /result\.status === "error"[\s\S]{0,200}<TruthBadge state="error" \/>/);
});

// ── 2026-09-30 넓은 기록창 ② — layout="wide"(권장 · 화면 확인 뒤 확정) ─────────────────────

const renderWide = (props = {}) => withWindow(tabStorage(), () => renderForm({ layout: "wide", ...props }));
const tagOf = (html, pattern) => html.match(pattern)?.[0] || "";

test("기본 배치는 지금 시트 그대로다 — 넓은 배치는 layout=\"wide\"를 준 호출처만", () => {
  const compact = withWindow(tabStorage(), () => renderForm());
  assert.doesNotMatch(compact, /record-wide/);
  assert.match(compact, />무슨 얘기</);
  assert.match(compact, />원문 붙여넣기</);
  assert.doesNotMatch(compact, />자세히</);
  // 읽기 칸을 주지 않은 호출처(거래 독 · 첫 화면 · 에이전트의 ContactRecordDrawer)는 배치를 넘기지 않는다 — 작은 창
  // 그대로. 오늘 연락은 2026-09-30 ④에서 읽기 칸(context)을 주는 호출처가 됐다 — 그 길만 넓은 기록창이다.
  const shell = source.slice(source.indexOf("export function ContactRecordDrawer"));
  const small = shell.slice(shell.indexOf("if (!windowed) {"), shell.indexOf("// ── 넓은 기록창 ──"));
  assert.ok(small.length > 0);
  assert.doesNotMatch(small, /layout=/);
  assert.match(small, /presentation="compact"\s*width="min\(520px, 96vw\)"/);
  assert.match(shell, /const windowed = typeof context === "function";/);
  // 좁은 화면의 것(머리 저장 자리 · 머리의 초안 자리 · 가려진 동안의 줄 · 쓰기로 돌리기)과 이어 쓰기의 것(다음 사람 ·
  // 보조 버튼 자리 · 줄에 세우기 · 넘어가기 · 저장 뒤 덧말 · 넘어와 선 폼 · 초안 자리 나누기)은 전부 선택이고 기본은 '없음'이다.
  assert.match(source, /undoMode = "inline", layout = "compact", children = null, mode = "contact", onModeChange, memo = null, saveSlot, statusSlot, away = false, onReturn, onAttention, next = null, secondarySlot, onQueued, onAdvance, onNotice, handoff = false, draftScope = "" \}\) \{/);
});

test("넓은 배치는 요약 한 줄(필수) + 늘 펼친 자세히(선택) 두 칸이다", () => {
  const html = renderWide();
  // 요약 — 필수, 16px 칸(record-wide__summary), 500자, 열자마자 커서.
  assert.match(html, /<label class="hub-label"[^>]*>요약 · 한 줄<span class="hub-label__req"> · 필수<\/span><\/label>/);
  const summary = tagOf(html, /<input[^>]*record-wide__summary[^>]*>/);
  assert.match(summary, /aria-required="true"/);
  assert.match(summary, /maxLength="500"/);
  assert.match(summary, /autofocus=""/);
  assert.match(html, />0 \/ 500</);
  // 자세히 — 접혀 있지 않다(펼치는 버튼 없음). 열 줄에서 시작, 20,000자.
  assert.match(html, /<label class="hub-label"[^>]*>자세히<\/label>/);
  const detail = tagOf(html, /<textarea[^>]*record-wide__detail[^>]*>/);
  assert.match(detail, /rows="10"/);
  assert.match(detail, /maxLength="20000"/);
  assert.doesNotMatch(detail, /aria-required/);
  assert.match(html, /선택 · Moonlight에만 남아요/);
  assert.doesNotMatch(html, />원문 붙여넣기</, "넓은 배치에는 따로 펼치는 원문 칸이 없다");
  assert.doesNotMatch(html, />무슨 얘기</);
  // 같은 폼 상태(form.summary · form.body)다 — 되살린 초안이 두 칸에 그대로 들어온다.
  const draft = { kind: "meeting", reaction: null, replied: false, summary: "단원평가 채점 상담", body: "[결정사항]\n- 10월 셋째 주 시범 채점", nextAction: "", at: "", followup: "dated" };
  const restored = withWindow(tabStorage({ "crm-record:lead:lead-1": JSON.stringify(draft) }), () => renderForm({ layout: "wide" }));
  assert.match(restored, /value="단원평가 채점 상담"/);
  assert.match(restored, /<textarea[^>]*record-wide__detail[^>]*>\[결정사항\]\n- 10월 셋째 주 시범 채점<\/textarea>/);
  assert.match(restored, /초안 · 이 탭 · 쓰던 내용을 불러왔어요/);
  // 긴 글쓰기 칸 규격은 스타일시트가 든다 — 16px · 1.8 · 16px 여백, 모서리는 기본 글쓰기 칸(--r-sm) 그대로.
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  const rule = css.match(/\.hub-app textarea\.hub-input\.record-wide__detail \{[^}]*\}/)?.[0] || "";
  assert.match(rule, /padding: 16px;/);
  assert.match(rule, /font-size: 16px;/);
  assert.match(rule, /line-height: 1\.8;/);
  assert.match(rule, /min-height: var\(--record-detail-min\);/);
  assert.doesNotMatch(rule, /border-radius/);
  assert.match(css, /--record-detail-min: calc\(10 \* 1\.8em \+ 34px\);/);
  assert.match(css, /\.hub-app input\.hub-input\.record-wide__summary \{[^}]*font-size: 16px;/);
});

test("자세히는 쓰는 만큼 실제로 길어진다 — 상한은 화면 높이가 아니라 글의 양이고, 자라면서 화면이 튀지 않는다", () => {
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  const rule = css.match(/\.hub-app textarea\.hub-input\.record-wide__detail \{[^}]*\}/)?.[0] || "";
  // 열 줄에서 마흔 줄까지 자라고 그 뒤로만 칸 안에서 흐른다. 화면 높이(dvh · vh)에서 뺀 상한은 1440×900에서
  // 한 줄도 못 자라게 했다 — 흐르는 것은 흐르는 칸 하나다.
  assert.match(rule, /--record-detail-max: calc\(40 \* 1\.8em \+ 34px\);/);
  assert.match(rule, /max-height: var\(--record-detail-max\);/);
  assert.doesNotMatch(rule, /dvh|vh\b|rem\)/);
  assert.match(rule, /resize: none;/);
  // 높이를 실제로 맞추는 것은 레이아웃 효과다(값은 순수 detailFieldHeight — contact-record.test.mjs).
  // 자세히와 메모 모드의 메모 칸이 같은 규칙(useGrowingDetail)을 쓴다 — 넓은 배치의 연락 기록에서만 자세히를 잰다.
  const effect = source.slice(source.indexOf("export function useGrowingDetail(ref, active, value, shape = \"\") {"), source.indexOf("const RAW_NOTE_ERROR"));
  assert.match(effect, /useLayoutEffectOnClient\(\(\) => \{\s*const el = ref\.current;\s*if \(!active \|\| !el\) return;/);
  assert.match(effect, /el\.style\.height = "auto";\s*el\.style\.height = `\$\{detailFieldHeight\(el\)\}px`;/);
  // 가려진 칸(display: none 안 — '이 고객' 탭 · 접힌 자세히)은 상자가 없다. 재면 0이 나오고, 그걸 높이로 적으면
  // 돌아왔을 때 긴 글이 최소 높이 칸에 갇힌다 — 높이를 건드리기 전에 그만둔다.
  assert.match(effect, /if \(!el\.getClientRects\(\)\.length\) return;/);
  assert.ok(effect.indexOf("if (!el.getClientRects().length) return;") < effect.indexOf('el.style.height = "auto";'), "0을 적기 전에 그만둔다");
  // 다시 재는 때 — 글이 바뀔 때, 가려졌다 다시 보일 때(active), 배치가 바뀔 때(shape: 시트 ↔ 넓은 기록창은 최소 높이가 다르다).
  assert.match(effect, /\}, \[ref, active, value, shape\]\);/);
  // 가려진 동안에는 재지 않는다: '이 고객' 탭(away)과 칩 뒤 칸을 펼쳐 접힌 자세히(folded). 그 사이 되돌리기가 글을
  // 되살려도 높이는 그대로이고, 돌아오는 순간 다시 잰다.
  assert.match(source, /useGrowingDetail\(detailRef, wide && !memoMode && !away && !folded, form\.body, layout\);/);
  assert.match(source, /const folded = sheet && fieldsOpen && !locked;/);
  assert.ok(source.indexOf("const folded = sheet && fieldsOpen && !locked;") < source.indexOf("useGrowingDetail(detailRef,"), "접힘은 재기 전에 정해진다");
  // 재는 동안 칸이 최소 높이로 줄어 흐르는 칸의 위치가 당겨진다 — 재기 전 위치를 잡아 두었다가 되돌린다.
  assert.ok(effect.indexOf("const top = region ? region.scrollTop : 0;") < effect.indexOf('el.style.height = "auto";'));
  assert.match(effect, /if \(region\.scrollTop !== top\) region\.scrollTop = top;/);
  assert.match(effect, /const region = el\.closest\("\.record-wide__scroll"\);/);
  // 글 끝에서 쓰는 중에만 새로 자란 줄을 따라 내려간다(가운데를 고칠 때는 화면을 옮기지 않는다).
  assert.match(effect, /if \(document\.activeElement === el && el\.selectionStart >= el\.value\.length\) \{/);
  // 서버 렌더에는 레이아웃 효과가 없다 — 그때만 일반 효과로 내려간다.
  assert.match(source, /const useLayoutEffectOnClient = typeof window !== "undefined" \? React\.useLayoutEffect : React\.useEffect;/);
});

test("넓은 배치의 아래 띠는 흐르는 칸 밖에 있다 — 어떻게 · 반응 · 다음 약속 · 언제 · 저장, primary는 저장 하나", () => {
  const html = renderWide();
  const scrollAt = html.indexOf('class="record-wide__scroll"');
  const bandAt = html.indexOf('class="record-wide__band"');
  assert.ok(scrollAt > 0 && bandAt > scrollAt, "띠는 흐르는 칸 뒤의 형제다");
  const scroll = html.slice(scrollAt, bandAt);
  const band = html.slice(bandAt);
  // 요약과 자세히는 흐르는 칸에(제자리는 띠 하나 — 글 쓸 자리를 요약이 차지하지 않는다), 띠의 칸들은 띠에.
  assert.match(scroll, /record-wide__summary/);
  assert.match(scroll, /record-wide__detail/);
  assert.ok(scroll.indexOf("record-wide__summary") < scroll.indexOf("record-wide__detail"), "요약이 먼저");
  assert.doesNotMatch(html, /record-wide__top/);
  assert.doesNotMatch(scroll, /aria-label="어떻게 연락했나"|aria-label="언제"/);
  assert.match(band, /role="group" aria-label="어떻게 · 반응 · 다음 약속 · 저장"/);
  // 어떻게 + 반응은 한 줄(같은 row) — 통화는 반응이 필수다.
  const firstRow = band.slice(band.indexOf('class="record-wide__row"'), band.indexOf('class="record-wide__row"', band.indexOf('class="record-wide__row"') + 1));
  assert.match(firstRow, /aria-label="어떻게 연락했나"/);
  assert.match(firstRow, /aria-label="고객 반응"/);
  assert.match(firstRow, /<span class="record-wide__k record-wide__k--in">반응 <small>필수<\/small><\/span>/);
  // 줄마다 이름표(56px) + 칸 기둥 — 칸이 모자라 접혀도 칸 기둥 안에서 접힌다(이름표 기둥으로 새면
  // 접힌 반응이 다른 줄의 칸과 4px 어긋났다). 반응 묶음은 어떻게와 같은 칸 기둥에 있다.
  const rows = band.split('class="record-wide__row"').slice(1);
  assert.equal(rows.length, 3);
  for (const row of rows) assert.match(row, /^><span class="record-wide__k" aria-hidden="true">[^<]+<\/span><div class="record-wide__ctl">/);
  assert.ok(firstRow.indexOf('class="record-wide__ctl"') < firstRow.indexOf('class="record-wide__pair"'));
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  assert.match(css, /\.hub-app \.record-wide__row \{ display: flex; align-items: baseline; gap: 10px; min-width: 0; \}/);
  assert.match(css, /\.hub-app \.record-wide__ctl \{ flex: 1 1 0; min-width: 0; display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.hub-app \.record-wide__k small \{ display: block; font-size: 10\.5px;/);
  assert.match(band, /aria-label="다음 약속 · 무엇을"/);
  assert.match(band, /aria-label="언제"/);
  for (const label of ["내일", "3일 뒤", "다음 주", "날짜…", "기약 없음"]) assert.match(band, new RegExp(`>${label}<`));
  // 저장 줄 — 쉬는 글자 + 저장 ⌘↵. 비활성으로 두지 않는다(왜 안 되는지 말하는 쪽을 택한다).
  assert.match(band, /닫아도 이 탭에 초안으로 남아요/);
  const primaries = html.match(/<button[^>]*hub-btn--primary[^>]*>/g) || [];
  assert.equal(primaries.length, 1);
  assert.doesNotMatch(primaries[0], /disabled/);
  assert.match(band, /hub-btn--primary[^>]*>저장<kbd[^>]*>⌘↵<\/kbd><\/button>/);

  // 카톡 · 메일은 반응 대신 '회신을 받았어요'를 같은 줄에서 묻는다(보낸 사실에 반응을 붙이지 않는다).
  const kakao = renderWide({ preset: { kind: "kakao" } });
  assert.match(kakao, /회신을 받았어요/);
  assert.doesNotMatch(kakao, /aria-label="고객 반응"/);
  // 날짜를 직접 고르면 날짜 칸이 띠 안에 선다.
  assert.match(source, /className="mono record-wide__field"/);
});

test("넓은 배치에서 요약의 Enter는 자세히로 내려가고, ⌘↵는 어디서나 저장이다 — 조합 중에는 둘 다 아니다", () => {
  const handler = source.slice(source.indexOf("const onSummaryKeyDown = (e) => {"), source.indexOf("// 넓은 기록창의 자세히"));
  assert.match(handler, /if \(!isPlainEnter\(e\)\) return;\s*e\.preventDefault\(\);\s*detailRef\.current\?\.focus\(\);/);
  assert.doesNotMatch(handler, /save\(|primaryAction\(/, "요약의 Enter는 저장하지 않는다");
  const wide = source.slice(source.indexOf("if (wide) {"), source.indexOf("<div onKeyDown={onKeyDown} style"));
  assert.match(wide, /onKeyDown=\{onSummaryKeyDown\}/);
  assert.match(wide, /<TextAreaField\s*ref=\{detailRef\}/);
  // ⌘↵는 폼 뿌리가 받는다 — 띠 · 자세히 · 요약 어디에 있든. 조합 중 Enter는 기존 규칙이 거른다.
  // (data-away는 좁은 화면의 '이 고객' 탭에서만 붙는다 — 뿌리는 그대로 서 있다.)
  // 뿌리는 넓은 기록창과 휴대폰 시트가 같이 쓴다(rootClass — 시트면 record-sheet가 덧붙는다).
  assert.match(wide, /<div ref=\{rootRef\} className=\{rootClass\} data-away=\{away \? "true" : undefined\} onKeyDown=\{onKeyDown\}>/);
  assert.match(source, /const rootClass = sheet \? "record-wide record-sheet" : "record-wide";/);
  // 폼 밖(읽기 칸의 기록 줄 · 발판의 '고객 정보로' · 빈 곳)에서 난 ⌘↵도 저장이다 — 넓은 배치에서만 창이
  // 듣고, 같은 드로어 안이거나 포커스가 없을 때만 받는다(규칙은 saveChordReachesRecord — 순수).
  const listener = source.slice(source.indexOf("const saveChordRef = React.useRef(onKeyDown);"), source.indexOf("// 요약 칸의 Enter는 저장이 아니라"));
  assert.match(listener, /saveChordRef\.current = onKeyDown;/);
  assert.match(listener, /if \(!wide\) return undefined;/);
  assert.match(listener, /if \(!root \|\| e\.defaultPrevented\) return;/);
  assert.match(listener, /const shell = root\.closest\('\[role="dialog"\]'\);/);
  assert.match(listener, /saveChordReachesRecord\(\{\s*inForm: root\.contains\(e\.target\),\s*inShell: Boolean\(shell\?\.contains\(e\.target\)\),\s*onBody: e\.target === document\.body,\s*\}\)/);
  assert.match(listener, /if \(reaches\) saveChordRef\.current\(e\);/);
  assert.match(listener, /window\.addEventListener\("keydown", onWindowKey\);\s*return \(\) => window\.removeEventListener\("keydown", onWindowKey\);\s*\}, \[wide\]\);/);
  // 호출처가 끼운 보조 입력(한 줄 메모)의 ⌘↵는 연락 기록을 저장하지 않는다.
  assert.match(source, /if \(e\.target\?\.closest\?\.\("\[data-record-slot\]"\)\) return;/);
  assert.match(wide, /const slotted = children && <div data-record-slot="">\{children\}<\/div>;/);
  const slotted = renderWide({ children: React.createElement("p", null, "보조 입력 자리") });
  assert.match(slotted, /<div data-record-slot="">.*보조 입력 자리.*<\/div>/s);
  assert.ok(slotted.indexOf("보조 입력 자리") < slotted.indexOf('class="record-wide__band"'), "보조 입력은 흐르는 칸 안, 띠 위");
});

test("넓은 배치의 실패는 글을 지우지 않고 원인을 1px 레일 + 제목 한 곳으로 말한다", () => {
  // 늦은 실패로 다시 연 창 — 입력은 그대로, 원인은 레일 줄에.
  const failed = renderWide({ draft: { summary: "다시 열린 입력", body: "긴 글은 그대로" }, initialError: "서버에 닿지 않았어요 — 입력을 복원했습니다." });
  assert.match(failed, /value="다시 열린 입력"/);
  assert.match(failed, />긴 글은 그대로<\/textarea>/);
  const alert = failed.match(/<span role="alert"[^>]*>.*?<\/span><\/span>/s)?.[0] || "";
  assert.match(alert, /box-shadow:inset 1px 0 0 var\(--danger\)/);
  assert.match(alert, /<span style="color:var\(--danger\);font-weight:500">저장 못 함<\/span>/);
  assert.match(alert, />서버에 닿지 않았어요 — 입력을 복원했습니다\.<\/span>/);
  assert.equal((failed.match(/var\(--danger\)/g) || []).length, 2, "빨강은 레일과 제목 글자 한 곳뿐");
  assert.doesNotMatch(failed, /초안으로 남아요/, "실패 원인을 말하는 중에는 쉬는 글자가 덮지 않는다");

  // 좁은 시트는 지금처럼 원인 문장이 위급 색 한 줄이다(레일 없음).
  const compact = withWindow(tabStorage(), () => renderForm({ draft: { summary: "다시 열린 입력" }, initialError: "저장에 실패했습니다." }));
  assert.match(compact, /<span role="alert" style="color:var\(--danger\)">저장에 실패했습니다\.<\/span>/);
  assert.doesNotMatch(compact, /inset 1px 0 0/);

  // 일부 저장(요약은 됐고 자세히는 아직) — 제목이 달라지고, 다시 저장 · 건너뛰기는 기존 재시도 길 그대로.
  assert.match(source, /errorTitle: wide \? \(pendingRawNote \? "일부 저장" : "저장 못 함"\) : "",/);
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  assert.match(persist, /onPartial\?\.\(\{ activityId: data\.activityId \|\| null, optimisticId: snapshot\.optimisticId \}, target\);/);
  assert.ok(persist.indexOf("onPartial?.") > persist.indexOf("onSummaryPersisted?."), "요약이 확인된 뒤에만 일부 저장");
  assert.ok(persist.indexOf("onPartial?.") < persist.lastIndexOf("onPersisted?."), "일부 저장은 저장 확인(onPersisted)과 다른 길이다");
  assert.match(persist, /setErrorMsg\(noteCopy\.failed\);/);
  // 요청이 나가는 순간을 부모에게 알린다 — 기록 줄이 "기록 중"에서 "저장 중"으로 넘어간다.
  assert.match(persist, /^const persist = async \(payload, snapshot\) => \{\s*\/\/[^\n]*\n\s*onSending\?\.\(\{ optimisticId: snapshot\.optimisticId \}, target\);\s*try \{/);
});

test("넓은 배치의 일부 저장은 이미 저장된 것을 잠근다 — 요약은 읽기만, 띠는 저장 줄만, 자세히만 다시 보낸다", () => {
  const held = { activityId: "act-1", optimisticId: "local-1", summary: "단원평가 채점 상담", body: "[결정사항]\n- 10월 셋째 주 시범 채점" };
  const html = withWindow(tabStorage({ "crm-record:lead:lead-1:rawnote": JSON.stringify(held) }), () => renderForm({ layout: "wide", aiContext: "기록 대상 · 리드" }));
  // 요약 — 이미 기록에 남은 줄을 보이되 고칠 수 없다. 필수 표시 · 글자 수 · 커서가 없다(여기 쓴 글은 어디에도 가지 않는다).
  const summary = tagOf(html, /<input[^>]*record-wide__summary[^>]*>/);
  assert.match(summary, /readonly=""/);
  assert.match(summary, /value="단원평가 채점 상담"/);
  assert.doesNotMatch(summary, /autofocus|aria-required|maxLength/);
  assert.match(html, /<label class="hub-label"[^>]*>요약 · 한 줄<\/label>/);
  assert.match(html, /이 요약은 이미 기록에 남았어요 · 자세히만 다시 저장하면 돼요/);
  // 자세히 — 못 보낸 글이 그대로, 커서는 여기에.
  const detail = tagOf(html, /<textarea[^>]*record-wide__detail[^>]*>/);
  assert.match(detail, /autofocus=""/);
  assert.match(html, /<textarea[^>]*record-wide__detail[^>]*>\[결정사항\]\n- 10월 셋째 주 시범 채점<\/textarea>/);
  assert.match(html, /아직 저장되지 않았어요 · 고친 뒤 다시 저장할 수 있어요/);
  // 띠 — 어떻게 · 반응 · 다음 약속 · 언제가 없다(이미 저장된 기록의 것). 저장 줄만: 원인 + 건너뛰기 + 자세히 다시 저장.
  const band = html.slice(html.indexOf('class="record-wide__band"'));
  assert.match(band, /role="group" aria-label="자세히 다시 저장"/);
  assert.doesNotMatch(band, /record-wide__row|aria-label="어떻게 연락했나"|aria-label="고객 반응"|aria-label="언제"|다음 약속 · 무엇을/);
  assert.match(band, />일부 저장<\/span>/);
  assert.match(band, /요약은 저장됐고 자세히는 저장하지 못했어요/);
  assert.match(band, />건너뛰기<\/button>/);
  const primaries = html.match(/<button[^>]*hub-btn--primary[^>]*>[^<]*/g) || [];
  assert.equal(primaries.length, 1);
  assert.match(primaries[0], />자세히 다시 저장$/);
  // AI 채우기는 잠긴 칸(어떻게 · 반응 · 약속)을 채우는 도구라 이 상태에서는 없다.
  assert.doesNotMatch(html, /대화·메모에서 폼 자동 채우기/);
  assert.match(withWindow(tabStorage(), () => renderForm({ layout: "wide", aiContext: "기록 대상 · 리드" })), /대화·메모에서 폼 자동 채우기/);
  // 잠긴 요약은 칸처럼 보이지 않는다 — 채움 없이 흐린 글자(토큰만).
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  assert.match(css, /\.hub-app input\.hub-input\.record-wide__summary:read-only \{ background: transparent; border-color: var\(--line-soft\); color: var\(--fg-muted\); cursor: default; \}/);
  // 저장 뒤에 일부 저장이 되면(폼이 떠 있는 채) 커서를 자세히로 옮긴다 — 기록 칸 밖을 보고 있었다면 두고.
  assert.match(source, /const locked = wide && Boolean\(pendingRawNote\);/);
  assert.match(source, /if \(!active \|\| active === document\.body \|\| rootRef\.current\?\.contains\(active\)\) detailRef\.current\?\.focus\(\);\s*\}, \[locked\]\);/);
  // 좁은 시트는 지금 그대로다(잠그지 않는다).
  const compact = withWindow(tabStorage({ "crm-record:lead:lead-1:rawnote": JSON.stringify(held) }), () => renderForm());
  assert.doesNotMatch(compact, /readonly=""/);
  assert.match(compact, /aria-label="어떻게 연락했나"/);
});

test("저장 확인은 어느 줄의 것인지와, 따로 저장된 자세히를 함께 넘긴다", () => {
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  // 자세히(note)까지 저장됐을 때만 note를 싣는다 — 서버가 준 ID와 보낸 본문.
  assert.match(persist, /savedNote = \{ id: noteData\.id \|\| null, body: note\.body \};/);
  assert.ok(persist.indexOf("savedNote = {") > persist.indexOf('if (!noteResp?.ok || noteData.status !== "saved") {'), "실패 갈래를 지난 뒤에만");
  assert.match(persist, /onPersisted\?\.\(\{ activityId: data\.activityId \|\| null, optimisticId: snapshot\.optimisticId, \.\.\.\(savedNote \? \{ note: savedNote \} : \{\}\) \}, target\);/);
  // 다시 저장 · 건너뛰기도 같은 줄(activityId · optimisticId)을 가리킨다 — 빠지면 기록 줄이 "일부 저장"에 머문다.
  const retry = source.slice(source.indexOf("const retryRawNote = async"), source.indexOf("const skipRawNote"));
  assert.match(retry, /onPersisted\?\.\(\{ activityId: pendingRawNote\.activityId, optimisticId: pendingRawNote\.optimisticId, note: \{ id: data\.id \|\| null, body: note\.body \} \}, target\);/);
  assert.ok(retry.indexOf("onPersisted?.") > retry.indexOf('if (!response.ok || data.status !== "saved") throw'), "서버가 saved로 답한 뒤에만");
  const skip = source.slice(source.indexOf("const skipRawNote = ()"), source.indexOf("const fail ="));
  assert.match(skip, /onPersisted\?\.\(\{ activityId: pendingRawNote\.activityId, optimisticId: pendingRawNote\.optimisticId \}, target\);/);
  assert.doesNotMatch(skip, /note:/, "건너뛴 긴 글을 저장된 줄로 세우지 않는다");
});

test("RecordSaveLine은 제목이 있는 실패만 레일로 그린다", () => {
  const render = (input) => renderToStaticMarkup(React.createElement(RecordSaveLine, { line: recordSaveLine(input) }));
  const titled = render({ state: "error", errorMsg: "요약은 저장됐고 자세히는 저장하지 못했어요.", errorTitle: "일부 저장" });
  assert.match(titled, /role="alert"/);
  assert.match(titled, /inset 1px 0 0 var\(--danger\)/);
  assert.match(titled, />일부 저장<\/span><span[^>]*>요약은 저장됐고 자세히는 저장하지 못했어요\.<\/span>/);
  // 경고 · 빠진 항목 · 초안 글자는 제목을 줘도 레일이 서지 않는다(빨강은 실패에만).
  for (const input of [{ state: "warn", warnCopy: "경고" }, { showMissing: true }, { draftHint: "초안" }]) {
    assert.doesNotMatch(render({ ...input, errorTitle: "저장 못 함" }), /var\(--danger\)/);
  }
});

// ── 2026-09-30 넓은 기록창 ⑥ — 같은 칸의 두 모드(Q-CR6 · 권장, 화면 확인 뒤 확정) ─────────────

const memoSlot = () => React.createElement("div", { "data-memo-slot": "" }, "메모 칸");
const modeBarOf = (html) => html.match(/<div class="record-wide__mode">.*?<\/span><\/div>/s)?.[0] || "";
const pressedOf = (html) => [...html.matchAll(/<button type="button" class="hub-seg__btn" aria-pressed="(true|false)"[^>]*>([^<]*)</g)].map((m) => [m[2], m[1]]);

test("메모 칸을 준 넓은 배치에만 '연락 기록 | 메모' 전환이 선다 — 머리 문장이 저장의 결과를 미리 말한다", () => {
  // 메모 칸을 주지 않은 호출처(오늘 연락 · 첫 화면)와 좁은 시트에는 전환이 없다.
  assert.doesNotMatch(renderWide(), /record-wide__mode|무엇을 남기나/);
  assert.doesNotMatch(withWindow(tabStorage(), () => renderForm({ memo: memoSlot, mode: "memo" })), /record-wide__mode|data-memo-slot/, "좁은 시트는 지금 그대로 — 메모 모드가 없다");

  const contact = renderWide({ memo: memoSlot });
  const bar = modeBarOf(contact);
  assert.match(bar, /role="group" aria-label="무엇을 남기나"/);
  assert.deepEqual(pressedOf(bar), [["연락 기록", "true"], ["메모", "false"]]);
  assert.match(bar, /<span class="record-wide__say" aria-live="polite">연락한 일을 남겨요 · 마지막 연락일과 다음 약속이 바뀌어요<\/span>/);
  // 전환 칸은 쓰기 칸 맨 위 제자리 — 흐르는 칸 밖(앞)에 있다. 연락 기록의 칸들은 그대로다.
  assert.ok(contact.indexOf('class="record-wide__mode"') < contact.indexOf('class="record-wide__scroll"'));
  assert.match(contact, /record-wide__summary/);
  assert.match(contact, /aria-label="어떻게 · 반응 · 다음 약속 · 저장"/);
  assert.doesNotMatch(contact, /data-memo-slot/);

  const memo = renderWide({ memo: memoSlot, mode: "memo" });
  assert.deepEqual(pressedOf(modeBarOf(memo)), [["연락 기록", "false"], ["메모", "true"]]);
  assert.match(modeBarOf(memo), />연락이 아니에요 · 마지막 연락일과 약속은 그대로예요<\/span>/);
  // 모르는 모드 값은 연락 기록이다.
  assert.deepEqual(pressedOf(modeBarOf(renderWide({ memo: memoSlot, mode: "draft" }))), [["연락 기록", "true"], ["메모", "false"]]);
  // 이 창의 가장 큰 갈림이라 한 단계 크게 선다(md: 12.5px) — 아래 띠의 '어떻게'(sm: 11.5px)와 같은 급이 아니다.
  for (const button of bar.match(/<button[^>]*>/g)) assert.match(button, /font-size:12\.5px/);
  const channel = tagOf(contact, /<div class="hub-seg" role="group" aria-label="어떻게 연락했나"[^>]*>.*?<\/div>/s);
  for (const button of channel.match(/<button[^>]*>/g)) assert.match(button, /font-size:11\.5px/);
  // 모드는 호출처가 든다 — 누르면 바뀐 모드를 알리고(같은 모드를 다시 누르면 알리지 않는다), 색이 아니라 글자로 말한다.
  assert.match(source, /if \(normalizeRecordMode\(next\) === \(memoMode \? "memo" : "contact"\)\) return;/);
  assert.match(source, /onModeChange\?\.\(normalizeRecordMode\(next\)\);/);
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  assert.match(css, /\.hub-app \.record-wide__mode \{ flex: none; [^}]*border-bottom: 1px solid var\(--line-soft\);/);
  assert.match(css, /\.hub-app \.record-wide__say \{[^}]*font-size: 12px;[^}]*color: var\(--fg-muted\); \}/);
});

test("메모 모드는 같은 칸에서 어떻게 · 반응 · 다음 약속을 숨기고 메모 칸을 놓는다 — 연락 기록의 칸은 하나도 없다", () => {
  let slot = null;
  const html = renderWide({ memo: (given) => { slot = given; return memoSlot(); }, mode: "memo", aiContext: "기록 대상 · 리드" });
  assert.match(html, /^<div class="record-wide" data-record-mode="memo">/);
  assert.match(html, /<div data-memo-slot="">메모 칸<\/div><\/div>$/, "전환 칸 다음이 곧 메모 칸이다");
  assert.doesNotMatch(html, /record-wide__summary|record-wide__detail|record-wide__band|record-wide__row/);
  assert.doesNotMatch(html, /어떻게 연락했나|고객 반응|다음 약속 · 무엇을|aria-label="언제"|요약 · 한 줄|대화·메모에서 폼 자동 채우기/);
  assert.doesNotMatch(html, /hub-btn--primary/, "주 버튼은 메모 칸의 것 하나다 — 폼은 연락 기록의 저장을 그리지 않는다");
  // 메모 칸이 받는 것 — ⌘↵가 부를 저장 자리(saveRef)와, 앞서 누른 연락 기록의 진행 줄(없으면 null).
  // 좁은 화면의 자리(머리 저장 · 흐르는 칸 맨 위 · 가려진 동안의 줄)도 함께 넘어가지만, 넓은 배치에서는 전부 비어 있다.
  assert.deepEqual(Object.keys(slot).sort(), ["away", "contactLine", "contactProgress", "head", "onAttention", "onContactUndo", "onReturn", "saveRef", "saveSlot", "sheet"]);
  assert.deepEqual(slot.saveRef, { current: null });
  assert.equal(slot.contactLine, null);
  // 앞서 누른 연락 기록이 없으면 진행도 되돌리기도 없다.
  assert.deepEqual([slot.contactProgress, slot.onContactUndo], [null, undefined]);
  assert.deepEqual([slot.sheet, slot.head, slot.saveSlot, slot.away, slot.onReturn, slot.onAttention], [false, null, undefined, false, undefined, undefined]);
  // 이 파일은 일지 메모 코드를 끌고 오지 않는다 — 메모 칸은 호출처가 넘긴다.
  assert.doesNotMatch(source, /from "\.\/record-memo-pane"|use-memos|journal/);

  // 쓰던 연락 기록은 메모 모드에서 보이지 않고, 연락 기록 모드에서는 그대로 보인다. (두 번 그리는 이 확인은
  // 각자 같은 탭 초안을 되살린 두 폼이다 — 한 폼이 모드를 오가며 상태를 지키는 것은 아래 두 가지가 고정한다:
  // 호출처가 폼을 다시 세우지 않는 것(customers.test.mjs — 같은 key), 그리고 메모 분기가 모든 훅 뒤에 있는 것.)
  const draft = { kind: "meeting", reaction: null, replied: false, summary: "쓰던 요약", body: "쓰던 자세히", nextAction: "", at: "", followup: "dated" };
  const store = { "crm-record:lead:lead-1": JSON.stringify(draft) };
  const inMemo = withWindow(tabStorage(store), () => renderForm({ layout: "wide", memo: memoSlot, mode: "memo" }));
  assert.doesNotMatch(inMemo, /쓰던 요약|쓰던 자세히|쓰던 내용을 불러왔어요/, "메모 모드에는 연락 기록의 글이 보이지 않는다");
  const back = withWindow(tabStorage(store), () => renderForm({ layout: "wide", memo: memoSlot, mode: "contact" }));
  assert.match(back, /value="쓰던 요약"/);
  assert.match(back, />쓰던 자세히<\/textarea>/);

  // 메모 분기(이른 return)는 폼의 모든 훅 뒤에 있다 — 같은 폼이 두 모드를 오가므로, 분기 아래에 훅이 하나라도
  // 있으면 첫 전환에서 훅 순서가 어긋나 폼이 던진다(서버 렌더는 한 폼을 두 모드로 다시 그리지 않아 잡지 못한다).
  const component = source.slice(source.indexOf("export function ContactRecordForm("));
  const body = component.slice(0, component.indexOf("\n}\n") + 3);
  const branchAt = body.indexOf("if (memoMode) {\n    const contactNote");
  assert.ok(branchAt > 0, "메모 분기를 찾는다");
  const hookCall = /\b(?:React\.)?use[A-Z]\w*\(/g;
  assert.ok((body.slice(0, branchAt).match(hookCall) || []).length > 10, "훅은 분기 위에 있다");
  assert.deepEqual(body.slice(branchAt).match(hookCall) || [], [], "메모 분기 아래에는 훅이 없다");
});

test("메모를 쓰는 동안 실패한 연락 기록은 전환 칸의 이름에 글자로 선다 — 돌아가면 글과 원인이 그대로다", () => {
  const failed = { draft: { summary: "보내지 못한 요약" }, initialError: "서버에 닿지 않았어요 — 입력을 복원했습니다." };
  const inMemo = renderWide({ memo: memoSlot, mode: "memo", ...failed });
  assert.deepEqual(pressedOf(modeBarOf(inMemo)), [["연락 기록 · 저장 못 함", "false"], ["메모", "true"]]);
  assert.doesNotMatch(modeBarOf(inMemo), /var\(--danger\)/, "전환 칸은 색이 아니라 글자로 말한다 — 빨강은 저장 줄 몫");
  // 흐린 글자만으로는 저장 실패가 읽히지 않는다 — 메모 칸의 저장 줄 위에 원인 줄(1px 레일 + 제목)이 선다. 빨강은 그 한 곳.
  const lineIn = (props) => {
    let slot = null;
    const html = renderWide({ memo: (given) => { slot = given; return React.createElement("div", { "data-memo-slot": "" }, given.contactLine); }, mode: "memo", ...props });
    return { html, line: slot.contactLine };
  };
  const carried = lineIn(failed);
  assert.match(carried.html, /<div class="record-wide__save"><div[^>]*><span role="alert" style="[^"]*box-shadow:inset 1px 0 0 var\(--danger\)[^"]*"><span style="color:var\(--danger\);font-weight:500">연락 기록 · 저장 못 함<\/span><span[^>]*>연락 기록으로 돌아가면 쓰던 글과 원인이 그대로 있어요\.<\/span><\/span><\/div><\/div>/);
  assert.equal((carried.html.match(/var\(--danger\)/g) || []).length, 2, "레일과 제목 글자 — 빨강은 한 곳");
  assert.equal((carried.html.match(/role="alert"/g) || []).length, 1);
  // 실패가 없으면 그 줄도 없다.
  assert.equal(lineIn().line, null);
  // 연락 기록을 보고 있을 때는 저장 줄이 말한다 — 전환 칸에 같은 말을 두 번 하지 않는다.
  const inContact = renderWide({ memo: memoSlot, ...failed });
  assert.deepEqual(pressedOf(modeBarOf(inContact)), [["연락 기록", "true"], ["메모", "false"]]);
  assert.match(inContact, />저장 못 함<\/span>/);
  assert.match(inContact, /value="보내지 못한 요약"/);
  // 일부 저장(요약은 됐고 자세히는 아직)도 같은 자리에 그 이름으로 선다.
  const held = { activityId: "act-1", optimisticId: "local-1", summary: "저장된 요약", body: "못 보낸 자세히" };
  const partial = withWindow(tabStorage({ "crm-record:lead:lead-1:rawnote": JSON.stringify(held) }), () => renderForm({ layout: "wide", memo: memoSlot, mode: "memo" }));
  assert.deepEqual(pressedOf(modeBarOf(partial)), [["연락 기록 · 일부 저장", "false"], ["메모", "true"]]);
  let heldSlot = null;
  const heldHtml = withWindow(tabStorage({ "crm-record:lead:lead-1:rawnote": JSON.stringify(held) }), () => renderForm({ layout: "wide", mode: "memo", memo: (given) => { heldSlot = given; return React.createElement("div", null, given.contactLine); } }));
  assert.ok(heldSlot.contactLine);
  assert.match(heldHtml, />연락 기록 · 일부 저장<\/span><span[^>]*>요약은 저장됐어요 · 연락 기록으로 돌아가면 자세히를 다시 저장할 수 있어요\.<\/span>/);
});

test("메모 모드가 있으면 '메모만' 채널은 메모 모드가 대신한다 — 이미 골라 둔 값은 남긴다", () => {
  const channelsOf = (html) => {
    const group = html.match(/<div class="hub-seg" role="group" aria-label="어떻게 연락했나"[^>]*>.*?<\/div>/s)?.[0] || "";
    return [...group.matchAll(/<button[^>]*>([^<]+)</g)].map((m) => m[1]);
  };
  assert.deepEqual(channelsOf(renderWide()), ["통화", "미팅", "카톡·문자", "메일", "메모만"], "메모 칸이 없는 호출처는 다섯 채널 그대로");
  assert.deepEqual(channelsOf(renderWide({ memo: memoSlot })), ["통화", "미팅", "카톡·문자", "메일"]);
  // 다른 진입점 · 쓰던 초안이 이미 '메모만'을 골랐으면 그 칸이 사라지지 않는다.
  assert.deepEqual(channelsOf(renderWide({ memo: memoSlot, preset: { kind: "note" } })), ["통화", "미팅", "카톡·문자", "메일", "메모만"]);
  // 좁은 시트는 메모 칸을 줘도 지금 그대로다.
  assert.deepEqual(channelsOf(withWindow(tabStorage(), () => renderForm({ memo: memoSlot }))), ["통화", "미팅", "카톡·문자", "메일", "메모만"]);
  assert.match(source, /const wideChannelOptions = recordChannelOptions\(channelOptions, form\.kind, \{ memoMode: memoAvailable \}\);/);
});

test("메모 모드의 ⌘↵는 메모 저장이다 — 보이지 않는 연락 기록을 저장하지 않고, 앞선 저장의 되돌리기는 메모 칸 위에 남는다", () => {
  const handler = source.slice(source.indexOf("const onKeyDown = (e) => {"), source.indexOf("// 넓은 기록창의 ⌘↵는 어디서나 저장이다"));
  assert.match(handler, /if \(memoMode\) \{\s*e\.preventDefault\(\);\s*memoSaveRef\.current\?\.\(\);\s*return;\s*\}/);
  assert.ok(handler.indexOf("if (memoMode) {") < handler.indexOf("primaryAction();"), "메모 모드에서는 연락 기록의 저장에 닿지 않는다");
  assert.ok(handler.indexOf("if (!isSaveChord(e)) return;") < handler.indexOf("if (memoMode) {"), "조합 중 Enter는 메모 모드에서도 저장이 아니다");
  // 창 어디서나(읽기 칸 · 발판)의 ⌘↵도 같은 길을 탄다 — 최신 핸들러를 ref로 부른다.
  assert.match(source, /saveChordRef\.current = onKeyDown;/);
  // 메모 모드는 넓은 배치 + 메모 칸을 준 호출처만.
  assert.match(source, /const memoAvailable = wide && typeof memo === "function";\s*const memoMode = memoAvailable && normalizeRecordMode\(mode\) === "memo";/);
  // 앞서 누른 연락 기록이 가는 중이면 그 진행(되돌리기 포함)을 메모 칸의 띠 위에 넘긴다 — 어느 기록의 것인지 이름을 붙여서.
  const branch = source.slice(source.indexOf("if (memoMode) {\n    const contactNote"), source.indexOf("// 넓은 기록창 — 아래 띠(어떻게"));
  assert.match(branch, /const contactProgress = pendingUndo && saveLine\.progress \? \{ \.\.\.saveLine\.progress, label: `연락 기록 · \$\{saveLine\.progress\.label\}` \} : null;/);
  assert.match(branch, /const contactLine = contactProgress\s*\? <div className="record-wide__save"><RecordSaveLine line=\{\{ progress: contactProgress, note: null \}\} onUndo=\{pendingUndo\.undo\} \/><\/div>/);
  // 진행 중인 줄이 없을 때만 실패 줄이 선다(둘이 같이 서지 않는다).
  assert.match(branch, /: contactNote\s*\? <div className="record-wide__save"><RecordSaveLine line=\{\{ progress: null, note: contactNote \}\} \/><\/div>\s*: null;/);
  // 같은 진행과 되돌리기를 메모 칸에도 따로 넘긴다 — '이 고객' 탭에서는 띠가 가려져 있어 돌아가기 줄이 대신 보인다.
  assert.match(branch, /\{memo\(\{ saveRef: memoSaveRef, contactLine, contactProgress, onContactUndo: pendingUndo\?\.undo, sheet, head: sheet \? modeBar : null, saveSlot: sheet \? saveSlot : undefined, away, onReturn, onAttention \}\)\}/);
});

// ── 2026-09-30 넓은 기록창 ③ — 휴대폰 전체 높이 시트 · 좁은 화면의 탭(Q-CR3 · Q-CR11, 권장 · 화면 확인 뒤 확정) ──

const renderSheet = (props = {}) => withWindow(tabStorage(), () => renderForm({ layout: "sheet", ...props }));
const primariesOf = (html) => html.match(/<button[^>]*hub-btn--primary[^>]*>.*?<\/button>/gs) || [];
const chipsOf = (html) => [...(html.match(/<div class="record-sheet__chips">.*?<\/div>/s)?.[0] || "").matchAll(/<button[^>]*record-sheet__chip[^>]*>(.*?)<\/button>/gs)]
  .map((m) => m[1].replace(/<svg.*?<\/svg>/gs, "").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, ""));

test("휴대폰 시트는 같은 두 칸이다 — 아래 띠 대신 키보드 위 칩 줄, 어떻게 · 반응 · 약속은 칩 뒤에 접혀 있다", () => {
  const html = renderSheet();
  assert.match(html, /^<div class="record-wide record-sheet">/);
  // 요약(필수 · 16px 칸 · 커서)과 늘 펼친 자세히 — 넓은 기록창과 같은 칸 · 같은 글자 수.
  const summary = tagOf(html, /<input[^>]*record-wide__summary[^>]*>/);
  assert.match(summary, /aria-required="true"/);
  assert.match(summary, /autofocus=""/, "R · 연락 기록 · 했어요로 열면 커서가 요약에 선다");
  assert.match(summary, /maxLength="500"/);
  const detail = tagOf(html, /<textarea[^>]*record-wide__detail[^>]*>/);
  assert.match(detail, /maxLength="20000"/);
  assert.match(detail, /rows="6"/, "키보드 위에 남는 높이에 맞춰 여섯 줄에서 시작한다(넓은 기록창은 열 줄)");
  assert.doesNotMatch(detail, /autofocus/);
  assert.ok(html.indexOf("record-wide__summary") < html.indexOf("record-wide__detail"));
  assert.doesNotMatch(html, />무슨 얘기<|>원문 붙여넣기</);
  // 아래 띠(이름표 + 칸 줄)가 없다 — 그 칸들은 칩을 누르기 전에는 그려지지 않는다.
  assert.doesNotMatch(html, /record-wide__band|record-wide__row|record-sheet__fields/);
  assert.doesNotMatch(html, /aria-label="어떻게 연락했나"|aria-label="고객 반응"|aria-label="언제"|다음 약속 · 무엇을/);
  // 맨 아래 줄 — 흐르는 칸 밖(뒤)의 제자리. 저장 상태 한 줄 + 칩 둘.
  const scrollAt = html.indexOf('class="record-wide__scroll"');
  const barAt = html.indexOf('class="record-sheet__bar"');
  assert.ok(scrollAt > 0 && barAt > scrollAt);
  const bar = html.slice(barAt);
  assert.match(bar, /^class="record-sheet__bar" role="group" aria-label="저장 · 어떻게 · 반응 · 약속 요약"/);
  assert.match(bar, /닫아도 이 탭에 초안으로 남아요/);
  assert.equal(chipsOf(html).length, 2);
  assert.equal(chipsOf(html)[0], "통화 · 반응 필수");
  assert.match(chipsOf(html)[1], /^약속 · 3일 뒤\|\d{1,2}\/\d{1,2}$/, "날짜는 M/D");
  assert.match(bar, /<span class="mono">\d{1,2}\/\d{1,2}<\/span>/, "날짜는 mono");
  // 칩은 Button이다(새 알약을 만들지 않는다) — 누르면 칸이 펼쳐진다고 알린다.
  for (const chip of bar.match(/<button[^>]*record-sheet__chip[^>]*>/g)) {
    assert.match(chip, /class="hub-btn hub-btn--outline record-sheet__chip"/);
    assert.match(chip, /aria-expanded="false"/);
  }
  // 칩의 글자는 폼의 값에서 나온다(순수 규칙 — contact-record.test.mjs). 칸 이름은 시트의 채널 이름이다.
  assert.deepEqual(chipsOf(renderSheet({ preset: { kind: "kakao" } }))[0], "카톡·문자");
  assert.deepEqual(chipsOf(renderSheet({ preset: { kind: "meeting", reaction: "positive" } }))[0], "미팅 · 긍정");
  assert.match(source, /const chips = recordSheetChips\(form, \{\s*kindLabel: channelOptions\.find\(\(c\) => c\.key === form\.kind\)\?\.label,\s*whenLabel: WHEN_PRESETS\.find\(\(p\) => p\.key === whenKey\)\?\.label,\s*\}\);/);
  // 되살린 초안은 같은 두 칸에 그대로 들어온다(같은 폼 상태 · 같은 초안 키).
  const draft = { kind: "meeting", reaction: null, replied: false, summary: "단원평가 채점 상담", body: "[결정사항]\n- 10월 셋째 주 시범 채점", nextAction: "", at: "", followup: "dated" };
  const restored = withWindow(tabStorage({ "crm-record:lead:lead-1": JSON.stringify(draft) }), () => renderForm({ layout: "sheet" }));
  assert.match(restored, /value="단원평가 채점 상담"/);
  assert.match(restored, /<textarea[^>]*record-wide__detail[^>]*>\[결정사항\]\n- 10월 셋째 주 시범 채점<\/textarea>/);
  assert.match(restored, /초안 · 이 탭 · 쓰던 내용을 불러왔어요/);
  assert.doesNotMatch(restored, /이 기기/, "아직 약속하지 않은 곳을 말하지 않는다(Q-CR4)");
});

test("휴대폰 시트의 주 버튼은 하나이고 머리 자리에 선다 — 자리가 서기 전에는 제자리에 그리지 않는다", () => {
  // 머리 자리를 주지 않은 호출처(saveSlot 없음) — 저장 줄 끝 제자리에 하나. 휴대폰이라 ⌘↵ 글자는 없다.
  const inline = renderSheet();
  assert.equal(primariesOf(inline).length, 1);
  assert.match(primariesOf(inline)[0], />저장<\/button>$/);
  assert.doesNotMatch(primariesOf(inline)[0], /disabled|⌘↵/);
  assert.ok(inline.indexOf("hub-btn--primary") > inline.indexOf('class="record-sheet__line"'));
  // 머리 자리를 받기로 했고 아직 서지 않았다(null) — 주 버튼을 제자리에 그리지 않는다(번쩍임 없음). 나머지는 그대로다.
  const waiting = renderSheet({ saveSlot: null });
  assert.equal(primariesOf(waiting).length, 0);
  assert.equal(chipsOf(waiting).length, 2);
  assert.match(waiting, /닫아도 이 탭에 초안으로 남아요/);
  // 넓은 기록창 · 좁은 시트는 머리 자리를 받지 않는다 — saveSlot을 줘도 제자리다.
  assert.equal(primariesOf(renderWide({ saveSlot: null })).length, 1);
  assert.equal(primariesOf(withWindow(tabStorage(), () => renderForm({ saveSlot: null }))).length, 1);
  assert.match(source, /<RecordPrimarySlot slot=\{sheet \? saveSlot : undefined\}>/);

  // 자리 규칙 — 없음(undefined)은 제자리, null은 그리지 않음, 요소는 그 자리(포털).
  const child = React.createElement("button", { type: "button" }, "저장");
  assert.equal(renderToStaticMarkup(React.createElement(RecordPrimarySlot, { slot: undefined }, child)), '<button type="button">저장</button>');
  assert.equal(renderToStaticMarkup(React.createElement(RecordPrimarySlot, { slot: null }, child)), "");
  assert.match(source, /if \(slot === undefined\) return children;\s*return slot \? createPortal\(children, slot\) : null;/);

  // 실패 뒤 다시 연 시트 — 글은 그대로, 원인은 칩 줄 위의 레일 줄에, 머리 버튼은 '다시 저장'.
  const failed = renderSheet({ draft: { summary: "다시 열린 입력", body: "긴 글은 그대로" }, initialError: "서버에 닿지 않았어요 — 입력을 복원했습니다." });
  assert.match(failed, /value="다시 열린 입력"/);
  assert.match(failed, />긴 글은 그대로<\/textarea>/);
  assert.match(failed, />저장 못 함<\/span>/);
  assert.equal((failed.match(/var\(--danger\)/g) || []).length, 2, "빨강은 레일과 제목 글자 한 곳뿐");
  assert.equal(primariesOf(failed).length, 1);
  assert.match(primariesOf(failed)[0], />다시 저장<\/button>$/);
  // 넓은 기록창의 버튼은 원인 줄 바로 옆이라 '저장' 그대로다.
  assert.match(primariesOf(renderWide({ draft: { summary: "다시 열린 입력" }, initialError: "서버에 닿지 않았어요." }))[0], />저장<kbd/);
});

test("휴대폰 시트의 일부 저장도 요약을 잠그고 자세히만 남긴다 — 칩 · 칸 없이 저장 줄만", () => {
  const held = { activityId: "act-1", optimisticId: "local-1", summary: "단원평가 채점 상담", body: "[결정사항]\n- 10월 셋째 주 시범 채점" };
  const html = withWindow(tabStorage({ "crm-record:lead:lead-1:rawnote": JSON.stringify(held) }), () => renderForm({ layout: "sheet" }));
  const summary = tagOf(html, /<input[^>]*record-wide__summary[^>]*>/);
  assert.match(summary, /readonly=""/);
  assert.match(summary, /value="단원평가 채점 상담"/);
  assert.match(tagOf(html, /<textarea[^>]*record-wide__detail[^>]*>/), /autofocus=""/);
  assert.doesNotMatch(html, /record-sheet__chips|record-sheet__fields/);
  const bar = html.slice(html.indexOf('class="record-sheet__bar"'));
  assert.match(bar, /role="group" aria-label="자세히 다시 저장"/);
  assert.match(bar, />일부 저장<\/span>/);
  assert.match(bar, />건너뛰기<\/button>/);
  assert.equal(primariesOf(html).length, 1);
  assert.match(primariesOf(html)[0], />자세히 다시 저장<\/button>$/);
});

test("칩을 누르면 어떻게 · 반응 · 다음 약속 · 언제가 펼쳐진다 — 같은 값, 세그먼트는 가로로, 자세히는 접힐 뿐 걷히지 않는다", () => {
  const form = { kind: "meeting", reaction: null, replied: false, summary: "", body: "", nextAction: "견적서 보내기", at: "2026-10-03", followup: "dated" };
  const channelOptions = [{ key: "call", label: "통화" }, { key: "meeting", label: "미팅" }, { key: "kakao", label: "카톡·문자" }, { key: "email", label: "메일" }];
  const render = (props = {}) => renderToStaticMarkup(React.createElement(RecordSheetFields, { form, channelOptions, wantsReaction: true, reactionMissing: false, whenKey: "d3", onEdit() {}, onChannel() {}, onWhen() {}, ...props }));
  const html = render();
  assert.match(html, /^<div class="record-sheet__fields" role="group" aria-label="어떻게 · 반응 · 다음 약속">/);
  const pressed = (label) => [...(html.match(new RegExp(`<div class="hub-seg" role="group" aria-label="${label}"[^>]*>.*?</div>`, "s"))?.[0] || "").matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(pressed("어떻게 연락했나"), [["통화", "false"], ["미팅", "true"], ["카톡·문자", "false"], ["메일", "false"]]);
  assert.deepEqual(pressed("고객 반응").map(([label]) => label), ["긍정", "중립", "우려", "거절", "무응답"]);
  assert.deepEqual(pressed("언제"), [["내일", "false"], ["3일 뒤", "true"], ["다음 주", "false"], ["날짜…", "false"], ["기약 없음", "false"]]);
  assert.match(html, /<label class="hub-label"[^>]*>다음 약속<\/label>/);
  assert.match(html, /value="견적서 보내기"/);
  assert.match(html, />반응<span class="hub-label__req"> · 필수<\/span>/);
  // 반응 세그먼트는 좁은 화면에서도 가로 한 줄이다(칸이 폭을 나눠 가진다 — 자식을 100%로 세우지 않는다).
  const reaction = html.match(/<div class="hub-seg" role="group" aria-label="고객 반응"[^>]*>.*?<\/div>/s)?.[0] || "";
  for (const button of reaction.match(/<button[^>]*>/g)) assert.match(button, /flex:1 1 0;min-width:0/);
  assert.doesNotMatch(html, /flex-basis:100%|flex:1 0 100%/);
  // 아직 눌러 보지 않았으면 붉히지 않는다 — 저장을 눌러 본 뒤 빠진 반응만 위급 색 한 줄.
  assert.doesNotMatch(html, /data-invalid|role="alert"/);
  const missing = render({ reactionMissing: true });
  assert.match(missing, /data-invalid=""/);
  assert.match(missing, /<p class="hub-field-msg hub-field-msg--error record-wide__msg" role="alert">반응을 하나 고르세요\.<\/p>/);
  // 반응을 묻지 않는 채널은 반응 칸이 없다 — 보낸 사실에 반응을 붙이지 않는다.
  assert.doesNotMatch(render({ form: { ...form, kind: "kakao" }, wantsReaction: false }), /고객 반응|반응<span/);
  // 날짜를 직접 고를 때만 날짜 칸이 선다(mono).
  assert.doesNotMatch(html, /type="date"/);
  const dated = render({ whenKey: "date", dateError: "날짜를 고르거나 기약 없음을 선택하세요." });
  assert.match(tagOf(dated, /<input[^>]*type="date"[^>]*>/), /class="hub-input mono"/);
  assert.match(dated, /role="alert"[^>]*>날짜를 고르거나 기약 없음을 선택하세요\./);

  // 폼은 칩을 눌렀을 때만 이 칸들을 그리고, 자세히는 접힌 한 줄이 된다 — 칸을 걷지 않고 가린다(글 · 커서 자리가 남는다).
  const sheet = source.slice(source.indexOf("if (wide) {\n    const summaryField"), source.indexOf("<div onKeyDown={onKeyDown} style"));
  assert.ok(sheet.length > 0);
  assert.match(source, /const folded = sheet && fieldsOpen && !locked;/);
  assert.match(sheet, /\{folded && \(\s*<RecordSheetFields\s+form=\{form\}\s+channelOptions=\{wideChannelOptions\}/);
  assert.match(sheet, /fieldStyle=\{folded \? \{ display: "none" \} : undefined\}/, "자세히는 걷히지 않고 가려진다");
  assert.match(sheet, /const showChips = !locked && !fieldsOpen;/);
  assert.match(sheet, /\{showChips && \(\s*<div className="record-sheet__chips">/);
  // 칩을 누르면 글 칸이 아닌 곳(고른 세그먼트)에 커서를 둔다 — 키보드가 다시 오르지 않는다. 접힌 줄을 누르면 자세히로.
  assert.match(sheet, /const openFields = \(key\) => \{\s*setFieldsOpen\(true\);\s*requestAnimationFrame\(\(\) => \{\s*const group = \(key === "promise" \? whenRef : howRef\)\.current;\s*\(group\?\.querySelector\('button\[aria-pressed="true"\]'\) \|\| group\?\.querySelector\("button"\)\)\?\.focus\(\);/);
  assert.match(sheet, /const closeFields = \(\) => \{\s*setFieldsOpen\(false\);\s*requestAnimationFrame\(\(\) => detailRef\.current\?\.focus\(\)\);\s*\};/);
  assert.match(sheet, /onClick=\{\(\) => openFields\(chip\.key\)\}/);
  // 접힌 자세히 한 줄은 쓴 줄 수를 말한다(순수 규칙 recordDetailLines).
  assert.match(sheet, /\{lines \? <>자세히 <span className="num">\{lines\}<\/span>줄 · 펼치기<\/> : "자세히 · 비어 있음 · 쓰기"\}/);
  // 저장한 뒤에는 다시 접힌 채(칩 줄)로 돌아간다.
  assert.match(source, /setStoredDraft\(null\); setFieldsOpen\(false\);/);
});

test("빠진 칸이 접혀 있거나 가려져 있으면 저장이 그 칸을 먼저 드러낸다 — 눌러도 아무 일 없는 저장을 두지 않는다", () => {
  const save = source.slice(source.indexOf("const save = ("), source.indexOf("const showMissing"));
  // 시트의 반응 · 날짜는 칩 뒤에 있다 — 빠졌으면 칸을 펼치고, 드러난 다음 프레임에 커서를 둔다.
  assert.match(save, /const folded = sheet && !fieldsOpen && check\.missing\.some\(\(key\) => key !== "summary"\);\s*if \(folded\) setFieldsOpen\(true\);/);
  assert.match(save, /if \(folded \|\| away\) requestAnimationFrame\(focusMissing\);\s*else focusMissing\(\);/);
  // '이 고객' 탭에서 누른 저장이 막히면(빠진 칸 · 빈 약속 경고) 호출처가 쓰기로 돌린다 — 이유는 기록 칸에 있다.
  const missing = save.slice(save.indexOf("if (!check.ok) {"), save.indexOf("if ((promiseEmpty"));
  assert.match(missing, /onAttention\?\.\(\);/);
  const warn = save.slice(save.indexOf("if ((promiseEmpty"), save.indexOf("const optimisticId"));
  assert.match(warn, /setState\("warn"\);[\s\S]*?onAttention\?\.\(\);\s*return;/);
  // 늦은 실패 · 일부 저장도 같다 — 가려진 탭에서 실패가 조용히 묻히지 않는다.
  const fail = source.slice(source.indexOf("const fail = (snapshot, message) => {"), source.indexOf("const save = ("));
  // 단, '저장하고 다음'으로 보낸 기록(snapshot.queued)은 돌리지 않는다 — 창은 이미 다른 사람의 것이고 그 실패는
  // 창 머리의 '이전' 줄이 말한다. 앞 사람의 늦은 실패가 지금 사람이 읽던 '이 고객' 탭을 쓰기로 바꾸지 않는다.
  assert.match(fail, /setErrorMsg\(message\);[\s\S]*?if \(!snapshot\.queued\) onAttention\?\.\(\);/);
  assert.doesNotMatch(fail.replace(/if \(!snapshot\.queued\) onAttention\?\.\(\);/, ""), /onAttention\?\.\(\)/);
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  assert.ok(persist.indexOf("if (!snapshot.queued) onAttention?.();") > persist.indexOf("setErrorMsg(noteCopy.failed);"));
  assert.doesNotMatch(persist.replace(/if \(!snapshot\.queued\) onAttention\?\.\(\);/, ""), /onAttention\?\.\(\)/);
  // 저장이 잘 나가면 돌리지 않는다 — 읽던 '이 고객' 탭에 그대로 머문다.
  assert.equal((save.match(/onAttention\?\.\(\)/g) || []).length, 2);
  // 일부 저장 뒤 머리의 '자세히 다시 저장'도 같다 — '이 고객' 탭에서 눌렀는데 또 실패했거나(서버) 보낼 글이
  // 없으면(빈 자세히) 원인은 가려진 기록 칸에 선다. 쓰기로 돌리지 않으면 눌러도 아무 일 없는 버튼이 된다.
  const retry = source.slice(source.indexOf("const retryRawNote = async () => {"), source.indexOf("const skipRawNote"));
  assert.match(retry, /if \(!note\) \{\s*setState\("error"\);\s*setErrorMsg\(noteCopy\.empty\);[\s\S]*?onAttention\?\.\(\);\s*return;\s*\}/);
  assert.match(retry, /\} catch \(error\) \{\s*setState\("error"\);\s*setErrorMsg\(`[^`]*noteCopy\.kept\}`\);[\s\S]*?onAttention\?\.\(\);\s*\} finally \{/);
  // 돌아와 읽는 원인도 그 화면의 칸 이름으로 말한다 — 넓은 기록창 · 시트에는 '원문'이라는 칸이 없다.
  assert.match(retry, /throw new Error\(data\.error \|\| data\.reason \|\| noteCopy\.again\);/);
  assert.match(source, /again: "원문 저장 실패",/);
  assert.match(source, /again: "자세히를 저장하지 못했어요",/);
  // 다시 저장이 된 길에서는 돌리지 않는다(창이 닫힌다) — 실패한 두 길뿐이다.
  assert.equal((retry.match(/onAttention\?\.\(\)/g) || []).length, 2);
  const ok = retry.slice(retry.indexOf("dropRawNote(target);"), retry.indexOf("} catch (error) {"));
  assert.doesNotMatch(ok, /onAttention/);
});

// 글 칸(요약 input · 자세히 textarea)까지 내려가는 조상들 — 태그와 class. 두 배치의 나무 모양을 견준다.
const VOID_TAGS = new Set(["input", "br", "hr", "img"]);
function ancestorsOf(html, pattern) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
    const [whole, closing, tag, attrs, selfClosing] = m;
    if (closing) { stack.pop(); continue; }
    if (pattern.test(whole)) return [...stack];
    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(`${tag}${/ class="([^"]*)"/.exec(attrs)?.[1] ? `.${/ class="([^"]*)"/.exec(attrs)[1]}` : ""}`);
  }
  return null;
}

test("휴대폰 시트와 넓은 기록창은 한 나무다 — 쓰는 중에 600px를 넘나들어도 글 칸이 다시 서지 않는다", () => {
  // 화면을 돌리면 배치가 sheet ↔ wide로 바뀐다. 두 배치가 다른 나무를 돌려주면 React가 글 칸을 걷고 다시 세워
  // 커서가 요약으로 튀고(autoFocus가 다시 선다) 자란 칸 높이가 사라진다 — 글 칸은 두 배치에서 같은 자리에 선다.
  const draft = { kind: "meeting", reaction: "positive", replied: false, summary: "시범 채점 합의", body: "[결정사항]\n- 10월 셋째 주", nextAction: "", at: "", followup: "dated" };
  const at = (layout, props = {}) => withWindow(tabStorage({ "crm-record:lead:lead-1": JSON.stringify(draft) }), () => renderForm({ layout, ...props }));
  const shape = (html) => ({
    summary: ancestorsOf(html, /record-wide__summary/).slice(1),
    detail: ancestorsOf(html, /<textarea[^>]*record-wide__detail/).slice(1),
  });
  for (const props of [{}, { memo: memoSlot }, { aiContext: "기록 대상 · 리드" }, { away: true }]) {
    const [sheet, wide] = [at("sheet", props), at("wide", props)];
    assert.deepEqual(shape(sheet), shape(wide), JSON.stringify(Object.keys(props)));
    // 글 칸은 흐르는 칸의 바로 아래 자식(칸 껍데기 하나)이다 — 배치마다 다른 감싸개가 끼지 않는다.
    assert.deepEqual(shape(sheet).summary, ["div.record-wide__scroll", "div"]);
    assert.deepEqual(shape(sheet).detail, ["div.record-wide__scroll", "div"]);
    // 뿌리만 다르다(시트면 record-sheet가 덧붙는다).
    assert.deepEqual([ancestorsOf(sheet, /record-wide__summary/)[0], ancestorsOf(wide, /record-wide__summary/)[0]], ["div.record-wide record-sheet", "div.record-wide"]);
  }
  // 나무는 하나다 — 넓은 배치(시트 포함)의 그리기는 return 하나이고, 배치마다 다른 것은 같은 자리에 놓이는 것뿐이다.
  const wide = source.slice(source.indexOf("if (wide) {\n    const summaryField"), source.indexOf("  return (\n    <div onKeyDown={onKeyDown} style"));
  assert.ok(wide.length > 0);
  assert.equal((wide.match(/\n\s*return \(\n/g) || []).length, 1, "시트라고 따로 돌려주지 않는다");
  assert.doesNotMatch(wide, /if \(sheet\) \{\s*(?:const [^\n]*\n\s*)*return \(/);
  assert.equal((wide.match(/className="record-wide__scroll"/g) || []).length, 1);
  // 자리 순서 — 전환 칸은 넓은 기록창에서는 뿌리에, 시트에서는 흐르는 칸 맨 위에(둘 다 자리는 늘 있다).
  assert.match(wide, /\{!sheet && modeBar\}\s*<div className="record-wide__scroll">\s*\{\/\*[^*]*\*\/\}\s*\{sheet && modeBar\}\s*\{restoredLine\}\s*\{captureNote\}\s*\{summaryField\}\s*\{folded && \(/);
  assert.match(wide, /\)\}\s*\{detailField\}\s*\{folded && \(\s*<RecordSheetFields/);
  assert.match(wide, /\{autofill\}\s*\{slotted\}\s*<\/div>\s*\{bottom\}/);
  // 아래 제자리는 배치마다 다른 것이라 이름(key)으로 갈아 끼운다 — 띠가 칩 줄로 '변하지' 않는다.
  assert.match(wide, /<div key="bar" className="record-sheet__bar"/);
  assert.match(wide, /<div key="band" className="record-wide__band"/);
  // 커서는 폼이 처음 설 때만 요약에 선다(autoFocus는 세울 때만 듣는다) — 칸이 다시 서지 않으니 다시 튀지 않는다.
  assert.equal((wide.match(/autoFocus=\{autoFocus\}/g) || []).length, 1);
  // 배치가 바뀌면 자세히의 최소 높이가 달라진다(여섯 줄 ↔ 열 줄) — 그때 다시 잰다(useGrowingDetail의 shape).
  assert.match(source, /useGrowingDetail\(detailRef, [^;]*, form\.body, layout\);/);
});

test("휴대폰 시트의 키보드 위는 칩 줄 하나다 — 저장 줄은 할 말이 있을 때만 서고, 쉬는 초안 자리는 머리가 말한다", () => {
  // 머리에 두 자리(저장 · 둘째 줄)를 받은 시트 — 자리가 서기 전(null)이든 선 뒤든 쉬는 저장 줄은 그리지 않는다.
  const headed = (props = {}) => renderSheet({ saveSlot: null, statusSlot: null, ...props });
  const resting = headed();
  assert.doesNotMatch(resting, /record-sheet__line/, "쉬는 글자에 키보드 위의 한 줄을 쓰지 않는다");
  assert.doesNotMatch(resting, /닫아도 이 탭에 초안으로 남아요|서버에는 아직 없어요/);
  assert.equal(chipsOf(resting).length, 2);
  assert.match(resting, /<div class="record-sheet__bar" role="group" aria-label="저장 · 어떻게 · 반응 · 약속 요약"><div class="record-sheet__chips">/);
  assert.equal(primariesOf(resting).length, 0, "주 버튼은 머리 자리의 것이다");
  // 쓰던 초안이 있어도 같다 — 그 사실('초안 · 이 탭')은 머리의 둘째 줄에 선다(포털이라 여기엔 없다).
  const draft = { kind: "meeting", reaction: "positive", replied: false, summary: "시범 채점 합의", body: "", nextAction: "", at: "", followup: "dated" };
  const dirty = withWindow(tabStorage({ "crm-record:lead:lead-1": JSON.stringify(draft) }), () => renderForm({ layout: "sheet", saveSlot: null, statusSlot: null }));
  assert.doesNotMatch(dirty, /record-sheet__line/);
  assert.match(source, /const headStatus = statusInHead && autoFocus && !untouched \? draftPlaceLabel\(draftPlace\) : "";/);
  assert.match(source, /\{headStatus && statusSlot \? createPortal\(<span> · \{headStatus\}<\/span>, statusSlot\) : null\}/);
  // 쓰기 전에는 머리에도 말하지 않는다(아직 초안이 없다) — 쓰기 시작한 뒤에만 '초안 · 이 탭'.
  assert.match(source, /const statusInHead = primaryInHead && statusSlot !== undefined && !pendingRawNote && recordSaveLineResting\(saveLine\);/);

  // 할 말이 있으면 줄이 선다 — 실패 원인(레일 + 제목) · 일부 저장(건너뛰기 포함). 글은 그대로다.
  const failed = headed({ draft: { summary: "다시 열린 입력", body: "긴 글은 그대로" }, initialError: "서버에 닿지 않았어요 — 입력을 복원했습니다." });
  assert.match(failed, /<div class="record-sheet__line">/);
  assert.match(failed.slice(failed.indexOf('class="record-sheet__line"')), />저장 못 함<\/span>/);
  assert.equal(chipsOf(failed).length, 2);
  const held = { activityId: "act-1", optimisticId: "local-1", summary: "단원평가 채점 상담", body: "[결정사항]" };
  const partial = withWindow(tabStorage({ "crm-record:lead:lead-1:rawnote": JSON.stringify(held) }), () => renderForm({ layout: "sheet", saveSlot: null, statusSlot: null }));
  assert.match(partial.slice(partial.indexOf('class="record-sheet__line"')), />일부 저장<\/span>[\s\S]*>건너뛰기<\/button>/);
  assert.doesNotMatch(partial, /record-sheet__chips/);

  // 머리 자리를 받지 않은 호출처는 지금 그대로다 — 저장 줄(쉬는 글자 포함)과 주 버튼이 키보드 위 제자리에 선다.
  const inline = renderSheet();
  assert.match(inline, /<div class="record-sheet__line">/);
  assert.match(inline, /닫아도 이 탭에 초안으로 남아요/);
  assert.equal(primariesOf(inline).length, 1);
  // 둘째 줄 자리만 받고 저장 자리는 받지 않았으면 줄을 비우지 않는다(주 버튼이 그 줄에 있다).
  const half = renderSheet({ statusSlot: null });
  assert.match(half, /<div class="record-sheet__line">/);
  assert.equal(primariesOf(half).length, 1);
  assert.match(source, /const primaryInHead = sheet && saveSlot !== undefined;/);

  // 머리의 주 버튼은 저장 줄 안이 아니라 뿌리의 제자리에서 그린다 — 경고 · 실패로 줄이 섰다 걷혀도 버튼이
  // 다시 서지 않는다(방금 누른 버튼에서 커서가 떨어지지 않는다).
  assert.match(source, /<div className="record-sheet__line">\{saveStatus\}\{!primaryInHead && savePrimary\}<\/div>/);
  assert.match(source, /\{bottom\}\s*\{\/\*[^*]*\*\/\}\s*\{primaryInHead && savePrimary\}/);
  // 줄도 칩도 없으면(쉬는 중에 칸을 펼친 동안) 빈 띠를 남기지 않는다.
  assert.match(source, /bottom = \(!statusInHead \|\| showChips\) && \(/);

  // 스타일 — 머리의 둘째 줄은 한 줄이다: 이름이 줄고 초안 자리는 잘리지 않는다. 칩의 포커스 링은 안쪽에 그린다
  // (칩 줄은 가로로 흐르는 칸이라 바깥 링이 잘린다 — DESIGN §11 · §15 2026-09-15).
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  assert.match(css, /\.hub-app \.record-window__sub-who \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  assert.match(css, /\.hub-app \.record-window__status-slot \{ flex: none; white-space: pre; color: var\(--fg-muted\); \}/);
  assert.match(css, /\.hub-app \.record-sheet__chips \{[^}]*overflow-x: auto;/);
  const ring = css.match(/\.hub-app \.record-sheet__chip:focus-visible \{[^}]*\}/)?.[0] || "";
  assert.match(ring, /\{ outline-offset: -2px; \}$/, "링의 굵기 · 색 · 모서리는 전역 규칙 그대로 — 자리만 안쪽으로");
  // 약속 한 줄의 날짜는 mono — 무엇보다 앞에 서서 말줄임에 먹히지 않는다.
  assert.match(css, /\.hub-app \.record-window__peek-text \.mono \{ font-size: 12px; color: var\(--fg\); \}/);
});

test("'이 고객' 탭을 보는 동안 기록 칸은 가려질 뿐 서 있다 — 쓰던 글이 남고, 아래 줄이 몇 자인지와 돌아갈 길을 보인다", () => {
  const draft = { kind: "meeting", reaction: "positive", replied: false, summary: "시범 채점 합의", body: "[결정사항]\n- 10월 셋째 주", nextAction: "", at: "", followup: "dated" };
  const stored = () => tabStorage({ "crm-record:lead:lead-1": JSON.stringify(draft) });
  for (const layout of ["sheet", "wide"]) {
    const shown = withWindow(stored(), () => renderForm({ layout }));
    const away = withWindow(stored(), () => renderForm({ layout, away: true }));
    assert.doesNotMatch(shown, /data-away|record-wide__away/, `${layout}: 쓰기 탭에는 돌아가기 줄이 없다`);
    assert.match(away, new RegExp(`^<div class="${layout === "sheet" ? "record-wide record-sheet" : "record-wide"}" data-away="true">`));
    // 쓰던 글은 그대로 서 있다 — 같은 값, 같은 칸(가리는 것은 스타일시트다).
    assert.match(away, /value="시범 채점 합의"/, layout);
    assert.match(away, /<textarea[^>]*record-wide__detail[^>]*>\[결정사항\]\n- 10월 셋째 주<\/textarea>/, layout);
    // 돌아가기 줄 — 뿌리의 마지막 자식. 요약 8자 + 자세히 17자.
    assert.match(away, /<div class="record-wide__away"><span class="record-wide__away-text num">쓰던 기록 · 25자<\/span><button[^>]*hub-btn--secondary[^>]*>쓰기로 돌아가기<\/button><\/div><\/div>$/, layout);
    assert.doesNotMatch(away.slice(away.indexOf('class="record-wide__away"')), /저장됨|기록됨/);
  }
  // 아직 쓴 게 없으면 세지 않는다.
  assert.match(renderSheet({ away: true }), />아직 쓴 기록이 없어요<\/span>/);
  // 가리는 것은 스타일시트다 — 돌아가기 줄만 남기고 나머지 자식을 감춘다. 폼을 걷거나 다시 세우지 않는다.
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  assert.match(css, /\.hub-app \.record-wide\[data-away="true"\] > :not\(\.record-wide__away\) \{ display: none; \}/);
  assert.match(css, /\.hub-app \.record-wide\[data-away="true"\] \{ flex: none; overflow: visible; \}/);
  // 돌아오면 쓰던 자리에 커서를 둔다 — 칸이 다시 선 다음 프레임에.
  assert.match(source, /const returnToWriting = \(\) => \{\s*onReturn\?\.\(\);\s*requestAnimationFrame\(/);
  // 글자 수는 글쓰기 칸의 것이고, 글 없이 고쳐 둔 것(다음 약속 · 반응 · 날짜)이 있는지도 함께 넘긴다 —
  // 저장 안 된 입력이 가려진 칸에 있는데 "쓴 게 없다"고 하지 않는다(규칙은 recordAwayLabel — contact-record.test.mjs).
  assert.match(source, /label=\{recordAwayLabel\(\{ mode: "contact", chars: recordDraftChars\(form\), dirty: !untouched \}\)\}/);
  // 다음 약속만 적어 둔 초안 — 글은 0자이지만 남아 있다고 말한다.
  const onlyPromise = { kind: "call", reaction: null, replied: false, summary: "", body: "", nextAction: "견적서 보내기", at: "", followup: "dated" };
  const promised = withWindow(tabStorage({ "crm-record:lead:lead-1": JSON.stringify(onlyPromise) }), () => renderForm({ layout: "sheet", away: true }));
  assert.match(promised, /<span class="record-wide__away-text num">쓰던 기록이 남아 있어요<\/span>/);
  assert.doesNotMatch(promised, /아직 쓴 기록이 없어요/);

  // 돌아가기 줄 — 앞서 누른 저장이 가는 중이면 그 진행과 되돌리기를 대신 보인다(탭을 옮겼다고 되돌리기가 사라지지 않는다).
  const bar = (props) => renderToStaticMarkup(React.createElement(RecordAwayBar, { label: "쓰던 기록 · 25자", onReturn() {}, ...props }));
  assert.match(bar(), /쓰던 기록 · 25자/);
  const pending = bar({ progress: { label: "기록 중", canUndo: true }, onUndo() {} });
  assert.match(pending, /role="status"[^>]*>기록 중<button[^>]*>되돌리기<\/button>/);
  assert.doesNotMatch(pending, /쓰던 기록/);
  assert.match(pending, />쓰기로 돌아가기<\/button>/);
  assert.doesNotMatch(bar({ progress: { label: "저장 중", canUndo: false } }), /되돌리기/);
  assert.equal((bar().match(/<button/g) || []).length, 1);
  assert.doesNotMatch(bar(), /hub-btn--primary/, "주 버튼은 저장 하나다");
});

test("휴대폰 시트의 메모 모드 — 전환 칸은 메모 칸의 흐르는 칸 맨 위로, 주 버튼 자리 · 가려진 동안의 줄도 메모 칸에 넘긴다", () => {
  let slot = null;
  const saveSlot = null;
  const html = withWindow(tabStorage(), () => renderForm({ layout: "sheet", mode: "memo", saveSlot, away: true, onReturn() {}, onAttention() {}, memo: (given) => { slot = given; return React.createElement("div", { "data-memo-slot": "" }, given.head); } }));
  assert.match(html, /^<div class="record-wide record-sheet" data-record-mode="memo" data-away="true"><div data-memo-slot=""><div class="record-wide__mode">/, "전환 칸은 뿌리에 따로 서지 않고 메모 칸이 받은 head다");
  assert.equal((html.match(/record-wide__mode/g) || []).length, 1);
  assert.deepEqual(pressedOf(modeBarOf(html)), [["연락 기록", "false"], ["메모", "true"]]);
  assert.equal(slot.saveSlot, null);
  assert.equal(slot.sheet, true);
  assert.equal(slot.away, true);
  assert.deepEqual([typeof slot.onReturn, typeof slot.onAttention], ["function", "function"]);
  assert.doesNotMatch(html, /hub-btn--primary|record-sheet__chips|record-wide__summary/);
  // 시트의 전환 칸은 폭을 나눠 가진다(가로 유지).
  for (const button of modeBarOf(html).match(/<button[^>]*>/g)) assert.match(button, /flex:1 1 0;min-width:0/);
  // 넓은 기록창은 지금 그대로 — 전환 칸은 뿌리의 제자리, head는 없다.
  let wideSlot = null;
  const wide = renderWide({ mode: "memo", memo: (given) => { wideSlot = given; return memoSlot(); } });
  assert.match(wide, /^<div class="record-wide" data-record-mode="memo"><div class="record-wide__mode">/);
  assert.equal(wideSlot.head, null);
  // 시트에서도 메모 칸을 준 호출처만 전환 칸이 선다(연락 기록 모드에서는 흐르는 칸 맨 위).
  const contact = renderSheet({ memo: memoSlot });
  assert.match(contact, /^<div class="record-wide record-sheet"><div class="record-wide__scroll"><div class="record-wide__mode">/);
  assert.doesNotMatch(renderSheet(), /record-wide__mode/);
});

test("좁은 화면의 스타일 — 탭은 900px, 시트는 폼의 배치가 맡는다(600을 다시 재지 않는다), 누르는 곳 44px · 입력 16px", () => {
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  // 이 파일의 미디어 쿼리는 900 하나다 — 시트 규칙(.record-sheet)은 드로어가 고른 배치에만 붙는다.
  assert.deepEqual([...css.matchAll(/@media \(([^)]+)\)/g)].map((m) => m[1]), ["max-width: 900px"]);
  const narrow = css.slice(css.indexOf("@media (max-width: 900px)"));
  // 한 번에 한 칸 — 쓰기 탭에서는 읽기 칸이, '이 고객' 탭에서는 기록 칸(돌아가기 줄만 남기고)이 비킨다.
  assert.match(narrow, /\.hub-app \.record-window\[data-tab="write"\] \.record-ctx \{ display: none; \}/);
  assert.match(narrow, /\.hub-app \.record-window\[data-tab="context"\] \.record-window__main \{ flex: none; order: 1; \}/);
  assert.doesNotMatch(css.slice(0, css.indexOf("@media (max-width: 900px)")), /\[data-tab=/, "넓은 화면은 탭 값을 읽지 않는다 — 두 칸이 늘 나란히 선다");
  // 칩 줄 · 돌아가기 줄 · 약속 한 줄은 선 하나로 나뉜다. 누르는 줄은 44px.
  assert.match(css, /\.hub-app \.record-sheet__bar \{[^}]*border-top: 1px solid var\(--line-soft\);/);
  assert.match(css, /\.hub-app \.record-wide__away \{[^}]*border-top: 1px solid var\(--line-soft\);/);
  assert.match(css, /\.hub-app \.record-window__peek \{[^}]*min-height: 44px;[^}]*border-bottom: 1px solid var\(--line-soft\);/);
  assert.match(css, /\.hub-app \.record-window__save-slot \{[^}]*min-height: 44px;/);
  // 시트의 흐르는 칸은 바닥이 낮다 — 키보드가 오른 높이에서도 칩 줄이 제자리에 남는다.
  assert.match(css, /\.hub-app \.record-sheet \{ --record-scroll-floor: 8rem; \}/);
  // 긴 글쓰기 칸은 시트에서도 16px · 1.8 · 16px 여백 그대로다 — 시작 줄 수만 다르다(글자 크기를 다시 정하지 않는다).
  const sheetDetail = css.match(/\.hub-app \.record-sheet textarea\.hub-input\.record-wide__detail \{[^}]*\}/)?.[0] || "";
  assert.match(sheetDetail, /^[^{]*\{ --record-detail-min: calc\(6 \* 1\.8em \+ 34px\); \}$/);
  assert.doesNotMatch(css.slice(css.indexOf("/* ── 휴대폰 시트")), /font-size: (?:\d|1[0-1])(?:\.\d+)?px/, "시트에 12px 아래 글자는 없다");
  // 토큰만 · 1px 선만 · raw 시간 없음 · 그림자 · 색 채움 없음(새 규칙 전부).
  const added = css.slice(css.indexOf("/* ── 가려진 기록 칸"));
  assert.doesNotMatch(added, /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(|\d+ms\b|cubic-bezier\(|box-shadow|transition|animation/);
  assert.doesNotMatch(added, /border(?:-(?:top|right|bottom|left))?(?:-width)?: (?:[2-9]|\d{2,})px/);
  assert.doesNotMatch(added, /var\(--(danger|success|warning|info|accent|personal|company)/, "좁은 화면의 새 줄은 색으로 말하지 않는다");
  // 전역 터치 플로어(≤720px: 버튼 44px · 입력 16px)를 시트가 되돌리지 않는다.
  assert.doesNotMatch(added, /min-height: (?:[0-3]?\d|4[0-3])px/);
  assert.doesNotMatch(added, /(?:input|textarea)[^{]*\{[^}]*font-size/, "입력 글자 크기를 다시 정하지 않는다(16px 플로어 그대로)");
});

// ── 2026-09-30 넓은 기록창 ④ — 오늘 연락에서 같은 넓은 창 · 저장하고 다음(Q-CR2 · Q-CR8, 권장 · 화면 확인 뒤 확정) ──

const NEXT = { kind: "next", name: "다음 사람" };
// 오늘 연락이 여는 폼 — 토스트 되돌리기 계약 위에 다음 멈출 곳과 '이전' 줄(onQueued)이 있다.
const queuedProps = (props = {}) => ({ undoMode: "toast", next: NEXT, onQueued() {}, onAdvance() {}, ...props });
const ghostsOf = (html) => html.match(/<button[^>]*hub-btn--ghost[^>]*>.*?<\/button>/gs) || [];

test("버튼 글자는 진입점이 정한다 — 오늘 연락에서 연 넓은 기록창만 '저장하고 다음 ⌘↵' + 보조 '저장만'", () => {
  const html = renderWide(queuedProps());
  const band = html.slice(html.indexOf('class="record-wide__save"'));
  // 주 버튼은 하나다 — '저장만'은 보조(ghost)이고 주 버튼 앞에 선다.
  assert.equal(primariesOf(html).length, 1);
  assert.match(primariesOf(html)[0], />저장하고 다음<kbd[^>]*>⌘↵<\/kbd><\/button>$/);
  assert.doesNotMatch(primariesOf(html)[0], /disabled/);
  assert.equal(ghostsOf(band).length, 1);
  assert.match(ghostsOf(band)[0], />저장만<\/button>$/);
  assert.ok(band.indexOf(">저장만<") < band.indexOf(">저장하고 다음<"));
  // 저장 줄은 버튼이 어디로 데려가는지 말한다 — 초안이 놓인 곳의 말 뒤에.
  assert.match(band, /닫아도 이 탭에 초안으로 남아요 · 저장하면 다음 · 다음 사람/);

  // 다른 진입점 — 다음이 없거나(마지막 사람 · 직접 고른 고객), 토스트 되돌리기가 아니거나(고객 드로어),
  // '이전' 줄이 없으면(onQueued 없음) 언제나 '저장' 하나다.
  for (const props of [queuedProps({ next: null }), queuedProps({ undoMode: "inline" }), queuedProps({ onQueued: undefined }), {}]) {
    const plain = renderWide(props);
    assert.match(primariesOf(plain)[0], />저장<kbd[^>]*>⌘↵<\/kbd><\/button>$/);
    assert.doesNotMatch(plain, /저장하고 다음|저장만|저장하면 다음/);
  }
  // 좁은 시트(거래 독 · 첫 화면)는 다음을 받아도 지금 그대로다.
  const compact = withWindow(tabStorage(), () => renderForm(queuedProps()));
  assert.match(primariesOf(compact)[0], />저장<kbd/);
  assert.doesNotMatch(compact, /저장하고 다음|저장만/);
  assert.match(source, /const queued = wide && undoMode === "toast" && Boolean\(next\) && typeof onQueued === "function";/);

  // 저장하지 못한 기록이 남아 있으면 버튼이 데려갈 곳은 그 사람이다 — 저장 줄이 그렇게 말한다.
  const returning = renderWide(queuedProps({ next: { kind: "return", name: "앞 사람" } }));
  assert.match(returning, /저장하면 저장 못 한 기록으로 돌아가요 · 앞 사람/);
  assert.match(primariesOf(returning)[0], />저장하고 다음</);

  // 일부 저장 뒤에는 긴 글만 다시 보낸다 — 넘어가지 않으므로 '다음'도 '저장만'도 없다.
  const held = { activityId: "act-1", optimisticId: "local-1", summary: "단원평가 채점 상담", body: "[결정사항]" };
  const partial = withWindow(tabStorage({ "crm-record:lead:lead-1:rawnote": JSON.stringify(held) }), () => renderForm({ layout: "wide", ...queuedProps() }));
  assert.match(primariesOf(partial)[0], />자세히 다시 저장<\/button>$/);
  assert.doesNotMatch(partial, />저장만</);
});

test("휴대폰 시트 — 머리의 주 버튼이 '저장하고 다음'이고, '저장만'은 호출처가 준 자리에만 선다", () => {
  // 자리를 주지 않은 시트 — 주 버튼은 제자리(⌘↵ 글자 없음), 보조 버튼은 없다(키보드 위의 쉬는 줄을 세우지 않는다).
  const inline = renderSheet(queuedProps());
  assert.equal(primariesOf(inline).length, 1);
  assert.match(primariesOf(inline)[0], />저장하고 다음<\/button>$/);
  assert.doesNotMatch(inline, />저장만</);
  // 머리 자리 · 보조 자리를 받기로 했고 아직 서지 않았다(null) — 둘 다 제자리에 그리지 않는다(번쩍임 없음).
  const waiting = renderSheet(queuedProps({ saveSlot: null, statusSlot: null, secondarySlot: null }));
  assert.equal(primariesOf(waiting).length, 0);
  assert.doesNotMatch(waiting, />저장만</);
  assert.doesNotMatch(waiting, /record-sheet__line/, "쉬는 동안 키보드 위는 칩 줄 하나다");
  assert.equal(chipsOf(waiting).length, 2);
  // 보조 버튼은 주 버튼과 같은 규칙(RecordPrimarySlot)으로 자리에 선다 — 뿌리의 제자리에서 그린다.
  assert.match(source, /<RecordPrimarySlot slot=\{sheet \? secondarySlot : undefined\}>/);
  assert.match(source, /\{primaryInHead && savePrimary\}\s*\{sheet && saveSecondary\}/);
  assert.match(source, /const saveSecondary = buttons\.secondary && \(!sheet \|\| secondarySlot !== undefined\) && \(/);
});

test("저장하고 다음은 같은 3.5초 되돌리기 창이다 — 토스트 대신 '이전' 줄에 넘기고, 받아들여진 저장만 넘어간다", () => {
  const save = source.slice(source.indexOf("const save = ("), source.indexOf("const showMissing"));
  // 주 버튼 · ⌘↵는 넘어가고('저장하고 다음'일 때만), 보조 버튼은 넘어가지 않는다.
  assert.match(source, /const primaryAction = \(\) => \{\s*if \(!armed\(\)\) return;\s*if \(pendingRawNote\) retryRawNote\(\);\s*else save\(\{ ignoreWarning: state === "warn", advance: queued \}\);\s*\};/);
  assert.match(source, /onClick=\{\(\) => \{ if \(armed\(\)\) save\(\{ ignoreWarning: state === "warn" \}\); \}\}>\{buttons\.secondary\}<\/Button>/);
  // 넘어와 선 폼은 선 직후의 저장을 받지 않는다(recordSaveArmed — contact-record.test.mjs가 시간 경계를 돌려 본다):
  // 앞 사람을 저장한 더블 클릭의 둘째 클릭이 같은 자리에 선 이 폼의 주 버튼 · 보조 버튼을 누르지 않게.
  assert.match(source, /const \[openedAt\] = React\.useState\(\(\) => Date\.now\(\)\);/);
  assert.match(source, /const armed = \(\) => recordSaveArmed\(\{ handoff, openedAt, now: Date\.now\(\) \}\);/);
  // 저장을 부르는 길은 셋뿐이고(주 버튼 · ⌘↵ → primaryAction, 보조 버튼) 둘 다 그 문을 지난다.
  assert.equal((source.match(/(?<![.\w])save\(\{/g) || []).length, 2);
  const branch = save.slice(save.indexOf('if (undoMode === "toast" && advance && queued) {'), save.indexOf('if (undoMode === "toast") {'));
  assert.ok(branch.length > 0);
  // 같은 지연 저장(scheduleDetached · UNDO_WINDOW_MS)이고, 되돌리기는 같은 취소(cancelDetached)다.
  assert.match(branch, /scheduleDetached\(key, \(\) => \{ persist\(payload, \{ \.\.\.snapshot, queued: true \}\); \}\);/);
  assert.match(branch, /undo: \(\) => \{\s*if \(!cancelDetached\(key\)\) return false;\s*onUndone\?\.\(optimisticId, target\);\s*writeDraft\(target, snapshot\.form, draftScope\);\s*return true;\s*\},/);
  // 토스트를 띄우지 않는다(다음 사람의 저장 줄을 가린다) — 진행과 되돌리기는 호출처의 '이전' 줄이 든다.
  assert.doesNotMatch(branch.replace(/\/\/[^\n]*/g, ""), /toast\(/);
  assert.match(branch, /onQueued\(\{\s*optimisticId,\s*startedAt: Date\.now\(\),/);
  // 넘어가는 것은 저장이 받아들여진 뒤다 — 폼을 비우고(두 번 저장되지 않게) 그다음에 넘긴다.
  assert.match(branch, /reset\(\);\s*onAdvance\?\.\(\);\s*return;/);
  assert.ok(branch.indexOf("onQueued(") < branch.indexOf("onAdvance?.()"));
  // 막힌 저장(빠진 칸 · 빈 약속 경고)은 넘어가지 않는다 — 넘기기는 검증 · 경고 뒤에만 있다.
  assert.equal((save.match(/onAdvance\?\.\(\)/g) || []).length, 1);
  assert.ok(save.indexOf("onAdvance?.()") > save.indexOf("if ((promiseEmpty || check.warn) && !ignoreWarning) {"));
  assert.ok(save.indexOf("onAdvance?.()") > save.indexOf("if (!check.ok) {"));
  // '저장만'은 지금의 토스트 되돌리기 그대로다(창을 닫는다) — 그 길은 바뀌지 않았다.
  const toastMode = source.slice(source.indexOf('if (undoMode === "toast") {'), source.indexOf("reset();\n    scheduleUndoable("));
  assert.match(toastMode, /scheduleDetached\(key, \(\) => \{ persist\(payload, snapshot\); \}\);/);
  assert.match(toastMode, /reset\(\);\s*onDone\?\.\(\);\s*return;/);
  // 주석은 빼고 — 서버가 답하기 전에 끝난 말을 하지 않는다.
  assert.doesNotMatch(branch.replace(/\/\/[^\n]*/g, ""), /저장됨|기록됨|완료/);
});

test("늦은 실패는 쓰던 글을 그 고객의 초안으로도 남긴다 — 창이 이미 다음 사람으로 넘어갔어도 잃지 않는다", () => {
  const fail = source.slice(source.indexOf("const fail = (snapshot, message) => {"), source.indexOf("// advance: '저장하고 다음'으로 눌렀는가"));
  assert.ok(fail.length > 0);
  assert.match(fail, /onUndone\?\.\(snapshot\.optimisticId, target\);[\s\S]*?writeDraft\(target, snapshot\.form, draftScope\);\s*restore\(snapshot\);/);
  assert.match(fail, /onFailed\?\.\(\{ optimisticId: snapshot\.optimisticId, message, form: snapshot\.form, target \}\);/);
  // '저장하고 다음'으로 보낸 기록의 일부 저장은 '이전' 줄이 말한다 — 폼이 토스트를 겹치지 않는다(그 밖은 지금 그대로).
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  assert.match(persist, /if \(undoMode === "toast" && !snapshot\.queued\) toast\.error\(RAW_NOTE_ERROR_REOPEN\);/);
  assert.ok(persist.indexOf("onPartial?.(") < persist.indexOf("!snapshot.queued"));
  // 실제 연락 시각을 남기지 못했다는 말도 같다 — '저장하고 다음'으로 보낸 기록은 '이전' 줄에 덧말로 달고(onNotice가
  // 보였다고 답하면), 그 줄이 이미 없을 때만 토스트다. 그 밖의 기록은 지금처럼 토스트다.
  const annotate = source.slice(source.indexOf("const annotate = (activityId, snapshot) => {"), source.indexOf("const persist = async"));
  assert.match(annotate, /const missed = \(\) => \{\s*if \(!body\.occurredAt\) return;\s*if \(snapshot\.queued && onNotice\?\.\(\{ optimisticId: snapshot\.optimisticId, note: "[^"]+" \}, target\) === true\) return;\s*toast\.error\("기록은 저장됐지만 실제 연락 시각을 남기지 못했어요 — 저장한 시각으로 남아요\."\);\s*\};/);
  assert.equal((annotate.match(/toast\.error\(/g) || []).length, 1, "토스트는 그 한 길뿐이다");
  assert.match(annotate, /\.then\(\(d\) => \{ if \(d\?\.status !== "saved"\) missed\(\); \}\)\s*\.catch\(missed\);/);
});

// 화면 폭을 세운다 — 껍데기가 듣는 미디어 쿼리(max-width)에 그 폭으로 답한다.
function withScreen(width, run) {
  const had = Object.hasOwn(globalThis, "window");
  const before = globalThis.window;
  globalThis.window = {
    sessionStorage: tabStorage(),
    matchMedia: (query) => ({ matches: width <= Number(/max-width: (\d+)px/.exec(query)?.[1] ?? -1), addEventListener() {}, removeEventListener() {} }),
  };
  try { return run(); } finally {
    if (had) globalThis.window = before;
    else delete globalThis.window;
  }
}
const stripSvg = (html) => html.replace(/<svg.*?<\/svg>/gs, "");
const probe = (t) => React.createElement("aside", { className: "ctx-probe" }, `읽기 칸 · ${t.name}`);
const renderDrawer = (props = {}, width = 1280) => withScreen(width, () => stripSvg(renderToStaticMarkup(React.createElement(ContactRecordDrawer, {
  target: { kind: "lead", id: "lead-1", name: "기록 대상", org: "시험 학원" }, preset: { kind: "call" }, undoMode: "toast", onClose() {}, ...props,
}))));
const asideOf = (html) => tagOf(html, /<aside role="dialog"[^>]*>/);

test("읽기 칸을 주지 않은 껍데기는 지금의 작은 창 그대로다 — 거래 독 · 첫 화면 · 에이전트", () => {
  // 다음 사람을 받아도(잘못 넘겨도) 작은 창은 넓어지지 않고 '저장' 하나다.
  for (const width of [1280, 390]) {
    const html = renderDrawer({ next: { name: "다음 사람" }, onAdvance() {} }, width);
    assert.match(asideOf(html), /data-presentation="compact"/);
    assert.match(asideOf(html), /--hub-compact-width:min\(520px, 96vw\)/);
    assert.doesNotMatch(asideOf(html), /data-sheet=/);
    assert.doesNotMatch(html, /record-window|record-wide|ctx-probe|저장하고 다음|저장만/);
    assert.match(html, />무슨 얘기</);
    assert.match(primariesOf(html)[0], />저장<kbd/);
  }
});

test("오늘 연락의 껍데기는 같은 넓은 기록창이다 — 같은 Drawer, 폭만 바뀐다(쓰기 | 읽기 칸)", () => {
  const html = renderDrawer({ context: probe, next: { name: "다음 사람" }, entry: {}, onAdvance() {} });
  // 옆 드로어 · 960px(Q-CR3) — 새 presentation도 새 라우트도 없다(Q-CR1).
  assert.match(asideOf(html), /data-presentation="side"/);
  assert.ok(asideOf(html).includes(`width:${RECORD_DRAWER_WIDTH.wide}`));
  assert.equal((html.match(/role="dialog"/g) || []).length, 1, "오버레이는 하나다");
  // 본문은 칸마다 따로 흐른다 — 쓰기 칸(넓은 배치의 폼)과 호출처가 세운 읽기 칸.
  assert.match(html, /<div class="hub-drawer__body scroll-y" style="flex:1;padding:0;display:flex;flex-direction:column;gap:0;overflow:hidden">/);
  assert.match(html, /<div class="record-window" data-layout="wide" data-tab="write"><section class="record-window__main" aria-label="기록 쓰기"><div class="record-wide">/);
  assert.match(html, /<\/section><aside class="ctx-probe">읽기 칸 · 기록 대상<\/aside><\/div>/);
  assert.match(html, />요약 · 한 줄</);
  assert.match(html, />자세히</);
  assert.doesNotMatch(html, />무슨 얘기<|>원문 붙여넣기</);
  // 넓은 화면에는 탭 · 머리 저장 자리가 없다.
  assert.doesNotMatch(html, /record-window__tabs|record-window__save-slot|record-window__peek/);
  // 저장하고 다음 — 머리 아래 줄이 다음 사람을 말하고, 주 버튼은 하나다.
  assert.match(html, /<div class="record-window__strip" role="group"[^>]*><span class="record-window__strip-next">다음 <b>다음 사람<\/b><\/span><\/div>/);
  assert.equal(primariesOf(html).length, 1);
  assert.match(primariesOf(html)[0], />저장하고 다음<kbd/);
  assert.match(html, />저장만<\/button>/);
  // 오늘 연락에서 곧바로 열었다 — '고객 정보로' 발판이 없다.
  assert.doesNotMatch(html, /고객 정보로|hub-drawer__footer/);
  // 연락 기록 | 메모 전환은 이 창에 없다(메모 칸을 주지 않았다) — '메모만' 채널이 그대로 남는다.
  assert.doesNotMatch(html, /record-wide__mode/);
  assert.match(html, />메모만</);

  // 마지막 사람(다음 없음) — 줄을 두지 않고 '저장' 하나다(저장하면 닫힌다).
  const last = renderDrawer({ context: probe, next: null, entry: {}, onAdvance() {} });
  assert.doesNotMatch(last, /record-window__strip|저장하고 다음|저장만/);
  assert.match(primariesOf(last)[0], />저장<kbd/);
  // 이어 쓰기는 토스트 되돌리기 계약 위에만 선다 — 그 밖의 호출처에는 '다음'이 없다.
  const inline = renderDrawer({ context: probe, next: { name: "다음 사람" }, undoMode: "inline" });
  assert.doesNotMatch(inline, /record-window__strip|저장하고 다음/);
});

test("넓은 껍데기의 좁은 화면 — 900px 이하는 '쓰기 | 이 고객' 탭, 600px 이하는 전체 높이 시트(저장은 머리에)", () => {
  const late = { state: "dated", what: "OMR 시안 링크 보내기", late: 3, dateLabel: "9/27", whenLabel: "3일 지남" };
  const props = { context: probe, promiseFor: () => late, next: { name: "다음 사람" }, entry: {}, onAdvance() {} };
  const tablet = renderDrawer(props, 800);
  assert.match(asideOf(tablet), /data-presentation="side"/);
  assert.match(tablet, /<div class="record-window" data-layout="tabs" data-tab="write"><div class="record-window__tabs">/);
  assert.match(tablet, /aria-label="보기"[^>]*><button[^>]*aria-pressed="true"[^>]*>쓰기<\/button><button[^>]*aria-pressed="false"[^>]*>이 고객<\/button>/);
  // 쓰기 탭 맨 위의 약속 한 줄 — 날짜가 무엇보다 앞에 서고, 놓친 약속은 글자 한 곳만 위급 색이다.
  assert.match(tablet, /<button type="button" class="hub-row record-window__peek"><span class="record-window__peek-text"><b>약속<\/b><span class="record-ctx__late">3일 지남<\/span> · <span class="mono">9\/27<\/span> OMR 시안 링크 보내기<\/span>/);
  assert.match(tablet, />저장만<\/button>/, "탭 배치는 넓은 폼이다 — 보조 버튼이 저장 줄에 선다");
  // 약속을 모르는 고객(목록 밖)은 한 줄을 두지 않는다 — 없는 약속을 지어내지 않는다.
  assert.doesNotMatch(renderDrawer({ ...props, promiseFor: () => null }, 800), /record-window__peek/);
  assert.doesNotMatch(renderDrawer({ ...props, promiseFor: null }, 800), /record-window__peek/);

  const phone = renderDrawer(props, 390);
  // 같은 바닥 시트가 전체 높이로 선다(Q-CR11) — 저장 자리와 초안 자리가 머리에.
  assert.match(asideOf(phone), /data-presentation="compact"/);
  assert.match(asideOf(phone), /data-sheet="full"/);
  assert.ok(asideOf(phone).includes(`--hub-compact-width:${RECORD_DRAWER_WIDTH.rest}`));
  assert.match(phone, /<div class="hub-drawer__action"[^>]*><span class="record-window__save-slot"><\/span><\/div>/);
  assert.match(phone, /<span class="record-window__sub"><span class="record-window__sub-who">기록 대상 · 시험 학원 · 통화<\/span><span class="record-window__status-slot"><\/span><\/span>/);
  assert.match(phone, /<div class="record-window" data-layout="sheet" data-tab="write">/);
  assert.match(phone, /<div class="record-wide record-sheet">/);
  // 주 버튼은 머리 자리의 것이다(자리가 서기 전이라 아직 없다) — '저장만'의 자리는 머리 아래 줄의 끝이다.
  assert.equal(primariesOf(phone).length, 0);
  assert.match(phone, /<span class="record-window__strip-next">다음 <b>다음 사람<\/b><\/span><span class="record-window__strip-slot"><\/span><\/div>/);
  // 휴대폰의 줄은 한 줄이다(compact) — 누르는 곳이 44px인 화면이라는 것도 같이 알린다(touch).
  assert.match(phone, /<div class="record-window__strip" data-layout="sheet" data-touch="true" role="group"/);
  assert.doesNotMatch(phone, /record-sheet__line/);
  // 넓은 화면에서는 보조 버튼의 자리가 줄에 없다(저장 줄에 선다).
  assert.doesNotMatch(renderDrawer(props), /record-window__strip-slot/);
});

test("고객을 고르는 동안은 좁게, 쓰는 동안만 넓게 — 대상 없는 창도 같은 Drawer다", async () => {
  const searchTargets = async () => ({ status: "live", targets: [] });
  const picking = renderDrawer({ target: null, preset: {}, context: probe, searchTargets, suggestions: [{ kind: "lead", id: "s-1", name: "오늘 챙길 사람" }] });
  assert.match(asideOf(picking), /data-presentation="side"/);
  assert.ok(asideOf(picking).includes(`width:${RECORD_DRAWER_WIDTH.rest}`));
  assert.match(picking, /누구와 연락했나요\?/);
  assert.match(picking, /placeholder="이름·학원 검색"/);
  assert.match(picking, />오늘 챙길 사람</);
  // 고르기 전에는 기록 칸도 읽기 칸도 줄도 없다 — 읽기 칸은 고른 고객을 받아야 선다.
  assert.doesNotMatch(picking, /record-window|ctx-probe|record-wide/);
  // 휴대폰에서 고르는 동안은 지금의 바닥 시트다(전체 높이가 아니다 — 글쓰기 칸이 없다).
  const phone = renderDrawer({ target: null, preset: {}, context: probe, searchTargets }, 390);
  assert.match(asideOf(phone), /data-presentation="compact"/);
  assert.doesNotMatch(asideOf(phone), /data-sheet=/);
  // 대상도 고르기도 없으면 열리지 않는다(지금 그대로).
  assert.equal(renderDrawer({ target: null, context: probe }), "");
  // 직접 고른 고객은 쓰기 칸 맨 위에 누구인지와 바꿀 길이 선다.
  const shell = source.slice(source.indexOf("// ── 넓은 기록창 ──"));
  assert.match(shell, /\{pickedWho && tab === "write" && \(\s*<div className="record-window__picked">/);
  assert.match(shell, /<Button variant="ghost" size="xs" onClick=\{\(\) => setPicked\(null\)\}>다른 고객<\/Button>/);
});

test("껍데기는 앞 사람의 저장을 '이전' 줄에 얹고, 줄이 이미 말한 사건을 호출처에 알린다(shown)", () => {
  const shell = source.slice(source.indexOf("// ── 넓은 기록창 ──"));
  // 사건은 순수 규칙(applyTrailEvent)으로 얹는다 — 줄에 없는 기록 · 닫힌 창의 사건은 보인 것이 아니다.
  assert.match(shell, /const track = \(event\) => \{\s*const shown = mountedRef\.current && trailTracks\(trailRef\.current, event\.id\);\s*if \(shown\) commitTrail\(\(prev\) => applyTrailEvent\(prev, event\)\);\s*return shown;\s*\};/);
  // 줄의 정본은 ref다 — 저장을 누른 바로 그 박자에 창이 닫혀도 방금 줄에 선 기록이 넘겨받기에서 빠지지 않는다.
  assert.match(source, /const commitTrail = \(change\) => \{\s*const before = trailRef\.current;\s*const after = change\(before\);\s*if \(after === before\) return;\s*trailRef\.current = after;\s*setTrail\(after\);\s*\};/);
  assert.equal((source.match(/setTrail\(/g) || []).length, 1, "줄은 commitTrail로만 바꾼다");
  assert.doesNotMatch(source, /trailRef\.current = trail;/);
  // 자리(targetKey)는 그 기록의 것이다 — 고객, 그리고 호출처가 초안 자리를 나눴으면(기록 후보) 그 기록.
  assert.match(shell, /commitTrail\(\(prev\) => applyTrailEvent\(prev, \{ type: "queued", id: optimisticId, name: t\?\.name, target: t, targetKey: recordSlotKey\(t, draftScope\), scoped: Boolean\(draftScope\), entry, startedAt, undo \}\)\);/);
  assert.match(source, /const recordSlotKey = \(target, scope = ""\) => \(target\?\.id && scope \? `\$\{targetKeyOf\(target\)\}\|\$\{scope\}` : targetKeyOf\(target\)\);/);
  assert.match(source, /const targetKey = recordSlotKey\(effectiveTarget, draftScope\);/);
  // 저장 뒤의 덧말 — 그 기록의 줄이 아직 있으면 거기에 달고, 보였는지를 폼에 돌려준다(없으면 폼이 토스트로 말한다).
  assert.match(shell, /onNotice=\{\(\{ optimisticId, note \}\) => track\(\{ type: "noted", id: optimisticId, note \}\)\}/);
  // 넘어와(다음 · 돌아가기) 선 폼 — 같은 손짓의 남은 절반을 저장으로 받지 않는다. 처음 연 창(seq 0)은 아니다.
  assert.match(shell, /handoff=\{seen\.seq > 0\}\s*draftScope=\{draftScope\}/);
  assert.match(shell, /onSending=\{\(ids, t\) => \{ track\(\{ type: "sending", id: ids\?\.optimisticId \}\); onSending\?\.\(ids, t\); \}\}/);
  assert.match(shell, /onUndone=\{\(id, t\) => \{ track\(\{ type: "undone", id \}\); onUndone\?\.\(id, t\); \}\}/);
  // "저장됨 hh:mm"은 서버가 답한 뒤에만 — saved 사건은 onPersisted(전부 저장됨)에서만 얹는다.
  assert.equal((shell.match(/type: "saved"/g) || []).length, 1);
  assert.match(shell, /onPersisted=\{\(ids, t\) => onPersisted\?\.\(ids, t, \{ shown: track\(\{ type: "saved", id: ids\?\.optimisticId, at: stamp\(\) \}\) \}\)\}/);
  assert.match(shell, /onFailed=\{\(failure\) => onFailed\?\.\(failure, \{ shown: track\(\{ type: "failed", id: failure\?\.optimisticId, message: failure\?\.message, form: failure\?\.form \}\) \}\)\}/);
  // 요약만 확인된 단계(onSummaryPersisted)는 줄을 바꾸지 않는다 — 자세히까지 확인돼야 저장됨이다.
  assert.match(shell, /onSummaryPersisted=\{onSummaryPersisted\}/);
  // 저장하고 다음 — 저장 못 한 기록이 있으면 돌아가고, 다음이 있으면 넘기고, 없으면 닫는다.
  // 호출처가 넘길 곳을 찾지 못했으면(false) 이 창이 닫는다 — 호출처가 창을 그냥 걷으면 방금 보낸 기록의 되돌리기가 사라진다.
  assert.match(shell, /const advance = \(\) => \{\s*if \(stop\?\.kind === "return"\) \{ back\(stop\.id\); return; \}\s*const moved = stop\?\.kind === "next" && typeof onAdvance === "function" && onAdvance\(effectiveTarget\) !== false;\s*if \(!moved\) close\(\);\s*\};/);
  // 다음 사람은 지금 쓰는 고객(직접 고른 고객일 수 있다)으로 묻는다 — 줄이 말한 '다음'과 넘어가는 곳이 같은 규칙이다.
  assert.match(shell, /const upcoming = recording \? \(typeof next === "function" \? next\(effectiveTarget\) : next\) : null;/);
  assert.match(shell, /const stop = recording && undoMode === "toast" \? recordNextStop\(\{ next: upcoming, trail, targetKey \}\) : null;/);
  // 돌아가기 — 저장하지 못한 기록은 쓰던 글과 원인을 들고 간다.
  assert.match(shell, /onReturn\?\.\(receipt\.entry, \{\s*target: receipt\.target,\s*\.\.\.\(receipt\.phase === "failed" \? \{ draft: receipt\.form, error: receipt\.message \} : \{\}\),\s*\}\);/);
  // 창이 사라지면 줄도 사라진다 — 아직 되돌릴 수 있는 기록은 남은 시간만큼 토스트로 되돌리기를 이어 준다.
  // 닫기와 언마운트(호출처가 창을 걷었다 · 화면을 떠났다)가 같은 길을 쓰고, 한 기록은 한 번만 넘긴다.
  const handoff = source.slice(source.indexOf("const handTrailOff = () => {"), source.indexOf("const handTrailOffRef"));
  assert.ok(handoff.length > 0);
  assert.match(handoff, /trailHandoff\(trailRef\.current, \{ now: Date\.now\(\), windowMs: UNDO_WINDOW_MS \}\)/);
  assert.match(handoff, /if \(handedRef\.current\.has\(left\.id\)\) continue;\s*handedRef\.current\.add\(left\.id\);/);
  assert.match(handoff, /toast\(`기록 중 · \$\{left\.name\}`, \{\s*id: `contact-\$\{left\.id\}`,\s*duration: left\.remaining,/);
  assert.match(handoff, /onClick: \(\) => \{ if \(left\.undo\(\)\) toast\(/);
  // 쓰던 글이 어디 있는지는 그 기록의 자리로 말한다 — 기록 후보의 기록은 고객의 행이 아니라 그 줄이다.
  assert.match(handoff, /\$\{left\.scoped \? "같은 줄에서" : "같은 고객의"\} 기록창을 다시 열면 쓰던 글이 남아 있어요\./);
  assert.doesNotMatch(handoff.replace(/\/\/[^\n]*/g, ""), /저장됨|기록됨/);
  const close = shell.slice(shell.indexOf("const close = () => {"), shell.indexOf("const back = (id) => {"));
  assert.match(close, /const close = \(\) => \{\s*handTrailOff\(\);\s*onClose\?\.\(\);\s*\};/);
  assert.match(source, /return \(\) => \{\s*mountedRef\.current = false;\s*handTrailOffRef\.current\(\);\s*\};/);
  // 넘겨받기는 어느 분기(좁은 창 · 고르는 중)보다 앞의 훅이다 — 훅 순서가 분기를 타지 않는다.
  assert.ok(source.indexOf("handTrailOffRef.current();") < source.indexOf("if (!windowed) {"));
  // ESC · 오버레이 · 닫기 · 저장만 뒤의 닫기가 모두 같은 길이다(ESC 겹침은 Drawer의 esc-layers 그대로).
  assert.match(shell, /initialFocusRef=\{initialFocusRef\}\s*onClose=\{close\}/);
  assert.match(shell, /onDone=\{close\}/);
  assert.doesNotMatch(shell, /addEventListener\("keydown"/, "껍데기는 ESC를 따로 듣지 않는다");
  // 사람이 바뀌면 폼을 새로 세운다 — 같은 고객의 다음 기록 후보로 넘어가도 새 프리셋으로 열린다.
  assert.match(source, /const formKey = `\$\{seen\.seq\}:\$\{effectiveTarget\?\.kind \|\| "lead"\}:\$\{effectiveTarget\?\.id\}`;/);
  assert.match(source, /if \(seen\.entry !== entry\) \{\s*setSeen\(\{ entry, seq: seen\.seq \+ 1 \}\);\s*setPicked\(null\);\s*setTabChoice\("write"\);\s*\}/);
});

// 머리 아래 줄 — 무엇을 보일지는 순수 규칙(trailItems · recordNextStop)이 정하고 줄은 그리기만 한다.
const trailOf = (...events) => events.reduce((trail, event) => applyTrailEvent(trail, event), []);
const queuedEvent = (id, name) => ({ type: "queued", id, name, target: { kind: "lead", id: `t-${id}`, name }, targetKey: `lead:t-${id}`, startedAt: 0, undo: () => true });
const renderStrip = (trail, props = {}) => stripSvg(renderToStaticMarkup(React.createElement(RecordQueueStrip, { items: trailItems(trail), onUndo() {}, onReturn() {}, ...props })));

test("머리 줄의 진행 — 이전: 이름 · 기록 중(되돌리기) → 저장 중 → 저장됨 hh:mm", () => {
  const pending = renderStrip(trailOf(queuedEvent("a", "앞 사람")));
  assert.match(pending, /<span class="record-window__strip-item" data-phase="pending"><span class="record-window__strip-who">이전 · 앞 사람<\/span><span class="record-receipt" data-receipt="pending" role="status">/);
  // 덧말 없이 '기록 중' + 되돌리기 — 기록 칸의 저장 줄과 같은 모양이다.
  assert.match(pending, /<span>기록 중<\/span><\/span><button/);
  assert.doesNotMatch(pending, /아직 보내지 않았어요/);
  assert.match(pending, />되돌리기<\/button>/);
  assert.doesNotMatch(pending, /저장됨|기록됨|돌아가기/);

  // 보낸 뒤 — 되돌리기가 없다(죽은 버튼을 두지 않는다). 저장 중은 TruthBadge의 syncing 그대로다.
  const sending = renderStrip(trailOf(queuedEvent("a", "앞 사람"), { type: "sending", id: "a" }));
  assert.match(sending, /data-phase="sending"><span class="record-window__strip-who">이전 · 앞 사람<\/span><span data-truth="syncing"[^>]*>저장 중<\/span>/);
  assert.doesNotMatch(sending, /<button|저장됨|기록됨/);

  // 서버가 답했다 — 저장됨 + 그 답을 받은 시각(mono). 초록은 없다.
  const saved = renderStrip(trailOf(queuedEvent("a", "앞 사람"), { type: "sending", id: "a" }, { type: "saved", id: "a", at: "2026-09-30T01:41:00.000Z" }));
  assert.match(saved, /data-phase="saved"><span class="record-window__strip-who">이전 · 앞 사람<\/span><span class="record-receipt" data-receipt="saved" role="status"><span>저장됨 <span class="mono">10:41<\/span><\/span><\/span><\/span>/);
  assert.doesNotMatch(saved, /<button|success/);

  // 줄이 비면 그리지 않는다. 다음 사람만 있으면 그 말만 한다.
  assert.equal(renderStrip([]), "");
  assert.match(renderStrip([], { stop: recordNextStop({ next: { name: "다음 사람" } }) }), /^<div class="record-window__strip"[^>]*><span class="record-window__strip-next">다음 <b>다음 사람<\/b><\/span><\/div>$/);
});

test("머리 줄의 실패 — 저장 못 함은 위급 표식 한 곳과 돌아갈 길, 일부 저장 · 되돌림도 돌아갈 수 있다", () => {
  const failedTrail = trailOf(queuedEvent("a", "앞 사람"), { type: "failed", id: "a", message: "서버에 닿지 않았어요 — 입력을 복원했습니다.", form: { summary: "쓰던 글" } });
  const failed = renderStrip(failedTrail, { stop: recordNextStop({ next: { name: "다음 사람" }, trail: failedTrail, targetKey: "lead:t-b" }) });
  // 1px 레일 + 제목 글자만 위급 색이다(저장 줄의 실패 원인과 같은 표식) — 알림 역할로 읽힌다.
  assert.match(failed, /<span class="record-window__strip-item" data-phase="failed" role="alert" style="padding-left:10px;box-shadow:inset 1px 0 0 var\(--danger\);color:var\(--fg\)">/);
  assert.match(failed, /<span style="display:inline-flex;align-items:center;gap:4px;font-weight:500;color:var\(--danger\)">저장 못 함<\/span><span>쓰던 글은 남아 있어요<\/span>/);
  assert.equal((failed.match(/var\(--danger\)/g) || []).length, 2, "레일 하나 + 제목 하나");
  assert.match(failed, /<button aria-label="앞 사람 기록으로 돌아가기"[^>]*>돌아가기<\/button>/);
  assert.doesNotMatch(failed, /되돌리기/);
  // 실패는 넘어가지 않는다 — 줄이 다음 멈출 곳을 그 사람이라고 말한다.
  assert.match(failed, /<span class="record-window__strip-next">다음 · 저장 못 한 기록 <b>앞 사람<\/b><\/span>/);

  const partialTrail = trailOf(queuedEvent("a", "앞 사람"), { type: "partial", id: "a", at: "2026-09-30T01:41:00.000Z" });
  const partial = renderStrip(partialTrail, { stop: recordNextStop({ next: { name: "다음 사람" }, trail: partialTrail, targetKey: "lead:t-b" }) });
  assert.match(partial, /data-receipt="partial"/);
  assert.match(partial, />일부 저장 <span class="mono">10:41<\/span> · 요약만 저장됐어요 · 긴 글은 아직</);
  assert.match(partial, />돌아가기<\/button>/);
  assert.doesNotMatch(partial, /var\(--danger\)/);
  // 일부 저장도 넘어가지 않는다 — 다만 "저장 못 한 기록"이라고 부르지 않는다(요약은 저장됐다고 같은 줄이 말한다).
  assert.match(partial, /<span class="record-window__strip-next">다음 · 자세히가 남은 기록 <b>앞 사람<\/b><\/span>/);
  assert.doesNotMatch(partial, /저장 못 한 기록|저장 못 함/);

  const undone = renderStrip(trailOf(queuedEvent("a", "앞 사람"), { type: "undone", id: "a" }));
  assert.match(undone, /data-phase="undone" role="status"><span class="record-window__strip-who">이전 · 앞 사람<\/span><span>되돌렸어요 · 쓰던 글은 초안으로 남아 있어요<\/span>/);
  assert.match(undone, />돌아가기<\/button>/);

  // 버튼은 그 줄의 ID로 부른다.
  const calls = [];
  const tree = RecordQueueStrip({ items: trailItems(failedTrail), onUndo: (id) => calls.push(["undo", id]), onReturn: (id) => calls.push(["return", id]) });
  const buttons = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node.props?.onClick) buttons.push(node);
    walk(node.props?.children);
  };
  walk(tree);
  buttons.forEach((button) => button.props.onClick());
  assert.deepEqual(calls, [["return", "a"]]);
});

test("휴대폰의 줄은 한 줄이다 — 앞 사람의 영수증이 '다음' 자리에 서고, '저장만'의 자리는 그 줄의 끝이다", () => {
  const phoneStrip = (trail, props = {}) => renderStrip(trail, { compact: true, touch: true, secondaryRef() {}, ...props });
  const next = { kind: "next", name: "다음 사람" };
  // 앞 사람이 없으면 '다음'과 보조 버튼의 자리.
  assert.match(phoneStrip([], { stop: next }), /^<div class="record-window__strip" data-layout="sheet" data-touch="true"[^>]*><span class="record-window__strip-next">다음 <b>다음 사람<\/b><\/span><span class="record-window__strip-slot"><\/span><\/div>$/);
  // 앞 사람의 영수증이 서면 '다음'은 말하지 않는다 — 한 줄에 영수증 + 버튼 + '저장만'의 자리.
  const pending = phoneStrip(trailOf(queuedEvent("a", "앞 사람")), { stop: next });
  assert.doesNotMatch(pending, /record-window__strip-next/);
  assert.match(pending, /<span class="record-window__strip-item" data-phase="pending" data-lead="true">/);
  assert.ok(pending.indexOf("record-window__strip-item") < pending.indexOf("record-window__strip-slot"));
  assert.match(pending, />되돌리기<\/button><\/span><span class="record-window__strip-slot"><\/span><\/div>$/);
  // 진행이 바뀌어도(기록 중 → 저장 중 → 저장됨) 같은 자리의 한 줄이다.
  for (const event of [{ type: "sending", id: "a" }, { type: "saved", id: "a", at: "2026-09-30T01:41:00.000Z" }]) {
    const html = phoneStrip(trailOf(queuedEvent("a", "앞 사람"), event), { stop: next });
    assert.equal((html.match(/record-window__strip-item/g) || []).length, 1);
    assert.match(html, /data-lead="true"/);
    assert.match(html, /<span class="record-window__strip-slot"><\/span><\/div>$/);
  }
  // 덧말은 뺀다(한 줄에 들어가지 않는다) — 전부는 돌아간 창이 말한다. 돌아갈 길과 위급 표식은 그대로다.
  const failedTrail = trailOf(queuedEvent("a", "앞 사람"), { type: "failed", id: "a", message: "서버에 닿지 않았어요", form: {} });
  const failed = phoneStrip(failedTrail, { stop: recordNextStop({ next, trail: failedTrail, targetKey: "lead:t-b" }) });
  assert.match(failed, />저장 못 함<\/span><button/);
  assert.doesNotMatch(failed, /쓰던 글은 남아 있어요|record-window__strip-next/);
  assert.match(failed, />돌아가기<\/button>/);
  const partial = phoneStrip(trailOf(queuedEvent("a", "앞 사람"), { type: "partial", id: "a", at: "2026-09-30T01:41:00.000Z" }));
  assert.match(partial, />일부 저장 <span class="mono">10:41<\/span><\/span><\/span><button/);
  assert.doesNotMatch(partial, /요약만 저장됐어요/);
  const undone = phoneStrip(trailOf(queuedEvent("a", "앞 사람"), { type: "undone", id: "a" }));
  assert.match(undone, /<span>되돌렸어요<\/span><button/);
  // 풀리지 않은 기록이 둘이면 둘째부터는 자리 뒤(제 줄)에 선다 — 버튼의 자리는 첫 줄 끝 그대로다.
  const two = phoneStrip(trailOf(queuedEvent("a", "앞 사람"), { type: "failed", id: "a", message: "x" }, queuedEvent("b", "그다음 사람")), { stop: next });
  assert.equal((two.match(/data-lead="true"/g) || []).length, 1);
  assert.ok(two.indexOf("그다음 사람") < two.indexOf("record-window__strip-slot"));
  assert.ok(two.indexOf("record-window__strip-slot") < two.indexOf("이전 · 앞 사람"));
  // 넓은 화면(compact 아님)은 '다음'과 영수증이 나란히 선다 — 덧말도 그대로.
  const wide = renderStrip(failedTrail, { stop: next });
  assert.match(wide, /record-window__strip-next/);
  assert.match(wide, /쓰던 글은 남아 있어요/);
  assert.doesNotMatch(wide, /data-layout|data-touch|data-lead/);
  // 껍데기가 화면을 알린다 — 휴대폰(한 줄)과 터치 플로어(44px 줄).
  assert.match(source, /compact=\{mobile\}\s*touch=\{touch\}/);
  assert.match(source, /const touch = useMediaQuery\(windowed \? RECORD_TOUCH_QUERY : ""\);/);
});

test("저장 뒤의 덧말은 그 기록의 줄에 선다 — 기록은 저장됐으므로 위급 색이 아니다", () => {
  const noted = trailOf(queuedEvent("a", "앞 사람"), { type: "saved", id: "a", at: "2026-09-30T01:41:00.000Z" }, { type: "noted", id: "a", note: "실제 연락 시각을 남기지 못했어요 · 저장한 시각으로 남아요" });
  const html = renderStrip(noted);
  assert.match(html, /data-phase="saved" data-noted="true">/);
  assert.match(html, /저장됨 <span class="mono">10:41<\/span><\/span><\/span><span class="record-window__strip-note" role="status">실제 연락 시각을 남기지 못했어요 · 저장한 시각으로 남아요<\/span>/);
  assert.doesNotMatch(html, /var\(--danger\)|role="alert"/);
  assert.doesNotMatch(renderStrip(trailOf(queuedEvent("a", "앞 사람"))), /record-window__strip-note|data-noted/);
});

test("다음 사람은 지금 쓰는 고객으로 묻는다 — 쓰고 있는 사람을 '다음'이라고 부르지 않는다", () => {
  const asked = [];
  // 호출처의 규칙: 지금 쓰는 고객이 줄의 마지막 남은 사람이면 다음이 없다.
  const next = (t) => { asked.push(t?.id); return t?.id === "lead-1" ? null : { name: "다음 사람" }; };
  const last = renderDrawer({ context: probe, next, entry: {}, onAdvance() {} });
  assert.deepEqual(asked, ["lead-1"]);
  assert.doesNotMatch(last, /record-window__strip|저장하고 다음|저장만/);
  assert.match(primariesOf(last)[0], />저장<kbd/);
  // 다른 고객의 창이면 같은 규칙이 다음 사람을 준다.
  const other = renderDrawer({ target: { kind: "lead", id: "lead-2", name: "다른 고객" }, context: probe, next, entry: {}, onAdvance() {} });
  assert.match(other, /<span class="record-window__strip-next">다음 <b>다음 사람<\/b><\/span>/);
  assert.match(primariesOf(other)[0], />저장하고 다음<kbd/);
  // 고르는 동안(쓰는 고객이 아직 없다)은 묻지 않는다.
  asked.length = 0;
  renderDrawer({ target: null, preset: {}, context: probe, next, searchTargets: async () => ({ status: "live", targets: [] }) });
  assert.deepEqual(asked, []);
});

test("이어 쓰기 줄의 스타일 — 자리와 글자만, 토큰 · 1px 선 · 12px 이상", () => {
  const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
  const strip = css.match(/\.hub-app \.record-window__strip \{[^}]*\}/)?.[0] || "";
  assert.match(strip, /flex: none;[^}]*flex-wrap: wrap;[^}]*border-bottom: 1px solid var\(--line-soft\);[^}]*font-size: 12px;/);
  assert.match(css, /\.hub-app \.record-window__strip-slot \{ margin-left: auto;/);
  // 줄의 높이는 저장이 진행돼도 그대로다 — 글자 줄의 높이가 작은 버튼(24px: 되돌리기 · 돌아가기)과 같다.
  assert.match(strip, /line-height: 24px;/);
  assert.match(renderToStaticMarkup(React.createElement(Button, { size: "xs" }, "되돌리기")), /height:24px/);
  assert.doesNotMatch(css.match(/\.hub-app \.record-window__strip-item \{[^}]*\}/)?.[0] || "", /gap: [1-9]\d*px \d/, "접힌 줄 사이에 높이를 더하지 않는다");
  // 누르는 곳이 44px로 서는 화면에서는 글자뿐인 줄도 44px다 — 폭은 드로어가 전역 터치 플로어와 같은 쿼리로 잰다.
  assert.match(css, /\.hub-app \.record-window__strip\[data-touch="true"\] \.record-window__strip-next,\s*\.hub-app \.record-window__strip\[data-touch="true"\] \.record-window__strip-item \{ min-height: 44px; \}/);
  assert.ok(readFileSync(new URL("./hub-tokens.css", import.meta.url), "utf8").includes(`@media ${RECORD_TOUCH_QUERY} {`), "전역 터치 플로어와 같은 쿼리다");
  // 휴대폰 시트는 한 줄 — 이름이 줄고(말줄임) 영수증과 버튼은 잘리지 않는다.
  assert.match(css, /\.hub-app \.record-window__strip\[data-layout="sheet"\] \.record-window__strip-item\[data-lead="true"\] \{ flex: 1 1 0; \}/);
  assert.match(css, /\.hub-app \.record-window__strip\[data-layout="sheet"\] \.record-window__strip-item > \.record-window__strip-who \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.hub-app \.record-window__picked \{[^}]*border-bottom: 1px solid var\(--line-soft\);[^}]*font-size: 12px;/);
  // 좁은 화면에서는 쓰기 칸과 같은 16px 여백으로 맞춘다.
  assert.match(css.slice(css.indexOf("@media (max-width: 900px)")), /\.hub-app \.record-window__strip:not\(\[data-inset\]\),\s*\.hub-app \.record-window__picked \{ padding-inline: 16px; \}/);
  // 고객을 고르는 동안에도 앞 사람의 진행과 되돌리기는 보인다 — 줄이 본문 여백 안에 놓인다(inset).
  assert.match(source, /<>\{strip\}\{picker\}<\/>/);
  assert.match(source, /inset=\{!recording\}/);
  assert.match(renderStrip(trailOf(queuedEvent("a", "앞 사람")), { inset: true }), /^<div class="record-window__strip" data-inset="true"/);
  assert.doesNotMatch(renderStrip(trailOf(queuedEvent("a", "앞 사람"))), /data-inset/);
  // 위급 표식은 줄이 직접(인라인) 그린다 — 이 파일의 빨강은 여전히 읽기 칸의 '지남' 글자 한 곳뿐이다.
  assert.equal((css.match(/var\(--danger\)/g) || []).length, 1);
});

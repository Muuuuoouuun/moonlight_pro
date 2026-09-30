import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ContactRecordForm, RecordSaveLine, recordDraftStore } from "./contact-record-form.jsx";
import { recordSaveLine } from "../../lib/sales-os/contact-record.js";

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
  assert.match(source, /pendingRawNote \? retryRawNote\(\) : save\(\{/);
  // 버튼 글자는 배치의 칸 이름을 따른다 — 좁은 시트는 '원문', 넓은 기록창은 '자세히'(같은 재시도 길).
  assert.match(source, /\{pendingRawNote \? noteCopy\.retry : "저장"\}/);
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
  assert.match(source, /const draftKey = \(target\) => `crm-record:\$\{target\?\.kind \|\| "lead"\}:\$\{target\?\.id \|\| ""\}`;/);
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
  assert.match(save, /clearDraft\(target\);/);
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
  assert.match(source, /const writeDraft = \(target, form\) => \(target\?\.id \? recordDraftStore\.write\(draftKey\(target\), pickDraft\(form\)\) : null\);/);
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
  assert.match(source, /const place = writeDraft\(target, form\);\s*if \(place\) setDraftPlace\(place\);/);
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
  assert.match(source, /if \(untouched\) clearDraft\(target\);\s*else \{\s*const place = writeDraft\(target, form\);/);
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
  // 답이 오면(성공·실패 모두) 진행 글자를 걷고, 성공일 때만 닫는다.
  assert.match(run, /persist\(payload, snapshot\)\.then\(\(ok\) => \{\s*setPendingUndo\(\(cur\) => \(cur\?\.key === key \? null : cur\)\);\s*if \(ok\) onDone\?\.\(\);/);
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
  // 다른 호출처(오늘 연락 · 거래 독 · 첫 화면의 ContactRecordDrawer)는 배치를 넘기지 않는다 — 작은 창 그대로.
  const shell = source.slice(source.indexOf("export function ContactRecordDrawer"));
  assert.doesNotMatch(shell, /layout=/);
  assert.match(source, /undoMode = "inline", layout = "compact", children = null \}\) \{/);
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
  // 높이를 실제로 맞추는 것은 폼의 레이아웃 효과다(값은 순수 detailFieldHeight — contact-record.test.mjs).
  const effect = source.slice(source.indexOf("useLayoutEffectOnClient(() => {"), source.indexOf("// 일부 저장 — 넓은 기록창은 이미 저장된 것"));
  assert.match(effect, /const el = detailRef\.current;\s*if \(!wide \|\| !el\) return;/);
  assert.match(effect, /el\.style\.height = "auto";\s*el\.style\.height = `\$\{detailFieldHeight\(el\)\}px`;/);
  assert.match(effect, /\}, \[wide, form\.body\]\);/);
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
  assert.match(wide, /<div ref=\{rootRef\} className="record-wide" onKeyDown=\{onKeyDown\}>/);
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
  assert.match(wide, /\{children && <div data-record-slot="">\{children\}<\/div>\}/);
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

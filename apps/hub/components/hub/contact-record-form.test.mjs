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
  assert.match(source, /pendingRawNote \? "원문 저장 재시도" : "저장"/);
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
  assert.match(source, /const \[recoveredRawNote\] = React\.useState\(\(\) => rawNoteRecoveries\.get\(rawNoteKey\(target\)\) \|\| null\)/);
  assert.match(source, /const \[pendingRawNote, setPendingRawNote\] = React\.useState\(\(\) => recoveredRawNote/);
  const persist = source.slice(source.indexOf("const persist = async"), source.indexOf("const retryRawNote"));
  assert.ok(persist.indexOf("rawNoteRecoveries.set") < persist.indexOf('fetch("/api/hub/revenue/activity"'));
  assert.match(source, /rawNoteRecoveries\.delete\(rawNoteKey\(target\)\)/);
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
  assert.match(source, /if \(e\.key !== "Enter" \|\| !\(e\.metaKey \|\| e\.ctrlKey\) \|\| e\.nativeEvent\?\.isComposing\) return;/);
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

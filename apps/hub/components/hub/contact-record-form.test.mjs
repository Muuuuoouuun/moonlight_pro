import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./contact-record-form.jsx", import.meta.url), "utf8");

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
  for (const call of ["window.sessionStorage.getItem(key)", "window.sessionStorage.setItem(key", "window.sessionStorage.removeItem(key)"]) {
    const at = source.indexOf(call);
    assert.ok(at > 0, call);
    assert.ok(source.lastIndexOf("try {", at) > source.lastIndexOf("}", source.lastIndexOf("try {", at) - 1) - 200, `${call} sits in a try`);
  }
  const save = source.slice(source.indexOf("const save = ("), source.indexOf("const showMissing"));
  assert.match(save, /clearDraft\(target\);/);
  // 저장한 입력이 되살아나 두 번 저장되지 않게 — 토스트 모드도 폼을 프리셋으로 되돌린 뒤 닫는다.
  assert.match(save, /reset\(\);\s*onDone\?\.\(\);\s*return;/);
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

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

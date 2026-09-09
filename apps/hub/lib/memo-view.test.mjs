import assert from "node:assert/strict";
import { test } from "node:test";
import { selectMemos, linksForMemo, memoLinkVerified } from "./memo-view.js";
const note = {
  id: "same",
  kind: "note",
  title: "회의",
  body: "견적 요청",
  projectId: "p",
};
const capture = {
  id: "same",
  kind: "work_order",
  title: "메모",
  body: "다른 원문",
};
const data = {
  memos: [note, capture],
  links: [{ id: "l", note_id: "same", task_id: "t" }],
  tasks: [{ id: "t", project_id: "p" }],
  linksComplete: true,
};
test("same UUID from distinct memo ledgers never shares links", () => {
  assert.equal(linksForMemo(note, data.links).length, 1);
  assert.equal(linksForMemo(capture, data.links).length, 0);
});
test("search matches original body and project filter uses verified task relation", () => {
  assert.deepEqual(selectMemos(data, { query: "견적" }), [note]);
  assert.deepEqual(selectMemos(data, { projectId: "p" }), [note]);
  assert.deepEqual(selectMemos(data, { filter: "unlinked" }), [capture]);
});
test("incomplete relation reads cannot assert that a memo is unlinked", () => {
  assert.deepEqual(
    selectMemos({ ...data, linksComplete: false }, { filter: "unlinked" }),
    [],
  );
});
test("saved confirmation requires both exact source relation and readable task", () => {
  assert.equal(memoLinkVerified(data, note, "t"), true);
  assert.equal(memoLinkVerified(data, capture, "t"), false);
  assert.equal(memoLinkVerified({ ...data, tasks: [] }, note, "t"), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";

let quickCapture = null;

try {
  quickCapture = await import("./quick-task-capture.js");
} catch {
  // Red phase: the home has no durable one-line task capture contract yet.
}

test("builds task and inbox requests with one reusable idempotency key", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");

  assert.deepEqual(
    quickCapture.buildQuickCapture({
      id: "99999999-9999-4999-8999-999999999999",
      raw: "  고객 후속 일정 확인  ",
      hint: "task",
    }),
    {
      ok: true,
      payload: {
        raw: "고객 후속 일정 확인",
        hint: "task",
        idempotencyKey: "99999999-9999-4999-8999-999999999999",
      },
    },
  );
  assert.equal(quickCapture.buildQuickCapture({ id: "id", raw: "메모", hint: "inbox" }).payload.hint, "inbox");
});

test("rejects empty capture without changing durable state", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");
  assert.deepEqual(quickCapture.buildQuickCapture({ id: "id", raw: "   ", hint: "task" }), {
    ok: false,
    reason: "empty-capture",
  });
});

test("clears input only after a durable saved or duplicate receipt response", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "saved" }), true);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "duplicate" }), true);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "conflict" }), false);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "preview" }), false);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "error" }), false);
});

test("capture session retains draft, destination and retry identity when a form leaves", () => {
  let sequence = 0;
  const session = quickCapture.createQuickCaptureSession({ createId: () => `request-${++sequence}` });
  session.setRaw('다음 연락 확인'); session.setHint('inbox');
  const unsubscribe = session.subscribe(() => {});
  unsubscribe();
  assert.equal(session.canClose(), true);
  assert.deepEqual(session.begin().payload, { raw: '다음 연락 확인', hint: 'inbox', idempotencyKey: 'request-1' });
  assert.equal(session.canClose(), false);
  assert.equal(session.begin().reason, 'saving');
  session.setRaw('저장 중 바꾸기'); session.setHint('task');
  session.settle({ ok: false, error: 'connection-lost' });
  assert.equal(session.canClose(), true);
  assert.equal(session.snapshot().raw, '다음 연락 확인');
  assert.equal(session.snapshot().hint, 'inbox');
  assert.equal(session.begin().payload.idempotencyKey, 'request-1');
});

test("only durable capture acknowledgement clears the draft and advances its identity", () => {
  let sequence = 0;
  const session = quickCapture.createQuickCaptureSession({ createId: () => `request-${++sequence}` });
  session.setRaw('연속 입력'); session.setHint('inbox');
  session.begin(); session.settle({ ok: true, data: { status: 'preview' } });
  assert.equal(session.snapshot().raw, '연속 입력');
  assert.equal(session.begin().payload.idempotencyKey, 'request-1');
  assert.equal(session.settle({ ok: true, data: { status: 'duplicate', destinationType: 'work_order' } }), true);
  assert.equal(session.snapshot().raw, ''); assert.equal(session.snapshot().hint, 'inbox');
  assert.equal(session.snapshot().status, 'saved'); assert.equal(session.canClose(), true);
  session.setRaw('다음 항목');
  assert.equal(session.begin().payload.idempotencyKey, 'request-2');
});

test("changing failed input starts a distinct capture while same-input retry stays stable", () => {
  let sequence = 0, notifications = 0;
  const session = quickCapture.createQuickCaptureSession({ createId: () => `request-${++sequence}` });
  const unsubscribe = session.subscribe(() => { notifications++; });
  session.setRaw('기존 입력'); session.begin(); session.settle({ ok: false, error: 'rejected' });
  session.setRaw('수정 입력');
  assert.equal(sequence, 1, 'editing alone must not discard the previous request identity');
  assert.equal(session.begin().payload.idempotencyKey, 'request-2');
  session.settle({ ok: false, error: 'connection-lost' });
  assert.equal(session.begin().payload.idempotencyKey, 'request-2');
  assert.equal(notifications, 7); unsubscribe();
});

test("ambiguous capture retries keep the last attempt identity after normalized text and destination round trips", () => {
  const edits = [
    session => session.setRaw('  응답 확인  '),
    session => { session.setRaw('수정 중인 내용'); session.setRaw('응답 확인'); },
    session => { session.setHint('inbox'); session.setHint('task'); },
    session => { session.setRaw(''); assert.equal(session.begin().ok, false); session.setRaw('응답 확인'); },
    session => { session.setRaw('수정 중인 내용'); session.setHint('inbox'); session.setRaw(' 응답 확인 '); session.setHint('task'); },
  ];
  for (const edit of edits) {
    let sequence = 0;
    const session = quickCapture.createQuickCaptureSession({ createId: () => `request-${++sequence}` });
    session.setRaw('응답 확인');
    const original = session.begin();
    session.settle({ ok: false, error: 'connection-lost' });
    edit(session);
    assert.deepEqual(session.begin().payload, original.payload);
    assert.equal(sequence, 1, 'an unacknowledged equivalent payload must use its original receipt key');
  }
});

test("a changed destination gets a new identity only at submission and a durable receipt resets the attempt", () => {
  let sequence = 0;
  const session = quickCapture.createQuickCaptureSession({ createId: () => `request-${++sequence}` });
  session.setRaw('후속 확인');
  session.begin(); session.settle({ ok: false, error: 'connection-lost' });
  session.setHint('inbox');
  assert.equal(sequence, 1);
  assert.deepEqual(session.begin().payload, { raw: '후속 확인', hint: 'inbox', idempotencyKey: 'request-2' });
  session.settle({ ok: true, data: { status: 'saved', destinationType: 'work_order' } });
  assert.equal(sequence, 3);
  session.setRaw('후속 확인');
  assert.equal(session.begin().payload.idempotencyKey, 'request-3', 'the same text after confirmed success is a new capture');
});

test("a late task save clears only the exact submitted draft, preserving subsequent typing", () => {
  const submitted = { title: '첫 항목', dueAt: '2026-09-22', priority: 'high' };
  assert.deepEqual(quickCapture.clearSubmittedQuickTaskDraft(submitted, submitted), { title: '', dueAt: '', priority: 'medium' });
  for (const next of [{ ...submitted, title: '두 번째 항목' }, { ...submitted, dueAt: '2026-09-23' }, { ...submitted, priority: 'low' }, { ...submitted }]) {
    assert.equal(quickCapture.clearSubmittedQuickTaskDraft(next, submitted), next);
  }
});

test("quick task Enter waits for IME completion and never repeats a pending submit", () => {
  const enter = { key: 'Enter' };
  assert.equal(quickCapture.shouldSubmitQuickTask(enter), true);
  for (const patch of [{ isComposing: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }, { nativeEvent: { keyCode: 229 } }, { repeat: true }, { defaultPrevented: true }, { key: 'a' }]) {
    assert.equal(quickCapture.shouldSubmitQuickTask({ ...enter, ...patch }), false);
  }
  assert.equal(quickCapture.shouldSubmitQuickTask(enter, true), false);
});

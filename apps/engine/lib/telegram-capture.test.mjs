import assert from "node:assert/strict";
import { test } from "node:test";

const capture = await import("./telegram-capture.ts");

const update = (text, overrides = {}) => ({
  update_id: 4242,
  message: { message_id: 7, text, chat: { id: 111222333, type: "private" } },
  ...overrides,
});

test("plain text from an allowed chat becomes an inbox capture with a deterministic idempotency key", () => {
  const plan = capture.planTelegramCapture(update("  내일 갈무리학원 견적 다시 보내기 "), { TELEGRAM_CAPTURE_CHAT_IDS: "111222333, 999" });
  assert.equal(plan.ok, true);
  assert.equal(plan.raw, "내일 갈무리학원 견적 다시 보내기");
  assert.equal(plan.hint, "inbox");
  assert.equal(plan.chatId, 111222333);
  assert.match(plan.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(plan.idempotencyKey, capture.telegramCaptureIdempotencyKey(4242), "같은 update_id는 같은 키");
  assert.notEqual(plan.idempotencyKey, capture.telegramCaptureIdempotencyKey(4243));
});

test("capture stays off without an allow-list and rejects other chats", () => {
  assert.deepEqual(capture.planTelegramCapture(update("hello"), {}), { ok: false, reason: "capture-disabled" });
  assert.deepEqual(capture.planTelegramCapture(update("hello"), { TELEGRAM_CAPTURE_CHAT_IDS: "555" }), { ok: false, reason: "chat-not-allowed" });
});

test("slash commands, empty text, missing update ids and oversized text are not captures", () => {
  const env = { TELEGRAM_CAPTURE_CHAT_IDS: "111222333" };
  assert.deepEqual(capture.planTelegramCapture(update("/status"), env), { ok: false, reason: "slash-command" });
  assert.deepEqual(capture.planTelegramCapture(update("   "), env), { ok: false, reason: "no-text" });
  assert.deepEqual(capture.planTelegramCapture(update("x", { update_id: undefined }), env), { ok: false, reason: "missing-update-id" });
  assert.deepEqual(capture.planTelegramCapture(update("x".repeat(4001)), env), { ok: false, reason: "too-long" });
});

test("telegramReply is a Bot API method call the webhook response can carry", () => {
  assert.deepEqual(capture.telegramReply(111222333, "저장됨 · 인박스"), { method: "sendMessage", chat_id: 111222333, text: "저장됨 · 인박스" });
  assert.deepEqual([...capture.parseAllowedChatIds(" 1, -100200 300 abc ")], ["1", "-100200", "300"]);
});

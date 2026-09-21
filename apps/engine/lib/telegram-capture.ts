import { createHash } from "crypto";

import { getTelegramMessage, getTelegramText, parseTelegramCommand, type TelegramUpdate } from "./telegram.ts";

// 텔레그램 평문 → 빠른 입력 인박스 (2026-09-20 세 축·Action KPI 기획 §6.1).
//
// 슬래시 명령이 아닌 평문은 그동안 `ignored`로 버려졌다 — 폰에서 오는 캡처 경로가 코드에
// 없었다. 여기서는 (1) 허용된 chat_id에서 온 (2) 슬래시 없는 (3) 4000자 이하 텍스트만
// capture_quick_input_v1(hint='inbox')로 보낼 계획을 만든다. 발신자 허용 목록이 비어 있으면
// 캡처는 꺼져 있다 — 봇 토큰을 아는 누구나 인박스에 글을 넣을 수 있게 두지 않는다.
// 답장은 별도 발신 API가 아니라 웹훅 응답 본문의 sendMessage 메서드로 돌려준다.

export const TELEGRAM_CAPTURE_CHAT_IDS_ENV = "TELEGRAM_CAPTURE_CHAT_IDS";
export const TELEGRAM_CAPTURE_MAX_CHARS = 4000;

export type TelegramCapturePlan =
  | { ok: true; raw: string; chatId: number; idempotencyKey: string; hint: "inbox" }
  | { ok: false; reason: "no-text" | "slash-command" | "capture-disabled" | "chat-not-allowed" | "missing-update-id" | "too-long" };

export function parseAllowedChatIds(value: string | null | undefined): Set<string> {
  return new Set(
    String(value || "")
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter((part) => /^-?\d+$/.test(part)),
  );
}

// update_id → 결정적 UUID(v5 모양). 같은 update가 재전송돼도 capture receipt가 같은 키로
// 중복을 거른다(reserveTelegramUpdate가 먼저 거르지만, 그 예약이 실패해도 두 번 저장되지 않게).
export function telegramCaptureIdempotencyKey(updateId: number): string {
  const hex = createHash("sha1").update(`telegram-capture:${updateId}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function planTelegramCapture(
  update: TelegramUpdate,
  env: Record<string, string | undefined> = process.env,
): TelegramCapturePlan {
  const text = getTelegramText(update);
  if (!text) return { ok: false, reason: "no-text" };
  if (parseTelegramCommand(text)) return { ok: false, reason: "slash-command" };

  const allowed = parseAllowedChatIds(env[TELEGRAM_CAPTURE_CHAT_IDS_ENV]);
  if (!allowed.size) return { ok: false, reason: "capture-disabled" };

  const chatId = getTelegramMessage(update)?.chat?.id;
  if (typeof chatId !== "number" || !allowed.has(String(chatId))) return { ok: false, reason: "chat-not-allowed" };
  if (update.update_id == null) return { ok: false, reason: "missing-update-id" };
  if (text.length > TELEGRAM_CAPTURE_MAX_CHARS) return { ok: false, reason: "too-long" };

  return {
    ok: true,
    raw: text,
    chatId,
    idempotencyKey: telegramCaptureIdempotencyKey(update.update_id),
    hint: "inbox",
  };
}

// Telegram은 웹훅 응답 본문이 Bot API 메서드 호출이면 그대로 실행한다 — 발신 인프라 없이 답장.
export function telegramReply(chatId: number, text: string) {
  return { method: "sendMessage" as const, chat_id: chatId, text };
}

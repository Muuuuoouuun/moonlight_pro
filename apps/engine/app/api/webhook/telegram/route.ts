import { timingSafeEqual } from "crypto";

import { NextResponse, after } from "next/server";

import { logError, logInfo, logWarning } from "@com-moon/hub-gateway";

import type { TelegramUpdate } from "../../../../lib/telegram";
import { runTelegramUpdate } from "../../../../lib/run";

export const runtime = "nodejs";

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

function safeSecretEquals(expected: string, candidate: string) {
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);

  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
}

function isLocalOpenWebhookModeAllowed() {
  return (
    process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS?.trim() === "true" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production"
  );
}

function validateTelegramSecret(req: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!expectedSecret) {
    if (isLocalOpenWebhookModeAllowed()) {
      return { ok: true, mode: "open" };
    }

    return {
      ok: false,
      mode: "header",
      error:
        "TELEGRAM_WEBHOOK_SECRET is not configured. COM_MOON_ALLOW_OPEN_WEBHOOKS=true is local-only and refused in production.",
    };
  }

  const candidate = req.headers.get(TELEGRAM_SECRET_HEADER)?.trim() || "";

  if (!candidate) {
    return {
      ok: false,
      mode: "header",
      error: `Missing ${TELEGRAM_SECRET_HEADER} header.`,
    };
  }

  if (!safeSecretEquals(expectedSecret, candidate)) {
    return {
      ok: false,
      mode: "header",
      error: "Telegram webhook secret did not match.",
    };
  }

  return { ok: true, mode: "header" };
}

async function forwardToN8n(update: TelegramUpdate): Promise<boolean> {
  const n8nUrl = process.env.N8N_WEBHOOK_URL?.trim();

  if (!n8nUrl) {
    return false;
  }

  const response = await fetch(n8nUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook failed with ${response.status}`);
  }

  return true;
}

export async function POST(req: Request) {
  try {
    const auth = validateTelegramSecret(req);
    if (!auth.ok) {
      await logError({
        context: "telegram-webhook-auth",
        payload: {
          error: auth.error,
        },
        trace: "telegram-api",
        timestamp: new Date().toISOString(),
        level: "error",
      });

      return NextResponse.json(
        {
          status: "unauthorized",
          error: auth.error,
        },
        { status: 401 },
      );
    }

    let update: TelegramUpdate;

    try {
      update = await req.json();
    } catch {
      return NextResponse.json(
        {
          status: "invalid-json",
          error: "Request body must be valid JSON.",
        },
        { status: 400 },
      );
    }

    const result = await runTelegramUpdate(update);

    // n8n 포워딩은 응답에 필요 없는 부수 작업인데 ACK 앞에서 await되면 타임아웃(10초)만큼
    // Telegram 재시도를 유발할 수 있다 — after()로 응답 이후에 실행한다(결과는 로그로만 남김).
    after(async () => {
      try {
        const forwarded = await forwardToN8n(update);

        if (forwarded) {
          await logInfo({
            context: "telegram-webhook",
            payload: {
              runId: result.runId,
              updateId: update.update_id ?? null,
              forwardedToN8n: true,
            },
            trace: "telegram-api",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (forwardError) {
        await logWarning({
          context: "telegram-webhook-forward",
          payload: {
            runId: result.runId,
            updateId: update.update_id ?? null,
            error: String(forwardError),
          },
          trace: "telegram-api",
          timestamp: new Date().toISOString(),
        });
      }
    });

    return NextResponse.json({
      status: result.status,
      runId: result.runId,
      command: result.command,
      response: result.response,
      // 포워딩은 응답 이후 실행으로 이동 — 결과는 telegram-webhook-forward 로그에서 확인.
      forwardedToN8n: "deferred",
    });
  } catch (error) {
    await logError({
      context: "telegram-webhook",
      payload: { error: String(error) },
      trace: "telegram-api",
      timestamp: new Date().toISOString(),
      level: "error",
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

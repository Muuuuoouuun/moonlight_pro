import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

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

function validateTelegramSecret(req: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!expectedSecret) {
    if (process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS?.trim() === "true") {
      return { ok: true, mode: "open" };
    }

    return {
      ok: false,
      mode: "header",
      error:
        "TELEGRAM_WEBHOOK_SECRET is not configured. Set COM_MOON_ALLOW_OPEN_WEBHOOKS=true only for local smoke tests.",
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
    let forwardedToN8n = false;

    try {
      forwardedToN8n = await forwardToN8n(update);

      if (forwardedToN8n) {
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

    return NextResponse.json({
      status: result.status,
      runId: result.runId,
      command: result.command,
      response: result.response,
      forwardedToN8n,
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

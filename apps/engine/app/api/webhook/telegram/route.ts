import { NextResponse } from "next/server";

import { logError, logInfo, logWarning } from "@com-moon/hub-gateway";

import type { TelegramUpdate } from "../../../../lib/telegram";
import { runTelegramUpdate } from "../../../../lib/run";

export const runtime = "nodejs";

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
    const update: TelegramUpdate = await req.json();
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

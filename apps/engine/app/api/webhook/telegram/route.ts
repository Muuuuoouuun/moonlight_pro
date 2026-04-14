import { NextResponse } from "next/server";

import { logError } from "@com-moon/hub-gateway";

import { runTelegramUpdate } from "../../../../lib/run";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const update = await req.json();
    const result = await runTelegramUpdate(update);

    return NextResponse.json({
      status: result.status,
      runId: result.runId,
      command: result.command,
      response: result.response,
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

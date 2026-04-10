import { NextResponse } from "next/server";
import { logError } from "@/packages/hub-gateway/logger";

export async function POST(req: Request) {
  try {
    const update = await req.json();
    console.log("[Telegram Hook Received]", update);

    // 1. n8n 웹훅 토스 (실제 자동화 파이프라인)
    // const n8nResponse = await fetch(process.env.N8N_WEBHOOK_URL!, {
    //   method: "POST",
    //   body: JSON.stringify(update),
    // });

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    await logError({
      context: "telegram-webhook",
      payload: { error: String(error) },
      trace: "telegram-api",
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server.js";
import { executePatternAnalysis } from "../../../../lib/pattern-analysis.ts";
import { generateGeminiText } from "../../../../lib/gemini.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PAYLOAD_BYTES = 64 * 1024;

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok || auth.mode === "open") {
    return NextResponse.json({ status: "error", error: "invalid-shared-secret" }, { status: 401 });
  }

  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ status: "invalid-input", error: "payload-too-large" }, { status: 413 });
  }

  let body: any;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ status: "invalid-input", error: "payload-too-large" }, { status: 413 });
    }
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("invalid-json");
    }
  } catch {
    return NextResponse.json({ status: "invalid-input", error: "invalid-json" }, { status: 400 });
  }

  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ status: "preview", error: "missing-workspace" }, { status: 202 });
  }

  try {
    const result = await executePatternAnalysis(
      {
        workspaceId,
        requestId: body.requestId,
        goal: body.goal || "general",
        records: body.records || [],
        question: body.question,
      },
      { generate: generateGeminiText }
    );

    const httpStatus = result.status === "succeeded" ? 200
      : result.status === "invalid-input" ? 400
      : result.status === "preview" ? 202
      : 502;

    return NextResponse.json(result, { status: httpStatus });
  } catch {
    return NextResponse.json({ status: "failed", error: "pattern-analysis-failed" }, { status: 500 });
  }
}

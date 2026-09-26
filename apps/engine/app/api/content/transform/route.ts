import { NextResponse } from "next/server.js";
import { executeContentTransform, MAX_CONTENT_TRANSFORM_BYTES } from "../../../../lib/content-transform.ts";
import { generateGeminiText, getGeminiIntegrationStatus } from "../../../../lib/gemini.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import { fetchSupabaseRowsDetailed, insertSupabaseRecord, updateSupabaseRecord } from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok || auth.mode === "open") return NextResponse.json({ status: "error", error: "invalid-shared-secret", persisted: false }, { status: 401 });
  const declared = Number(req.headers.get("content-length") || "0");
  const tooLarge = () => NextResponse.json({ status: "invalid-input", error: "payload-too-large", persisted: false }, { status: 413 });
  if (Number.isFinite(declared) && declared > MAX_CONTENT_TRANSFORM_BYTES) return tooLarge();
  let body: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_CONTENT_TRANSFORM_BYTES) return tooLarge();
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid-json");
  } catch {
    return NextResponse.json({ status: "invalid-input", error: "invalid-json", persisted: false }, { status: 400 });
  }
  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  if (!workspaceId) return NextResponse.json({ status: "preview", error: "missing-workspace", persisted: false }, { status: 202 });
  try {
    const result = await executeContentTransform(body, { workspaceId, recoverySecret: process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() }, {
      read: fetchSupabaseRowsDetailed, insert: insertSupabaseRecord, update: updateSupabaseRecord,
      generate: (input) => generateGeminiText({ ...input, usageSurface: "content-transform" }), provider: getGeminiIntegrationStatus(),
    });
    const status = ["generated", "duplicate", "unsaved"].includes(result.status) ? 200
      : result.status === "conflict" ? 409 : result.status === "invalid-input" ? 400
        : ["preview", "running", "unknown"].includes(result.status) ? 202 : 502;
    return NextResponse.json(result, { status });
  } catch {
    // The process may have claimed/generated already. A status check reuses the
    // same request ID and never silently starts another billable generation.
    return NextResponse.json({ status: "unknown", error: "transform-outcome-unknown", persisted: false }, { status: 202 });
  }
}

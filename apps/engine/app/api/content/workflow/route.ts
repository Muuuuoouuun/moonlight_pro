import { NextResponse } from "next/server.js";
import { executeContentWorkflow, MAX_CONTENT_WORKFLOW_BYTES } from "../../../../lib/content-workflow.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import { invokeSupabaseRpc } from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok || auth.mode === "open") return NextResponse.json({ status: "unauthorized", error: "invalid-shared-secret" }, { status: 401 });
  const declared = Number(req.headers.get("content-length") || "0");
  const tooLarge = () => NextResponse.json({ status: "invalid-input", error: "payload-too-large" }, { status: 413 });
  if (Number.isFinite(declared) && declared > MAX_CONTENT_WORKFLOW_BYTES) return tooLarge();
  let body: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_CONTENT_WORKFLOW_BYTES) return tooLarge();
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid-json");
  } catch {
    return NextResponse.json({ status: "invalid-input", error: "invalid-json" }, { status: 400 });
  }
  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  if (!workspaceId) return NextResponse.json({ status: "preview", error: "missing-workspace" }, { status: 202 });
  const result = await executeContentWorkflow(body, { workspaceId }, { rpc: invokeSupabaseRpc });
  const status = result.status === "saved" || result.status === "duplicate" ? 200
    : result.status === "conflict" ? 409 : result.status === "invalid-input" ? 400
      : result.status === "preview" ? 202 : 502;
  return NextResponse.json(result, { status });
}

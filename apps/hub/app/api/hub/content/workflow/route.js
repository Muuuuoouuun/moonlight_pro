import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getContentWorkflow } from "@/lib/repositories/content-workflow-ledger";
import { forwardContentWorkflow } from "@/lib/content-workflow-forwarder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    return NextResponse.json(await getContentWorkflow(new URL(req.url).searchParams.get("item")));
  } catch {
    return NextResponse.json({ status: "error", error: "content-workflow-read-failed", item: null, variants: [], revisions: [] });
  }
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  try {
    const parsed = await readHubWriteJson(req, { maxBytes: 256 * 1024 });
    if (parsed.error) return parsed.error;
    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return NextResponse.json({ status: "invalid-input", error: "invalid-command" }, { status: 400 });
    const result = await forwardContentWorkflow(parsed.data);
    return NextResponse.json(result.data, { status: result.httpStatus });
  } catch {
    return NextResponse.json({ status: "error", error: "content-workflow-request-failed" }, { status: 502 });
  }
}

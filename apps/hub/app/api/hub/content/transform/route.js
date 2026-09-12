import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardContentTransform } from "@/lib/content-transform-forwarder";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  try {
    const parsed = await readHubWriteJson(req, { maxBytes: 256 * 1024 });
    if (parsed.error) return parsed.error;
    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return NextResponse.json({ status: "invalid-input", error: "invalid-command", persisted: false }, { status: 400 });
    const result = await forwardContentTransform(parsed.data);
    return NextResponse.json(result.data, { status: result.httpStatus });
  } catch {
    return NextResponse.json({ status: "unknown", error: "content-transform-outcome-unknown", persisted: false }, { status: 202 });
  }
}

import { NextResponse } from "next/server.js";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import {
  fetchSupabaseRows,
  insertSupabaseRecord,
} from "../../../../lib/supabase-rest.ts";
import { executeMemoCapture } from "../../../../lib/memo-capture-command.ts";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!validateSharedWebhookRequest(req).ok)
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length")) > 1024 * 1024)
    return NextResponse.json({ status: "invalid-input" }, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > 1024 * 1024)
    return NextResponse.json({ status: "invalid-input" }, { status: 413 });
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ status: "invalid-input" }, { status: 400 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return NextResponse.json({ status: "invalid-input" }, { status: 400 });
  try {
    const result = await executeMemoCapture(input, input.workspaceId, {
      read: fetchSupabaseRows,
      insert: insertSupabaseRecord,
    });
    return NextResponse.json(result, {
      status:
        result.status === "saved"
          ? 201
          : result.status === "duplicate"
            ? 200
            : result.status === "conflict"
              ? 409
              : result.status === "invalid-input"
                ? 400
                : result.status === "preview"
                  ? 202
                  : 502,
    });
  } catch {
    return NextResponse.json(
      { status: "error", error: "memo-capture-failed", retryable: true },
      { status: 502 },
    );
  }
}

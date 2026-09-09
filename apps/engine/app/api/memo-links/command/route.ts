import { NextResponse } from "next/server.js";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import { invokeSupabaseRpc } from "../../../../lib/supabase-rest.ts";
import { executeMemoLinkCommand } from "../../../../lib/memo-link-command.ts";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!validateSharedWebhookRequest(req).ok)
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 16384)
    return NextResponse.json({ status: "invalid-input" }, { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ status: "invalid-input" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ status: "invalid-input" }, { status: 400 });
  const result = await executeMemoLinkCommand(
    body,
    body.workspaceId || process.env.COM_MOON_DEFAULT_WORKSPACE_ID,
    invokeSupabaseRpc,
  );
  return NextResponse.json(result, {
    status: ["saved", "duplicate"].includes(String(result.status))
      ? 200
      : result.status === "invalid-input"
        ? 400
        : result.status === "preview"
          ? 202
          : 502,
  });
}

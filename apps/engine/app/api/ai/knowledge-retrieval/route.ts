import { NextResponse } from "next/server.js";
import { retrieveKnowledge } from "../../../../lib/knowledge-retriever.ts";
import { fetchSupabaseRowsDetailed } from "../../../../lib/supabase-rest.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok || auth.mode === "open") {
    return NextResponse.json({ status: "error", error: "invalid-shared-secret" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
    if (!body || typeof body !== "object") throw new Error("invalid-json");
  } catch {
    return NextResponse.json({ status: "error", error: "invalid-json" }, { status: 400 });
  }

  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ status: "preview", error: "missing-workspace", items: [] }, { status: 202 });
  }

  const result = await retrieveKnowledge(
    {
      workspaceId,
      query: typeof body.query === "string" ? body.query : "",
      filters: body.filters || {},
    },
    { readTable: fetchSupabaseRowsDetailed }
  );

  return NextResponse.json(result, { status: result.status === "error" ? 502 : 200 });
}

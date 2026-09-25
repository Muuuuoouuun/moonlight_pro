import { NextResponse } from "next/server.js";

import { handleGitHubWebhook } from "../../../../lib/github-webhook.ts";
import { fetchSupabaseRows, insertSupabaseRecord, updateSupabaseRecord } from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GitHub은 payload를 최대 25MB까지 보내지만 우리가 읽는 이벤트(CI·PR·이슈·릴리스·push)는 작다.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// 공개 경로다. 인증은 저장소 webhook의 비밀값으로 만든 X-Hub-Signature-256 하나다(§5.2).
export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") || "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ status: "invalid-input", error: "payload-too-large" }, { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ status: "invalid-input", error: "payload-too-large" }, { status: 413 });
  }
  const result = await handleGitHubWebhook({
    secret: process.env.GITHUB_WEBHOOK_SECRET?.trim() || "",
    workspaceId: process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() || null,
    rawBody,
    headers: {
      signature: req.headers.get("x-hub-signature-256"),
      event: req.headers.get("x-github-event"),
      delivery: req.headers.get("x-github-delivery"),
    },
  }, {
    fetchRows: (table, options = {}) => fetchSupabaseRows(table, options as Parameters<typeof fetchSupabaseRows>[1]),
    insert: (table, record) => insertSupabaseRecord(table, record),
    update: (table, filters, patch) => updateSupabaseRecord(table, filters, patch, { returnRepresentation: true }),
  });
  return NextResponse.json(result.body, { status: result.httpStatus });
}

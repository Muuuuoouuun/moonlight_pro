import { NextResponse } from "next/server";
import { getMemoLedger } from "@/lib/repositories/memo-ledger";
import { forwardMemoLinkCommand } from "@/lib/memo-link-engine-client";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { isCanonicalUuid } from "@/lib/uuid.js";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const taskId = new URL(req.url).searchParams.get("task");
  const noteId = new URL(req.url).searchParams.get("note");
  if (
    (taskId && !isCanonicalUuid(taskId)) ||
    (noteId && !isCanonicalUuid(noteId))
  )
    return NextResponse.json({ status: "invalid-input" }, { status: 400 });
  const data = await getMemoLedger({ taskId, noteId });
  return NextResponse.json(data, {
    status: data.status === "error" ? 502 : 200,
  });
}
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const result = await forwardMemoLinkCommand({
    ...parsed.data,
    workspaceId: resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(result.data, { status: result.httpStatus });
}

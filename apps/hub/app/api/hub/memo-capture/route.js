import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardMemoCapture } from "@/lib/memo-capture-engine-client";
import {
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";
import {
  fetchSupabaseRows,
  withWorkspaceFilter,
  eqFilter,
} from "@/lib/server-read";
import { isCanonicalUuid } from "@/lib/uuid.js";
export const dynamic = "force-dynamic";
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req, { maxBytes: 1024 * 1024 });
  if (parsed.error) return parsed.error;
  if (
    !parsed.data ||
    typeof parsed.data !== "object" ||
    Array.isArray(parsed.data)
  )
    return NextResponse.json({ status: "invalid-input" }, { status: 400 });
  const result = await forwardMemoCapture({
    ...parsed.data,
    workspaceId: resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(result.data, { status: result.httpStatus });
}
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!isCanonicalUuid(id))
    return NextResponse.json({ status: "invalid-input" }, { status: 400 });
  if (!resolveDefaultWorkspaceId() || !resolveSupabaseConfig())
    return NextResponse.json({ status: "preview" }, { status: 202 });
  try {
    const rows = await fetchSupabaseRows("notes", {
      filters: withWorkspaceFilter([["id", eqFilter(id)]]),
      limit: 1,
    });
    if (!rows) return NextResponse.json({ status: "error" }, { status: 502 });
    if (!rows[0])
      return NextResponse.json({ status: "not-found" }, { status: 404 });
    return NextResponse.json({ status: "live", memo: rows[0] });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 502 });
  }
}

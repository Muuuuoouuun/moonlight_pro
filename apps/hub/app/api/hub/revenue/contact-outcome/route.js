import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

// Phase 1C 컨택 완료 시트 — record_contact_outcome_v1 원자 RPC 프록시.
// { entityType, entityId, contactId?, kind?, summary, reaction, nextAction?, nextActionAt?, dormant? }
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const p = parsed.data || {};
    const workspaceId = resolveDefaultWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ status: "preview", reason: "missing-workspace" }, { status: 202 });
    }

    const result = await invokeSupabaseRpc("record_contact_outcome_v1", {
      p_workspace_id: workspaceId,
      p_entity_type: String(p.entityType || ""),
      p_entity_id: p.entityId || null,
      p_contact_id: p.contactId || null,
      p_kind: String(p.kind || "call"),
      p_summary: String(p.summary || ""),
      p_reaction: String(p.reaction || ""),
      p_next_action: p.nextAction != null ? String(p.nextAction) : null,
      p_next_action_at: p.nextActionAt != null ? String(p.nextActionAt) : null,
      p_dormant: Boolean(p.dormant),
    });

    if (!result.ok) {
      const status = result.error === "missing-config" ? "preview" : "error";
      return NextResponse.json(
        { status, reason: result.error, detail: result.detail || null },
        { status: status === "preview" ? 202 : 502 },
      );
    }

    const envelope = result.data && typeof result.data === "object" ? result.data : { status: "error" };
    const httpStatus = envelope.status === "saved" ? 200 : envelope.status === "invalid-input" ? 400 : 500;
    return NextResponse.json(envelope, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server.js";

import { normalizePmsCommand } from "../../../../lib/pms-command.ts";
import { executePmsCommand } from "../../../../lib/pms-command-service.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import {
  fetchSupabaseRows,
  fetchSupabaseRowsDetailed,
  insertSupabaseRecord,
  updateSupabaseRecord,
} from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { status: "unauthorized", error: "invalid-shared-secret" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "invalid-json", error: "request-body-must-be-json" },
      { status: 400 },
    );
  }

  const workspaceId =
    (typeof body.workspaceId === "string" && body.workspaceId.trim()) ||
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  const command = normalizePmsCommand(body, { workspaceId });
  if (!command.ok) {
    return NextResponse.json(
      { status: "invalid-input", error: command.reason },
      { status: 400 },
    );
  }

  const ownerRows = workspaceId
    ? await fetchSupabaseRows("workspaces", {
        select: "owner_id",
        filters: [["id", `eq.${workspaceId}`]],
        limit: 1,
      })
    : null;
  const ownerId = typeof ownerRows?.[0]?.owner_id === "string" ? ownerRows[0].owner_id : null;
  const result = await executePmsCommand(body, { workspaceId, ownerId }, {
    insert: insertSupabaseRecord,
    update: (table, filters, patch) => updateSupabaseRecord(
      table,
      filters,
      patch,
      { returnRepresentation: true },
    ),
    fetchRows: async (table, options = {}) => fetchSupabaseRows(
      table,
      options as Parameters<typeof fetchSupabaseRows>[1],
    ),
    fetchRowsDetailed: async (table, options = {}) => {
      const detailed = await fetchSupabaseRowsDetailed(
        table,
        options as Parameters<typeof fetchSupabaseRowsDetailed>[1],
      );
      if (!detailed.configured) {
        return { ok: false as const, reason: "missing-config" };
      }
      if (detailed.error) {
        return {
          ok: false as const,
          reason: detailed.error.reason,
          detail: detailed.error.detail,
        };
      }
      return { ok: true as const, rows: detailed.rows || [] };
    },
  });
  const statusCode = result.status === "saved"
    ? (String(body.action).startsWith("create_") ? 201 : 200)
    : result.status === "duplicate"
      ? 200
      : result.status === "conflict"
        ? 409
      : result.status === "invalid-input"
        ? 400
        : result.error === "not-found"
          ? 404
        : result.error === "missing-config"
          ? 202
          : 502;

  return NextResponse.json(result, { status: statusCode });
}

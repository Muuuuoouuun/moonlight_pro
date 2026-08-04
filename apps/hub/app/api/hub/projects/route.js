import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { isCanonicalUuid } from "../../../../lib/uuid.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const projectId = req?.url
      ? new URL(req.url).searchParams.get("project")?.trim() || null
      : null;
    if (projectId && !isCanonicalUuid(projectId)) {
      return NextResponse.json(
        {
          status: "invalid-input",
          error: "invalid-project-id",
          message: "project must be a canonical UUID.",
        },
        { status: 400 },
      );
    }
    const ledger = await getProjectLedger({ projectId });

    if (ledger.source === "error") {
      return NextResponse.json(
        {
          status: "error",
          ...ledger,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: ledger.source === "supabase"
        ? ledger.partial ? "partial" : "live"
        : "preview",
      ...ledger,
    });
  } catch (error) {
    console.error("[hub/projects] project ledger read failed", error);
    return NextResponse.json(
      {
        status: "error",
        error: "project-ledger-request-failed",
        retryable: true,
      },
      { status: 500 },
    );
  }
}

async function forwardProjectWrite(req, action) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const result = await forwardPmsCommand({
    ...parsed.data,
    action,
    ...(action === "create_project" ? { id: parsed.data.id || randomUUID() } : {}),
    workspaceId: resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, project: result.data?.entity || null },
    { status: result.httpStatus },
  );
}

export function POST(req) {
  return forwardProjectWrite(req, "create_project");
}

export function PATCH(req) {
  return forwardProjectWrite(req, "update_project");
}

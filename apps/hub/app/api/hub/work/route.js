import { NextResponse } from "next/server";

import { getWorkLedger } from "@/lib/repositories/work-ledger";
import { isCanonicalUuid } from "../../../../lib/uuid.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const projectId = new URL(req.url).searchParams.get("project")?.trim() || null;
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
    const ledger = await getWorkLedger({ projectId });
    const status = ledger.source === "error"
      ? "error"
      : ledger.source === "supabase"
        ? ledger.partial ? "partial" : "live"
        : "preview";

    return NextResponse.json({
      status,
      ...ledger,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

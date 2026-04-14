import { NextResponse } from "next/server";

import { buildRoutineCheckRecord, insertSupabaseRecord } from "@/lib/server-write";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const payload = await req.json();
    const record = buildRoutineCheckRecord(payload);

    if (!record.workspace_id) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Preview only.",
          preview: record,
        },
        { status: 202 },
      );
    }

    const persistence = await insertSupabaseRecord("routine_checks", record);

    if (!persistence.persisted) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Routine check payload is valid, but persistence is not configured or failed.",
          preview: record,
          persistence,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      status: "saved",
      message: "Routine check saved to Supabase.",
      preview: record,
      persistence,
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

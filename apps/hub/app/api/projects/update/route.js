import { NextResponse } from "next/server";

import { buildProjectUpdateRecord, insertSupabaseRecord } from "@/lib/server-write";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const payload = await req.json();
    const record = buildProjectUpdateRecord(payload);

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

    const persistence = await insertSupabaseRecord("project_updates", record);

    if (!persistence.persisted) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Project update payload is valid, but persistence is not configured or failed.",
          preview: record,
          persistence,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      status: "saved",
      message: "Project update saved to Supabase.",
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

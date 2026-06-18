import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { insertSupabaseRecord } from "@/lib/server-write";
import { extractBusinessCard } from "@/lib/google-vision";
import { buildCardIntakeRecord } from "@/lib/repositories/card-intake";
import { promoteStagedLeads } from "@/lib/repositories/sheets-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { imageBase64, mimeType } — vision extract -> staging -> (auto) promote.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  // base64 image inflates ~33%; 8MB cap leaves room for a phone photo.
  const parsed = await readHubWriteJson(req, { maxBytes: 8 * 1024 * 1024 });
  if (parsed.error) return parsed.error;

  const { imageBase64, mimeType } = parsed.data || {};
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ status: "error", error: "imageBase64 is required" }, { status: 400 });
  }

  const vision = await extractBusinessCard(imageBase64, mimeType);
  if (!vision.ok) {
    return NextResponse.json({ status: "error", error: vision.error }, { status: 502 });
  }

  const { workspaceId, record, disposition } = buildCardIntakeRecord(vision.fields);

  // No Supabase configured — preview the extraction without writing.
  if (!workspaceId) {
    return NextResponse.json({ status: "preview", disposition, fields: vision.fields }, { status: 200 });
  }

  const inserted = await insertSupabaseRecord("lead_intake_raw", record);
  if (inserted && inserted.error) {
    return NextResponse.json({ status: "error", error: inserted.error, fields: vision.fields }, { status: 500 });
  }

  // review / rejected stay in staging — surfaced for a look, never silently wrong.
  if (disposition !== "promote") {
    return NextResponse.json({ status: disposition, fields: vision.fields, intakeId: record.id }, { status: 200 });
  }

  const promote = await promoteStagedLeads({ workspaceId, intakeIds: [record.id] })
    .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

  return NextResponse.json(
    { status: "promoted", fields: vision.fields, intakeId: record.id, promote },
    { status: 200 },
  );
}

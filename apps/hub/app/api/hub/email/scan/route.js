import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { scanGmailForLeads } from "@/lib/repositories/gmail-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusToHttp(status) {
  if (status === "ok") return 200;
  if (status === "preview") return 202;
  return 500;
}

// POST — run the real scan: classify recent Gmail inbox messages and stage
// lead-looking ones into lead_intake_raw (status 'pending', reviewed via the
// Intake Inbox). Write-guarded like the other Hub write routes (cards, intake).
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  // Body is optional — { maxMessages } lets the UI tune the scan size.
  const parsed = await readHubWriteJson(req).catch(() => ({ data: {} }));
  if (parsed.error) return parsed.error;

  const maxMessages = Number.parseInt(parsed.data?.maxMessages, 10);

  try {
    const result = await scanGmailForLeads({
      maxMessages: Number.isFinite(maxMessages) && maxMessages > 0 ? maxMessages : 20,
    });
    return NextResponse.json(result, { status: statusToHttp(result.status) });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// GET — cheap dry-run summary: classify without staging anything, so the
// automations UI can show "N candidates" before committing to a real scan.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const maxMessages = Number.parseInt(searchParams.get("maxMessages"), 10);

  try {
    const result = await scanGmailForLeads({
      maxMessages: Number.isFinite(maxMessages) && maxMessages > 0 ? maxMessages : 20,
      dryRun: true,
    });
    return NextResponse.json(result, { status: statusToHttp(result.status) });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

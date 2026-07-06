import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { scanGmailForLeads } from "@/lib/repositories/gmail-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard ceiling on messages fetched per scan — protects the operator's Gmail quota
// from an oversized (or malicious) maxMessages value.
const MAX_MESSAGES_CAP = 50;

function clampMaxMessages(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, MAX_MESSAGES_CAP);
}

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

  try {
    const result = await scanGmailForLeads({
      maxMessages: clampMaxMessages(parsed.data?.maxMessages),
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
// Guarded like POST even though it writes nothing to OUR ledger: it still
// refreshes the Gmail token and reads inbox metadata, so an unauthenticated
// caller could burn Gmail quota and learn mailbox classification counts.
export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);

  try {
    const result = await scanGmailForLeads({
      maxMessages: clampMaxMessages(searchParams.get("maxMessages")),
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

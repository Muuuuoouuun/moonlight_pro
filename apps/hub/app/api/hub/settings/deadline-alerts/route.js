import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getDeadlineAlertSettings, saveDeadlineAlertReset } from "@/lib/repositories/deadline-alert-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDeadlineAlertSettings();
    return NextResponse.json({ status: result.status, reset: result.reset, ...(result.error ? { error: result.error } : {}) });
  } catch (error) {
    return NextResponse.json({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
}

export async function PATCH(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const action = parsed.data?.action;
  if (!["reset", "restore"].includes(action)) {
    return NextResponse.json({ status: "invalid-input", error: "action must be reset or restore" }, { status: 400 });
  }
  try {
    const result = await saveDeadlineAlertReset(action);
    return NextResponse.json(result, { status: result.status === "conflict" ? 409 : result.status === "error" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({ status: "error", error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

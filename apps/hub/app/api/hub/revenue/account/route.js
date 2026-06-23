import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { buildAccountWrite, persistRevenueRecord } from "@/lib/sales-os/revenue-write";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const payload = parsed.data || {};
    const op = payload.op === "create" ? "create" : payload.op === "delete" ? "delete" : "update";

    const result = await persistRevenueRecord({
      table: "customer_accounts",
      op,
      id: payload.id,
      payload,
      build: buildAccountWrite,
    });

    const httpStatus = result.status === "saved" ? 200 : result.status === "error" ? 400 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { buildCaseWrite, persistRevenueRecord } from "@/lib/sales-os/revenue-write";

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
      table: "operation_cases",
      op,
      id: payload.id,
      payload,
      build: buildCaseWrite,
    });

    // saved 200 · error(입력) 400 · failed(라이브 백엔드 거부 — 재시도) 502 · preview/noop 202
    const httpStatus = result.status === "saved" ? 200
      : result.status === "error" ? 400
      : result.status === "failed" ? 502
      : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

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

    // saved 200 · error(입력) 400 · blocked(이력이 붙어 삭제 거부) 409 ·
    // failed(라이브 백엔드 거부 — 재시도) 502 · preview/noop 202
    const httpStatus = result.status === "saved" ? 200
      : result.status === "error" ? 400
      : result.status === "blocked" ? 409
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

import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { saveRevenueTarget } from "@/lib/sales-os/revenue-target-write";

export const runtime = "nodejs";

// POST { month: "YYYY-MM", amount } — 이번 달 매출 목표(운영자 2026-09-24 결정 1층)를
// workspaces.meta.revenue_targets에 저장한다. amount: null은 그 달 목표를 지운다.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const payload = parsed.data || {};
    const result = await saveRevenueTarget({
      month: payload.month,
      amount: payload.amount === null ? null : payload.amount,
    });

    // saved 200 · error(입력) 400 · failed(라이브 백엔드 거부 — 재시도) 502 · preview 202
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

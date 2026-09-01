import { NextResponse } from "next/server";

import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { countCustomerReferences } from "@/lib/sales-os/customer-delete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?kind=lead|account&id=&companyId= — 고객 삭제 프리플라이트.
//
// 삭제 자체는 3.5초 되돌리기 창 뒤에 POST되므로, 차단 사유를 그 POST의 응답으로만
// 알리면 "삭제됨"을 보여준 3.5초 뒤에야 "사실은 못 지웁니다"가 뜬다. 그래서 버튼을
// 누른 즉시 여기서 먼저 세고, 깨끗할 때만 되돌리기 창으로 넘어간다.
// 이건 UX용 선조회일 뿐이고, 실제 강제는 delete 경로의 서버 가드가 한다.
export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const id = params.get("id") || "";
    const kind = params.get("kind") === "account" ? "account" : "lead";
    const companyId = params.get("companyId") || null;

    if (!id) {
      return NextResponse.json({ status: "error", reason: "missing-id" }, { status: 400 });
    }

    const workspaceId = resolveDefaultWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ status: "preview", reason: "missing-workspace" }, { status: 202 });
    }

    const refs = await countCustomerReferences({
      table: kind === "account" ? "customer_accounts" : "leads",
      id,
      companyId,
      workspaceId,
    });

    // 못 셌으면 "참조 0"으로 답하지 않는다 — 그 답을 믿고 삭제하면 이력이 사라진다.
    // HTTP는 200으로 유지하고(daily-brief 계약) status:"error"로만 알린다.
    if (!refs.ok) {
      return NextResponse.json({
        status: "error",
        reason: refs.reason,
        table: refs.table,
        detail: refs.detail || null,
      });
    }

    return NextResponse.json({
      status: "live",
      deletable: refs.total === 0,
      total: refs.total,
      references: refs.counts,
      // 라이브 스키마에 링크가 없어 건너뛴 조사 — 판정은 유효하되 부분 검사였음을 숨기지 않는다.
      skipped: refs.skipped || [],
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

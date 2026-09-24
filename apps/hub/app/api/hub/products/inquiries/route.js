import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { fetchSupabaseRowsDetailed, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { isCanonicalUuid } from "../../../../../lib/uuid.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 문의 ↔ 제품 연결 (2026-09-25 운영자: "문의도 어떤 제품으로 왔는지 연결").
// GET ?inquiry=<id> — 문의 상세의 제품 선택지와 현재 연결. 읽기 실패는 200 + { status: "error" } 봉투.
export async function GET(req) {
  const inquiryId = new URL(req.url).searchParams.get("inquiry")?.trim() || "";
  if (!isCanonicalUuid(inquiryId)) {
    return NextResponse.json({ status: "invalid-input", error: "invalid-inquiry-id" }, { status: 400 });
  }
  if (!resolveSupabaseConfig() || !resolveDefaultWorkspaceId()) {
    return NextResponse.json({ status: "preview", productId: null, products: [] });
  }
  const [products, link] = await Promise.all([
    fetchSupabaseRowsDetailed("products", { select: "id,name,stage,org_scope", filters: withWorkspaceFilter([["stage", "neq.sunset"]]), order: "name.asc", limit: 200 }),
    fetchSupabaseRowsDetailed("product_inquiry_links", { select: "product_id", filters: withWorkspaceFilter([["inquiry_id", `eq.${inquiryId}`]]), limit: 1 }),
  ]);
  if (!products.rows || !link.rows) {
    const missingTable = /PGRST205|42P01|Could not find the table/i.test(`${products.error?.detail || ""} ${link.error?.detail || ""}`);
    return NextResponse.json({ status: "error", error: missingTable ? "products-table-missing" : "product-inquiry-read-failed", productId: null, products: [] });
  }
  const productId = link.rows[0]?.product_id || null;
  // 종료한 제품에 이미 붙어 있던 문의도 현재 값을 잃지 않게 목록에 되살린다.
  const list = products.rows.map((row) => ({ id: row.id, name: row.name, stage: row.stage, orgScope: row.org_scope }));
  return NextResponse.json({ status: "live", productId, products: list, linkedOutsideList: Boolean(productId && !list.some((p) => p.id === productId)) });
}

async function forward(req, action) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const result = await forwardPmsCommand({
    inquiryId: parsed.data?.inquiryId,
    ...(action === "link_inquiry" ? { productId: parsed.data?.productId } : {}),
    action,
    workspaceId: resolveDefaultWorkspaceId(),
  }, { path: "/api/products/command" });
  return NextResponse.json(result.data, { status: result.httpStatus });
}

export function POST(req) {
  return forward(req, "link_inquiry");
}

export function DELETE(req) {
  return forward(req, "unlink_inquiry");
}

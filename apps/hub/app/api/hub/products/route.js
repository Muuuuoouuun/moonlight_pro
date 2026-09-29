import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { getProductLedger } from "@/lib/repositories/products-ledger";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 제품 카탈로그 읽기(docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §6).
// 읽기 실패는 HTTP 200 + { status: "error" } 봉투다(CLAUDE.md Hub read 실패 봉투).
export async function GET() {
  try {
    return NextResponse.json(await getProductLedger());
  } catch (error) {
    console.error("[hub/products] product ledger read failed", error);
    return NextResponse.json({ status: "error", error: "products-request-failed", retryable: true, products: [], candidates: [] });
  }
}

const PRODUCT_COMMAND_PATH = "/api/products/command";

async function forwardProductWrite(req, action) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const result = await forwardPmsCommand({
    ...parsed.data,
    action,
    ...(action === "create_product" ? { id: parsed.data.id || randomUUID() } : {}),
    workspaceId: resolveDefaultWorkspaceId(),
  }, { path: PRODUCT_COMMAND_PATH });
  return NextResponse.json({ ...result.data, product: result.data?.entity || null }, { status: result.httpStatus });
}

export function POST(req) {
  return forwardProductWrite(req, "create_product");
}

export function PATCH(req) {
  return forwardProductWrite(req, "update_product");
}

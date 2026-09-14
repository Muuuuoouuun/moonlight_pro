import { NextResponse } from "next/server.js";
import { getContentHistory } from "@/lib/repositories/content-workflow-ledger";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  return NextResponse.json(await getContentHistory(p.get("item"), p.get("variant"), { before: p.get("before"), beforeId: p.get("beforeId") }));
}

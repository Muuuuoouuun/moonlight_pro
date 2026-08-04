import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { recordOutreachOutcome } from "@/lib/repositories/outcomes-ledger";
import { isValidReaction } from "@/lib/sales-os/outcome-attribution";
import { buildFollowupWrite, persistRevenueRecord } from "@/lib/sales-os/revenue-write";

export const runtime = "nodejs";

function safeEqual(a, b) {
  const aB = Buffer.from(String(a || ""));
  const bB = Buffer.from(String(b || ""));
  return aB.length === bB.length && timingSafeEqual(aB, bB);
}

// Same-origin dashboard / loop calls are trusted; external/cron use the write-secret.
// (Same posture as the sheets sync route — single-operator localhost tool.)
function isSameOrigin(req) {
  const origin = (req.headers.get("origin") || "").replace(/\/$/, "");
  if (!origin) return false;
  const allowed = [process.env.COM_MOON_HUB_URL, process.env.NEXT_PUBLIC_APP_URL]
    .map((u) => (u || "").trim().replace(/\/$/, ""))
    .filter(Boolean);
  try { allowed.push(new URL(req.url).origin); } catch {}
  return allowed.includes(origin);
}

function authorize(req) {
  if (isSameOrigin(req)) return { ok: true };
  const secret = process.env.COM_MOON_HUB_WRITE_SECRET?.trim();
  if (!secret) return { ok: false, status: 503, reason: "write-secret-not-configured" };
  const provided = req.headers.get("x-com-moon-hub-write-secret") || "";
  if (!safeEqual(provided, secret)) return { ok: false, status: 401, reason: "unauthorized" };
  return { ok: true };
}

// Minimum contact record (operator-workflow-profile.md §7 확정): 대화 요약 (note) + 고객 반응
// (reaction) + 다음 행동과 날짜 (nextAction.text/at, or nextAction.dormant for 기약 없음).
// nextAction is optional so the plain quick-log buttons (no mini-form) keep working unchanged.
export async function POST(req) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ status: "error", reason: auth.reason }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));

  if (body.reaction != null && !isValidReaction(body.reaction)) {
    return NextResponse.json({ status: "error", reason: "invalid-reaction" }, { status: 400 });
  }

  const result = await recordOutreachOutcome({
    leadId: body.leadId || null,
    dealId: body.dealId || null,
    companyId: body.companyId || null,
    play: body.play || null,
    assetId: body.assetId || null,
    channel: body.channel || null,
    action: body.action || "sent",
    note: body.note || null,
    meta: body.reaction ? { reaction: body.reaction } : null,
    occurredAt: body.occurredAt || null,
  });

  let followup = null;
  const nextAction = body.nextAction;
  if (nextAction && (body.leadId || body.dealId)) {
    followup = await persistRevenueRecord({
      table: body.leadId ? "leads" : "deals",
      op: "update",
      id: body.leadId || body.dealId,
      payload: {
        text: nextAction.text ?? null,
        at: nextAction.dormant === true ? null : nextAction.at ?? null,
        dormant: nextAction.dormant === true,
      },
      build: buildFollowupWrite,
    });
  }

  return NextResponse.json({ status: result.persisted ? "ok" : "error", result, followup });
}

import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { getFollowups } from "@/lib/repositories/followups-ledger";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleBrandContext } from "@/lib/sales-os/brand-context";
import { getWorkOrders } from "@/lib/sales-os/work-orders";
import { insertSupabaseRecord, resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chief of Staff (안3) — the active morning brief that orchestrates the other two lanes.
//
// Runs before the operator wakes, assembles cross-lane state (the approval backlog that 안1
// Guru Autopilot + 안2 Content Flywheel queued overnight, top stalled deals, brand cadence),
// and composes ONE prioritized "오늘 이 3개만" list — not a dump. It:
//   1. records an agent_run under the 'order' persona → wires a dormant persona to a real
//      scheduled run (the roster/agents page shows a live "last run" with zero UI change), and
//   2. writes a project_update (the same brief sink the Engine AI brief uses) so it lands in
//      the Daily Brief feed.
//
// NOT built here (the one genuine non-reuse, design Open Question #4): push-to-phone. No
// web-push/VAPID/service-worker infra exists in the app. Delivery today is "it's waiting in
// the Hub when you open it"; a push/email channel is a separate infra add. Nothing is sent.
//
// Auth: Vercel injects Bearer CRON_SECRET (= COM_MOON_HUB_WRITE_SECRET), same as the others.
const CHIEF_AGENT = "order"; // PERSONA_CONTRACT[0].id — the ops persona, now a real worker

function pickToday(proposed, deals, cadence) {
  const items = [];

  // 1) Overnight-queued drafts (안1/안2 output) are the highest-leverage: ready to act on now.
  const drafts = proposed.filter((o) => o.kind === "followup-draft" || o.kind === "content-draft");
  if (drafts.length) {
    const kinds = drafts.reduce((acc, o) => ((acc[o.kind] = (acc[o.kind] || 0) + 1), acc), {});
    const parts = [];
    if (kinds["followup-draft"]) parts.push(`영업 후속 ${kinds["followup-draft"]}건`);
    if (kinds["content-draft"]) parts.push(`콘텐츠 초안 ${kinds["content-draft"]}건`);
    items.push({
      lane: "approve",
      title: `밤새 준비된 초안 ${drafts.length}건 검토·승인`,
      detail: parts.join(" · "),
      count: drafts.length,
    });
  }

  // 2) The single most-stalled deal (sales lane).
  const topDeal = deals[0];
  if (topDeal) {
    items.push({
      lane: "sales",
      title: `정체 딜: ${topDeal.name}`,
      detail: topDeal.why || "",
      ref: topDeal.id,
    });
  }

  // 3) Brand cadence, only when behind.
  if (cadence && cadence.behind) {
    items.push({
      lane: "brand",
      title: `이번 주 발행 ${cadence.published}/${cadence.goal} — 뒤처짐`,
      detail: "콘텐츠 초안 승인/발행으로 케이던스 회복",
    });
  }

  // Any other pending approvals (inbox/team proposals) as a tail, if we have room.
  if (items.length < 3) {
    const others = proposed.filter((o) => o.kind !== "followup-draft" && o.kind !== "content-draft");
    if (others.length) {
      items.push({
        lane: "approve",
        title: `승인 대기 ${others.length}건`,
        detail: "인박스·팀 제안 큐",
        count: others.length,
      });
    }
  }

  return items.slice(0, 3);
}

function toSummary(items) {
  if (!items.length) return "오늘 급한 항목 없음 — 큐가 비었습니다.";
  return items.map((it, i) => `${i + 1}. ${it.title}${it.detail ? ` — ${it.detail}` : ""}`).join("\n");
}

export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const workspaceId = resolveDefaultWorkspaceId();

  try {
    // Cross-lane assembly. Each source degrades to empty on failure (honest, never throws the job).
    const [followRes, ordersRes, brandCtx] = await Promise.all([
      getFollowups({ workspaceId, limit: 10 }).catch(() => null),
      getWorkOrders({ workspaceId, status: "proposed", limit: 200 }).catch(() => null),
      assembleBrandContext({ mode: "brand-strategy" }).catch(() => null),
    ]);

    const configured =
      followRes?.source === "supabase" || ordersRes?.source === "supabase" || brandCtx?.source === "supabase";
    if (!configured) {
      return NextResponse.json({ status: "skipped", reason: "missing-config" });
    }

    const proposed = ordersRes?.orders || [];
    const deals = (followRes?.items || []).filter((i) => i.kind === "deal");
    const cadence = brandCtx?.content?.cadence || null;

    const items = pickToday(proposed, deals, cadence);
    const summary = toSummary(items);

    // Wire the 'order' persona to a real scheduled run — the roster now shows a live last-run.
    const run = await recordAgentRun({
      workspaceId,
      agent: CHIEF_AGENT,
      mode: "morning-brief",
      inputSummary: `queue=${proposed.length} deals=${deals.length} cadence=${cadence ? (cadence.behind ? "behind" : "ok") : "-"}`,
      recommendation: { items },
      emittedCount: items.length,
    });

    // Land the brief in the Daily Brief feed (same project_updates sink the Engine AI brief uses).
    let update = null;
    if (workspaceId) {
      update = await insertSupabaseRecord("project_updates", {
        workspace_id: workspaceId,
        project_id: null,
        source: "order",
        event_type: "ai.morning_brief",
        status: "reported",
        title: "오늘의 브리핑 — Chief of Staff",
        summary: summary.slice(0, 500),
        progress: null,
        milestone: null,
        next_action: items[0] ? items[0].title : "큐가 비었습니다.",
        payload: { items, queue: proposed.length, deals: deals.length, runId: run?.id || null },
        happened_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      status: "ok",
      items,
      summary,
      counts: { queue: proposed.length, deals: deals.length, cadenceBehind: Boolean(cadence?.behind) },
      persisted: Boolean(update?.persisted),
      // Delivery is "waiting in the Hub" today; push/email is a separate infra add (design OQ#4).
      delivery: "hub",
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

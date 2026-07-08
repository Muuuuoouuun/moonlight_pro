// Stalled-deal scan — server-side counterpart of the kanban card's manual queue button.
//
// The Deals kanban shows a queue icon on cards aged past the threshold, but that only
// works when the operator happens to be looking at the board. This scan walks the live
// deal ledger, finds stalled open deals, and proposes a follow-up work_order for each —
// same persona/kind contract as the manual button (persona 'guru', kind 'followup'),
// so the approval queue and Daily Brief pick them up with zero new UI.
//
// Idempotent by design: a deal with an open followup order (proposed/approved/executing)
// is skipped, so the scan can piggyback on every Daily Brief load without cron infra.

import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";
import { resolveDefaultWorkspaceId } from "../server-write.js";
import { createWorkOrder, getWorkOrders } from "./work-orders.js";

const DEFAULT_THRESHOLD_DAYS = 10;
// Cap per scan so a long-neglected board doesn't flood the approval queue in one morning.
const DEFAULT_MAX_CREATES = 5;

export async function scanStalledDeals({
  workspaceId = resolveDefaultWorkspaceId(),
  ledger = null, // pass a pre-fetched revenue ledger to avoid a duplicate read
  thresholdDays = DEFAULT_THRESHOLD_DAYS,
  maxCreates = DEFAULT_MAX_CREATES,
  dryRun = false,
} = {}) {
  if (!workspaceId) {
    return { status: "preview", reason: "missing-workspace", stalled: 0, created: 0, skipped: 0, proposals: [] };
  }

  const rev = ledger || (await getRevenueLedger());
  if (rev?.source !== "supabase") {
    return { status: "preview", reason: "ledger-preview", stalled: 0, created: 0, skipped: 0, proposals: [] };
  }

  const deals = Array.isArray(rev.deals) ? rev.deals : [];
  const stalled = deals.filter(
    (d) => d.stage !== "won" && d.stage !== "lost" && Number(d.age) > thresholdDays,
  );
  if (!stalled.length) {
    return { status: "ok", stalled: 0, created: 0, skipped: 0, proposals: [] };
  }

  // Dedupe against ANY open followup order for the deal — covers both prior scans and
  // the operator's manual kanban queue button (same kind contract).
  const open = await getWorkOrders({
    workspaceId,
    status: ["proposed", "approved", "executing"],
    limit: 200,
  });
  const openFollowupDealIds = new Set(
    (open.orders || []).filter((o) => o.kind === "followup" && o.dealId).map((o) => o.dealId),
  );

  const candidates = stalled
    .filter((d) => !openFollowupDealIds.has(d.id))
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, maxCreates);
  const skipped = stalled.length - candidates.length;

  if (dryRun) {
    return {
      status: "ok",
      dryRun: true,
      stalled: stalled.length,
      created: 0,
      skipped,
      proposals: candidates.map((d) => ({ dealId: d.id, name: d.name, stage: d.stage, age: d.age, value: d.value })),
    };
  }

  let created = 0;
  const proposals = [];
  for (const deal of candidates) {
    const res = await createWorkOrder({
      workspaceId,
      persona: "guru",
      kind: "followup",
      title: `[정체 ${deal.age}일] ${deal.name} follow-up 제안`,
      body: {
        reason: "stalled-scan",
        stage: deal.stage,
        age: deal.age,
        value: deal.value,
        note: "서버 스캔 자동 제안 — 승인 시 follow-up 진행",
      },
      dealId: deal.id,
      source: "team",
    });
    if (res.persisted) {
      created += 1;
      proposals.push({ dealId: deal.id, name: deal.name, orderId: res.order?.id || null });
    }
  }

  return { status: "ok", stalled: stalled.length, created, skipped: skipped + (candidates.length - created), proposals };
}

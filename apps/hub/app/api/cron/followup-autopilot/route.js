import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { getFollowups } from "@/lib/repositories/followups-ledger";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleSalesContext } from "@/lib/sales-os/context-assembler";
import { createWorkOrder, getWorkOrders } from "@/lib/sales-os/work-orders";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guru Autopilot (안1 Phase A) — the morning follow-up SDR.
//
// Chain: Hub Vercel Cron → Engine AI (followup-draft, shared secret) → Hub work_orders.
// Every night it scans the top-risk stalled DEALS (getFollowups, the same scoring the
// Follow-up screen uses), asks Guru to write a send-ready draft, and drops it into the
// approval queue as 'proposed'. Nothing is sent — gates.no_auto_send=true holds. The
// operator approves/edits/dismisses in the Daily Brief cockpit (1-click gate).
//
// Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>`. Set the Vercel env
// CRON_SECRET = COM_MOON_HUB_WRITE_SECRET so assertHubWriteAllowed accepts the cron.
const ENGINE_PATH = "/api/ai/sales-mentor";
const MAX_DRAFTS = 3; // top-3 stalled deals per run — a queue, not a firehose
const DRAFT_TOKENS = 8192; // thinking model shares the budget; 4096 truncated intermittently in testing

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

function resolveSharedSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || "";
}

// Direct Engine call (not via the /api/hub/sales-mentor proxy — the cron owns run logging
// and work-order creation itself, and a self-HTTP hop would double-guard). Mirrors the
// callEngine in apps/hub/app/api/hub/sales-mentor/route.js.
async function callEngineDraft(body) {
  const engineUrl = resolveEngineUrl();
  if (!engineUrl) {
    return { status: 202, data: { status: "preview", error: "COM_MOON_ENGINE_URL is not configured." } };
  }

  const headers = { "content-type": "application/json" };
  const secret = resolveSharedSecret();
  if (secret) headers["x-com-moon-shared-secret"] = secret;

  const response = await fetch(`${engineUrl}${ENGINE_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  return { status: response.status, data };
}

// Dedup: work_orders has NO unique constraint, so a re-run (or a still-stalled deal the next
// night) would stack duplicate proposals. Skip a deal if an open 'proposed' followup-draft
// already exists for it.
function hasOpenDraft(openOrders, dealId) {
  return openOrders.some(
    (o) => o.dealId === dealId && o.kind === "followup-draft" && o.status === "proposed",
  );
}

export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const workspaceId = resolveDefaultWorkspaceId();
  const summary = { scanned: 0, drafted: 0, skipped: 0, errored: 0, deals: [] };

  try {
    // Source of truth for "who's stalled" — reuse the scoring, don't reimplement priorityFor.
    const follow = await getFollowups({ workspaceId, limit: 25 });
    if (follow.source !== "supabase") {
      // No Supabase (or no data) → honest no-op, not an error. Retry is the next schedule.
      return NextResponse.json({
        status: "skipped",
        reason: follow.configured ? "no-data" : "missing-config",
        ...summary,
      });
    }

    const deals = (follow.items || []).filter((i) => i.kind === "deal").slice(0, MAX_DRAFTS);
    summary.scanned = deals.length;

    // Load open proposals once for the dedup check (avoids N queries in the loop).
    const existing = await getWorkOrders({ workspaceId, status: "proposed", limit: 200 });
    const openOrders = existing.orders || [];

    for (const deal of deals) {
      // Per-deal isolation: one deal's failure never kills the whole run.
      try {
        if (hasOpenDraft(openOrders, deal.id)) {
          summary.skipped += 1;
          continue;
        }

        const context = await assembleSalesContext({ mode: "followup-draft", ref: deal.id });

        // Bounded thinking makes truncation rare, but the thinking model still malforms the
        // JSON ~5% of the time. One retry lifts per-deal reliability past 99% and gets the
        // draft out tonight instead of deferring to the next schedule.
        let engine = null;
        let data = null;
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
          engine = await callEngineDraft({
            mode: "followup-draft",
            ref: deal.id,
            context,
            maxOutputTokens: DRAFT_TOKENS,
          });
          data = engine.data;
          ok =
            engine.status >= 200 &&
            engine.status < 300 &&
            data &&
            data.status === "generated" &&
            typeof data.subject === "string" &&
            typeof data.body === "string";
        }

        if (!ok) {
          summary.errored += 1;
          await recordAgentRun({
            workspaceId,
            agent: "guru",
            mode: "followup-draft",
            ref: deal.id,
            inputSummary: `engine ${engine.status} · ${data?.reason || "no-draft"}`,
            result: "error",
          });
          continue;
        }

        // Mint the run FIRST (createWorkOrder is return=minimal → returns no id), then thread
        // runId into the work order so outcome→run attribution goes live on approve/execute.
        const run = await recordAgentRun({
          workspaceId,
          agent: "guru",
          mode: "followup-draft",
          ref: deal.id,
          inputSummary: `followup-draft · ${deal.name} · ${deal.why}`,
          recommendation: { subject: data.subject, body: String(data.body).slice(0, 800) },
          emittedCount: 1,
        });
        const runId = run?.id || null;

        const created = await createWorkOrder({
          workspaceId,
          persona: "guru",
          kind: "followup-draft",
          source: "guru", // work_orders.source CHECK: team|inbox|guru|manual
          dealId: deal.id,
          companyId: null,
          title: String(data.subject).slice(0, 200),
          body: {
            subject: data.subject,
            body: data.body,
            why: deal.why,
            channel: deal.channel || null,
            model: data.model || null,
          },
          channel: deal.channel || null,
          gate: "human_approval",
          runId,
        });

        if (created.persisted) {
          summary.drafted += 1;
          summary.deals.push(deal.name);
        } else {
          summary.errored += 1;
        }
      } catch (err) {
        summary.errored += 1;
      }
    }

    return NextResponse.json({ status: "ok", ...summary });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

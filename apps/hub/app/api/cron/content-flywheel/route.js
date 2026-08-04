import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleBrandContext } from "@/lib/sales-os/brand-context";
import { createWorkOrder, getWorkOrders } from "@/lib/sales-os/work-orders";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Content Flywheel (안2) — keeps the personal-brand publishing cadence alive without the operator.
//
// Chain: Hub Vercel Cron → Engine AI (content-draft, shared secret) → Hub work_orders.
// When this week's cadence is BEHIND goal, it picks the top own-brand idea, asks the Council
// to write a self-critiqued publishable draft, and drops it in the approval queue as 'proposed'.
// Nothing is published — the operator approves/edits/dismisses. gates.no_auto_send holds.
//
// Auth: same as recompute-scores — Vercel injects Bearer CRON_SECRET (= COM_MOON_HUB_WRITE_SECRET).
const ENGINE_PATH = "/api/ai/brand-mentor";
const DRAFT_TOKENS = 8192; // thinking model shares the budget; bounded thinking is set engine-side

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

function resolveSharedSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || "";
}

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

export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const workspaceId = resolveDefaultWorkspaceId();
  const summary = { cadenceBehind: false, drafted: 0, skipped: 0, errored: 0, idea: null };

  try {
    const context = await assembleBrandContext({ mode: "content-draft" });
    if (!context || context.source !== "supabase") {
      return NextResponse.json({ status: "skipped", reason: "missing-config-or-preview", ...summary });
    }

    const cadence = context.content?.cadence || null;
    const behind = Boolean(cadence?.behind);
    summary.cadenceBehind = behind;

    // Only act when the cadence is actually behind goal — the point is to keep it alive, not
    // to flood the queue. On-track weeks are a clean no-op.
    if (!behind) {
      return NextResponse.json({ status: "on-track", reason: "cadence-met", ...summary });
    }

    // Neutralize the effectiveIdeaRank +30 classmoon (ClassIn sales brand) bias — the Council
    // lane is the operator's OWN brands. Prefer non-classmoon ideas; fall back only if none.
    const ideas = Array.isArray(context.content?.idea_queue_top) ? context.content.idea_queue_top : [];
    const ownIdeas = ideas.filter((i) => i && i.brandKey && i.brandKey !== "classmoon");
    const pool = ownIdeas.length ? ownIdeas : ideas;
    if (!pool.length) {
      return NextResponse.json({ status: "skipped", reason: "no-ideas", ...summary });
    }

    // Dedup: don't stack drafts. Skip ideas that already have an open 'proposed' content-draft
    // (keyed on work_orders.asset_id = the idea's content_items id).
    const existing = await getWorkOrders({ workspaceId, status: "proposed", limit: 200 });
    const openDraftAssetIds = new Set(
      (existing.orders || [])
        .filter((o) => o.kind === "content-draft" && o.status === "proposed")
        .map((o) => o.assetId),
    );
    const idea = pool.find((i) => !openDraftAssetIds.has(i.id));
    if (!idea) {
      summary.skipped = pool.length;
      return NextResponse.json({ status: "skipped", reason: "all-ideas-already-queued", ...summary });
    }
    summary.idea = idea.title;

    // Give the Engine the exact idea to write (its content-draft prompt reads context.target_idea).
    const draftContext = {
      ...context,
      target_idea: { id: idea.id, title: idea.title, summary: idea.summary || "", brandKey: idea.brandKey },
    };

    // One retry: the thinking model malforms JSON ~5% of the time even with bounded thinking.
    let engine = null;
    let data = null;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
      engine = await callEngineDraft({
        mode: "content-draft",
        ref: idea.title,
        context: draftContext,
        maxOutputTokens: DRAFT_TOKENS,
      });
      data = engine.data;
      ok =
        engine.status >= 200 &&
        engine.status < 300 &&
        data &&
        data.status === "generated" &&
        typeof data.title === "string" &&
        typeof data.body === "string";
    }

    if (!ok) {
      summary.errored = 1;
      await recordAgentRun({
        workspaceId,
        agent: "council",
        mode: "content-draft",
        ref: idea.id,
        inputSummary: `engine ${engine?.status} · ${data?.reason || "no-draft"}`,
        result: "error",
      });
      return NextResponse.json({ status: "error", reason: "draft-failed", ...summary }, { status: 502 });
    }

    // Mint the run first (createWorkOrder returns no id), then thread runId into the order.
    const run = await recordAgentRun({
      workspaceId,
      agent: "council",
      mode: "content-draft",
      ref: idea.id,
      inputSummary: `content-draft · ${idea.brandKey || "brand"} · ${idea.title}`,
      recommendation: { title: data.title, body: String(data.body).slice(0, 800) },
      emittedCount: 1,
    });
    const runId = run?.id || null;

    const created = await createWorkOrder({
      workspaceId,
      persona: "council",
      kind: "content-draft",
      source: "team", // work_orders.source CHECK: team|inbox|guru|manual — 'council' is NOT valid
      assetId: idea.id, // content_items id (asset_id is plain text)
      title: String(data.title).slice(0, 200),
      body: {
        title: data.title,
        body: data.body,
        ideaId: idea.id,
        brandKey: idea.brandKey || null,
        cadence: { week: cadence.week, published: cadence.published, goal: cadence.goal },
        model: data.model || null,
      },
      channel: "approval",
      gate: "human_approval",
      runId,
    });

    if (created.persisted) summary.drafted = 1;
    else summary.errored = 1;

    return NextResponse.json({ status: created.persisted ? "ok" : "error", ...summary });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { recordAutomationRun } from "@/lib/automation-runs";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleBrandContext } from "@/lib/sales-os/brand-context";
import { CONTENT_DRAFT_MODE, isContentDraftOk } from "@/lib/sales-os/draft-contract";
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
// 자동화 화면(automation_runs)에 남기는 이 크론의 안정 키·이름 — F-0 가시성(2026-09-03 R-2).
const AUTOMATION_KEY = "content-flywheel";
const AUTOMATION_NAME = "Content Flywheel · 콘텐츠 초안";
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

// 실행 본문 — 응답 봉투를 {body, httpStatus}로 돌려주고, GET이 automation_runs에 결과를 남긴다.
async function runContentFlywheel(workspaceId) {
  const summary = { cadenceBehind: false, drafted: 0, skipped: 0, errored: 0, idea: null };

  try {
    const context = await assembleBrandContext({ mode: CONTENT_DRAFT_MODE });
    if (!context || context.source !== "supabase") {
      return { body: { status: "skipped", reason: "missing-config-or-preview", ...summary } };
    }

    const cadence = context.content?.cadence || null;
    const behind = Boolean(cadence?.behind);
    summary.cadenceBehind = behind;

    // Only act when the cadence is actually behind goal — the point is to keep it alive, not
    // to flood the queue. On-track weeks are a clean no-op.
    if (!behind) {
      return { body: { status: "on-track", reason: "cadence-met", ...summary } };
    }

    // Neutralize the effectiveIdeaRank +30 classmoon (ClassIn sales brand) bias — the Council
    // lane is the operator's OWN brands. Prefer non-classmoon ideas; fall back only if none.
    const ideas = Array.isArray(context.content?.idea_queue_top) ? context.content.idea_queue_top : [];
    const ownIdeas = ideas.filter((i) => i && i.brandKey && i.brandKey !== "classmoon");
    const pool = ownIdeas.length ? ownIdeas : ideas;
    if (!pool.length) {
      return { body: { status: "skipped", reason: "no-ideas", ...summary } };
    }

    // Dedup: don't stack drafts. Skip ideas that already have an open 'proposed' content-draft
    // (keyed on work_orders.asset_id = the idea's content_items id).
    const existing = await getWorkOrders({ workspaceId, status: "proposed", limit: 200 });
    const openDraftAssetIds = new Set(
      (existing.orders || [])
        .filter((o) => o.kind === CONTENT_DRAFT_MODE && o.status === "proposed")
        .map((o) => o.assetId),
    );
    const idea = pool.find((i) => !openDraftAssetIds.has(i.id));
    if (!idea) {
      summary.skipped = pool.length;
      return { body: { status: "skipped", reason: "all-ideas-already-queued", ...summary } };
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
        mode: CONTENT_DRAFT_MODE,
        ref: idea.title,
        context: draftContext,
        maxOutputTokens: DRAFT_TOKENS,
      });
      data = engine.data;
      // Shared predicate — apps/hub/lib/sales-os/draft-contract.js, asserted against the
      // Engine's real response builder in draft-contract.test.mjs.
      ok = isContentDraftOk(engine.status, data);
    }

    if (!ok) {
      summary.errored = 1;
      await recordAgentRun({
        workspaceId,
        agent: "council",
        mode: CONTENT_DRAFT_MODE,
        ref: idea.id,
        inputSummary: `engine ${engine?.status} · ${data?.reason || "no-draft"}`,
        result: "error",
      });
      return { body: { status: "error", reason: "draft-failed", ...summary }, httpStatus: 502 };
    }

    // Mint the run first (createWorkOrder returns no id), then thread runId into the order.
    const run = await recordAgentRun({
      workspaceId,
      agent: "council",
      mode: CONTENT_DRAFT_MODE,
      ref: idea.id,
      inputSummary: `content-draft · ${idea.brandKey || "brand"} · ${idea.title}`,
      recommendation: { title: data.title, body: String(data.body).slice(0, 800) },
      emittedCount: 1,
    });
    const runId = run?.id || null;

    const created = await createWorkOrder({
      workspaceId,
      persona: "council",
      kind: CONTENT_DRAFT_MODE,
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

    return { body: { status: created.persisted ? "ok" : "error", ...summary } };
  } catch (error) {
    return { body: { status: "error", error: error instanceof Error ? error.message : String(error) }, httpStatus: 500 };
  }
}

export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const workspaceId = resolveDefaultWorkspaceId();
  const startedAt = new Date().toISOString();
  const { body, httpStatus = 200 } = await runContentFlywheel(workspaceId);

  // 매 실행을 automation_runs에 남긴다 — 실패(draft-failed·저장 실패)가 자동화 화면에 보이게.
  // 케이던스 충족·아이디어 없음 같은 no-op은 ignored로 남겨 "돌긴 돌았다"를 보인다.
  const runStatus = body.status === "ok" ? "success" : body.status === "error" ? "failure" : "ignored";
  await recordAutomationRun({
    workspaceId,
    key: AUTOMATION_KEY,
    name: AUTOMATION_NAME,
    status: runStatus,
    startedAt,
    correlationId: `${AUTOMATION_KEY}:${startedAt}`,
    input: { cadenceBehind: body.cadenceBehind ?? false, idea: body.idea ?? null },
    output: {
      summary: body.status === "ok"
        ? `초안 1건 · ${body.idea || "아이디어"}`
        : `${body.status}${body.reason ? ` · ${body.reason}` : ""}`,
      ...body,
    },
    errorMessage: runStatus === "failure" ? body.error || body.reason || "content-draft-failed" : null,
  });

  return NextResponse.json(body, { status: httpStatus });
}

import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { recordAutomationRun } from "@/lib/automation-runs";
import { getFollowups } from "@/lib/repositories/followups-ledger";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleSalesContext } from "@/lib/sales-os/context-assembler";
import { FOLLOWUP_DRAFT_MODE, isFollowupDraftOk } from "@/lib/sales-os/draft-contract";
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
// 자동화 화면(automation_runs)에 남기는 이 크론의 안정 키·이름 — F-0 가시성(2026-09-03 R-2).
const AUTOMATION_KEY = "followup-autopilot";
const AUTOMATION_NAME = "Guru Autopilot · 후속 초안";
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

  // 시크릿이 없으면 Engine은 open 모드로도 401을 준다 — 헤더 없이 보내면 설정 누락이
  // "초안 생성 실패"로 위장된다. lib/pms-engine-client.js와 같게 여기서 끊고 원인을 말한다.
  const secret = resolveSharedSecret();
  if (!secret) {
    return {
      status: 503,
      data: { status: "error", reason: "shared-secret-not-configured", error: "COM_MOON_SHARED_WEBHOOK_SECRET is not configured." },
    };
  }
  const headers = { "content-type": "application/json", "x-com-moon-shared-secret": secret };

  const response = await fetch(`${engineUrl}${ENGINE_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(60000),
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
    (o) => o.dealId === dealId && o.kind === FOLLOWUP_DRAFT_MODE && o.status === "proposed",
  );
}

// 실행 본문 — 응답 봉투를 {body, httpStatus}로 돌려주고, GET이 automation_runs에 결과를 남긴다.
async function runFollowupAutopilot(workspaceId) {
  const summary = { scanned: 0, drafted: 0, skipped: 0, errored: 0, deals: [], errorReason: null };

  try {
    // Source of truth for "who's stalled" — reuse the scoring, don't reimplement priorityFor.
    const follow = await getFollowups({ workspaceId, limit: 25 });
    if (follow.source !== "supabase") {
      // No Supabase (or no data) → honest no-op, not an error. Retry is the next schedule.
      return { body: { status: "skipped", reason: follow.configured ? "no-data" : "missing-config", ...summary } };
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

        const context = await assembleSalesContext({ mode: FOLLOWUP_DRAFT_MODE, ref: deal.id });

        // A paid generation is never retried automatically after an ambiguous result.
        let engine = null;
        let data = null;
        let ok = false;
        {
          engine = await callEngineDraft({
            mode: FOLLOWUP_DRAFT_MODE,
            ref: deal.id,
            context,
            maxOutputTokens: DRAFT_TOKENS,
          });
          data = engine.data;
          // Shared predicate — apps/hub/lib/sales-os/draft-contract.js, asserted against the
          // Engine's real response builder in draft-contract.test.mjs.
          ok = isFollowupDraftOk(engine.status, data);
        }

        if (!ok) {
          summary.errored += 1;
          // 첫 실패의 원인을 자동화 행까지 올린다 — 건수만으론 고칠 것을 읽을 수 없다.
          if (!summary.errorReason) summary.errorReason = data?.reason || `engine-${engine.status}`;
          await recordAgentRun({
            workspaceId,
            agent: "guru",
            mode: FOLLOWUP_DRAFT_MODE,
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
          mode: FOLLOWUP_DRAFT_MODE,
          ref: deal.id,
          inputSummary: `followup-draft · ${deal.name} · ${deal.why}`,
          recommendation: { subject: data.subject, body: String(data.body).slice(0, 800) },
          emittedCount: 1,
        });
        const runId = run?.id || null;

        const created = await createWorkOrder({
          workspaceId,
          persona: "guru",
          kind: FOLLOWUP_DRAFT_MODE,
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

    return { body: { status: "ok", ...summary } };
  } catch (error) {
    return { body: { status: "error", error: error instanceof Error ? error.message : String(error) }, httpStatus: 500 };
  }
}

export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const workspaceId = resolveDefaultWorkspaceId();
  const startedAt = new Date().toISOString();
  const { body, httpStatus = 200 } = await runFollowupAutopilot(workspaceId);

  // 매 실행을 automation_runs에 남긴다 — 이전에는 agent_runs(result='error')만 쌓여 몇 주간의
  // 매일 실패가 자동화 화면 어디에도 보이지 않았다. 초안 1건이라도 실패하면 failure.
  const errored = Number(body.errored || 0);
  const runStatus = body.status === "error" || errored > 0 ? "failure" : body.status === "ok" ? "success" : "ignored";
  // 기록은 결과를 남기는 것이지 결과를 만드는 것이 아니다 — 기록이 던지면 이미 만들어진
  // work_order가 크론 호출자에게 '실패'로 보이고 재시도가 붙는다. 실패는 로그로만 남긴다.
  await recordAutomationRun({
    workspaceId,
    key: AUTOMATION_KEY,
    name: AUTOMATION_NAME,
    status: runStatus,
    startedAt,
    correlationId: `${AUTOMATION_KEY}:${startedAt}`,
    input: { scanned: body.scanned ?? 0 },
    output: {
      summary: body.status === "ok"
        ? `초안 ${body.drafted ?? 0}건 · 건너뜀 ${body.skipped ?? 0} · 실패 ${errored}`
        : `${body.status}${body.reason ? ` · ${body.reason}` : ""}`,
      ...body,
    },
    errorMessage: runStatus === "failure"
      ? body.error || body.errorReason || `${errored}건 초안 실패 (Engine 응답 계약 또는 저장)`
      : null,
  }).catch((error) => {
    console.error("[cron] automation-run log failed", AUTOMATION_KEY, error);
  });

  return NextResponse.json(body, { status: httpStatus });
}

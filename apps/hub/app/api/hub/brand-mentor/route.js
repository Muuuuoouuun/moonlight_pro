import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleBrandContext } from "@/lib/sales-os/brand-context";
import { createWorkOrder } from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_PATH = "/api/ai/brand-mentor";

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

function resolveSharedSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || "";
}

async function callEngine(body) {
  const engineUrl = resolveEngineUrl();

  if (!engineUrl) {
    return {
      status: 202,
      data: { status: "preview", error: "COM_MOON_ENGINE_URL is not configured." },
    };
  }

  const headers = { "content-type": "application/json" };
  const sharedSecret = resolveSharedSecret();
  if (sharedSecret) {
    headers["x-com-moon-shared-secret"] = sharedSecret;
  }

  let response;
  try {
    response = await fetch(`${engineUrl}${ENGINE_PATH}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    // Engine configured but unreachable (down / wrong URL): degrade to a clean error the
    // client normalizes, instead of throwing a 500. Honest preview/error states are part
    // of the design (CLAUDE.md: never mix mock + live).
    return {
      status: 502,
      data: { status: "error", reason: `Engine 연결 실패: ${error instanceof Error ? error.message : String(error)}` },
    };
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  return { status: response.status, data };
}

// One-line fingerprint of the assembled brand context for the episodic-memory log.
function summarizeContext(ctx) {
  if (!ctx) return null;
  const p = Array.isArray(ctx.projects) ? ctx.projects.length : 0;
  const i = ctx.content?.idea_queue_top?.length || 0;
  const m = Array.isArray(ctx.missing) ? ctx.missing.length : 0;
  const cadence = ctx.content?.cadence_status ? " cadence=1" : "";
  return `src=${ctx.source} brand=${ctx.brand?.key || "-"} projects=${p} ideas=${i} missing=${m}${cadence}${ctx.focus ? " focus=1" : ""}`;
}

// Store a compact recommendation snapshot (jsonb) — cap large payloads so the log stays cheap.
function trimRecommendation(data) {
  if (data == null) return null;
  if (typeof data === "string") return { text: data.slice(0, 2000) };
  try {
    const json = JSON.stringify(data);
    return json.length <= 4000 ? data : { truncated: true, preview: json.slice(0, 2000) };
  } catch {
    return null;
  }
}

function resultStateFromStatus(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status === 202) return "needs_human"; // engine preview / not configured
  return "error";
}

function modeLabel(mode) {
  return ({
    "content-critique": "콘텐츠 검토",
    "brand-strategy": "브랜드 전략",
    "audience-analysis": "오디언스 분석",
    "meeting-synthesis": "회의록 정리",
    "flow-review": "플로우 점검",
  })[mode] || mode;
}

async function createCouncilWorkOrder({ mode, ref, context, data }) {
  if (data?.status !== "generated" || !data?.text) {
    return { persisted: false, reason: "not-generated" };
  }

  return createWorkOrder({
    persona: "council",
    kind: "brand_next_action",
    title: `Council ${modeLabel(mode)} 승인 필요${ref ? ` · ${ref}` : ""}`,
    body: {
      mode,
      ref,
      gate: "human_approval",
      lane: "brand_work",
      summary: data.text.slice(0, 2000),
      brand: context?.brand?.key || null,
      contextSummary: summarizeContext(context),
      policy: {
        noDirectPublish: true,
        publishRequiresApproval: true,
      },
    },
    gate: "human_approval",
    source: "team",
    channel: "approval",
  });
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) {
    return guard;
  }

  const parsed = await readHubWriteJson(req);
  if (parsed.error) {
    return parsed.error;
  }

  const input = parsed.data || {};
  const mode = typeof input.mode === "string" ? input.mode.trim() : "brand-strategy";
  const ref = typeof input.ref === "string" ? input.ref.trim() || null : null;
  const draft = typeof input.draft === "string" ? input.draft : null;

  const context = await assembleBrandContext({ mode, ref, draft });
  const result = await callEngine({ mode, ref, draft, context });
  const workOrder = await createCouncilWorkOrder({ mode, ref, context, data: result.data });

  // Episodic memory: log what the Council recommended so the next call can remember it (best-effort).
  try {
    await recordAgentRun({
      agent: "council",
      mode,
      ref,
      inputSummary: summarizeContext(context),
      recommendation: trimRecommendation(result.data),
      emittedCount: workOrder?.persisted ? 1 : 0,
      result: resultStateFromStatus(result.status),
    });
  } catch {
    // logging is best-effort — never let it break the advisory response.
  }

  const data = result.data && typeof result.data === "object"
    ? { ...result.data, workOrder }
    : result.data;
  return NextResponse.json(data, { status: result.status });
}

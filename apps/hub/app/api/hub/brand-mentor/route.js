import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { recordAgentRun, setAgentRunEmittedCount } from "@/lib/sales-os/agent-runs";
import { assembleBrandContext } from "@/lib/sales-os/brand-context";
import { createWorkOrder } from "@/lib/sales-os/work-orders";
import { advisorRunResult } from "@/lib/sales-os/advisor-result";
import { isGuidanceCardForDomain, isValidAdvisorInput } from "@/lib/advisor-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_PATH = "/api/ai/brand-mentor";
const OFFICE_REVIEW_DRAFT_LIMIT = 6000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function parseOfficeSource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["requestId", "runId"].includes(key))
    || typeof value.requestId !== "string" || !UUID.test(value.requestId)
    || (value.runId != null && (typeof value.runId !== "string" || !UUID.test(value.runId)))) return null;
  return { requestId: value.requestId, runId: value.runId ?? null };
}

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

function resolveSharedSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || "";
}

async function callEngine(body, { retries = 1 } = {}) {
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

  const attempts = Math.max(0, Math.min(retries, 2));
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${engineUrl}${ENGINE_PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
        redirect: "error",
      });
      if (!response.ok && attempt < attempts && (response.status === 502 || response.status === 503)) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text || null;
      }
      return { status: response.status, data };
    } catch {
      if (attempt < attempts) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      return {
        status: 502,
        data: { status: "error", reason: "engine-request-failed" },
      };
    }
  }
  return {
    status: 502,
    data: { status: "error", reason: "engine-request-failed" },
  };
}

// One-line fingerprint of the assembled brand context for the episodic-memory log.
function summarizeContext(ctx, legendIds) {
  if (!ctx) return null;
  const p = Array.isArray(ctx.projects) ? ctx.projects.length : 0;
  const i = ctx.content?.idea_queue_top?.length || 0;
  const m = Array.isArray(ctx.missing) ? ctx.missing.length : 0;
  const cadence = ctx.content?.cadence_status ? " cadence=1" : "";
  const legends = Array.isArray(legendIds) && legendIds.length ? ` legends=${legendIds.join(",")}` : "";
  return `src=${ctx.source} brand=${ctx.brand?.key || "-"} projects=${p} ideas=${i} missing=${m}${cadence}${ctx.focus ? " focus=1" : ""}${legends}`;
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

function modeLabel(mode) {
  return ({
    "content-critique": "콘텐츠 검토",
    "brand-strategy": "브랜드 전략",
    "audience-analysis": "오디언스 분석",
    "meeting-synthesis": "회의록 정리",
    "flow-review": "플로우 점검",
    "sparring": "3자 토론",
  })[mode] || mode;
}

async function createCouncilWorkOrder({ mode, ref, context, data, runId, legendIds }) {
  if (data?.status !== "generated" || !data?.text) {
    return { persisted: false, reason: "not-generated" };
  }

  const councilNextAction = data?.council?.nextAction;

  return createWorkOrder({
    persona: "council",
    runId,
    kind: "brand_next_action",
    title: `Council ${modeLabel(mode)} 승인 필요${ref ? ` · ${ref}` : ""}`,
    body: {
      mode,
      ref,
      gate: "human_approval",
      lane: "brand_work",
      summary: (councilNextAction ? `[차기 조치] ${councilNextAction}\n\n` : "") + data.text.slice(0, 2000),
      council: data?.council || null,
      brand: context?.brand?.key || null,
      contextSummary: summarizeContext(context, legendIds),
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

  const input = parsed.data;
  if (!isValidAdvisorInput(input)) {
    return NextResponse.json({ status: "error", error: "자문 설정의 형식을 확인해 주세요." }, { status: 400 });
  }
  if (input.createWorkOrder !== undefined && typeof input.createWorkOrder !== "boolean") {
    return NextResponse.json({ status: "error", error: "invalid-create-work-order" }, { status: 400 });
  }
  const mode = typeof input.mode === "string" ? input.mode.trim() : "brand-strategy";
  const ref = typeof input.ref === "string" ? input.ref.trim() || null : null;
  const draft = typeof input.draft === "string" ? input.draft : null;
  const legendIds = Array.isArray(input.legendIds) ? input.legendIds : undefined;
  const directives = input.directives && typeof input.directives === "object" ? input.directives : undefined;
  const values = input.values && typeof input.values === "object" ? input.values : undefined;
  const knowledge = input.knowledge && typeof input.knowledge === "object" ? input.knowledge : undefined;
  const guidanceId = typeof input.guidanceId === "string" ? input.guidanceId : undefined;
  const officeSource = mode === "office-review" ? parseOfficeSource(input.officeSource) : null;
  if (mode === "office-review" && (
    input.scope !== "personal" || !officeSource || !draft?.trim() || draft.length > OFFICE_REVIEW_DRAFT_LIMIT
    || input.createWorkOrder !== false || input.guidanceId != null || (legendIds?.length || 0) > 0
    || input.directives != null || input.values != null || input.knowledge != null
  )) {
    return NextResponse.json({ status: "error", error: "invalid-office-review" }, { status: 400 });
  }
  if (mode === "open-question" && (
    !isGuidanceCardForDomain(guidanceId, ["marketing", "content"])
    || !draft?.trim()
    || input.createWorkOrder === true
    || (legendIds?.length || 0) > 0
  )) {
    return NextResponse.json({ status: "error", error: "질문과 마케팅·콘텐츠 카드 출처를 확인해 주세요." }, { status: 400 });
  }

  const context = await assembleBrandContext({ mode, ref, draft, guidanceId });
  if ((mode === "open-question" || mode === "office-review") && ["preview", "error"].includes(context?.source)) {
    return NextResponse.json(
      { status: context.source, error: context.error || "브랜드 자료를 읽을 수 없습니다." },
      { status: context.source === "preview" ? 202 : 502 },
    );
  }
  if (mode === "open-question" && ref && (
    context?.focus?.found !== true
    || context.focus.kind !== "brand"
    || context?.brand?.key !== ref
  )) {
    return NextResponse.json(
      { status: "error", error: "선택한 개인 브랜드를 현재 원장에서 확인할 수 없습니다." },
      { status: 409 },
    );
  }
  const result = await callEngine({
    mode, ref, draft, context, legendIds, directives, values, knowledge, guidanceId,
    ...(officeSource ? { scope: "personal", officeSource, createWorkOrder: false } : {}),
  });
  // Keep requested Guru questions separate from ordinary Council advice in episodic memory.
  let run = { persisted: false, id: null, reason: "agent-run-write-failed" };
  try {
    run = await recordAgentRun({
      agent: mode === "open-question" ? "guru.brand" : "council",
      mode,
      ref,
      inputSummary: `${summarizeContext(context, legendIds) || ""}${officeSource ? ` office-request=${officeSource.requestId}${officeSource.runId ? ` office-run=${officeSource.runId}` : ""}` : ""}`.trim(),
      recommendation: trimRecommendation(result.data),
      result: advisorRunResult(result.status, result.data),
    });
  } catch {
    // logging is best-effort — never let it break the advisory response.
  }

  let workOrder = { persisted: false, reason: "not-requested" };
  // Advice is the default. Only an explicit proposal request enters the work-order queue.
  if (input.createWorkOrder === true) {
    if (advisorRunResult(result.status, result.data) !== "ok") {
      workOrder = { persisted: false, reason: "not-generated" };
    } else {
      try {
        workOrder = await createCouncilWorkOrder({ mode, ref, context, data: result.data, runId: run?.id || null, legendIds });
      } catch {
        workOrder = { persisted: false, reason: "work-order-write-failed" };
      }
    }
  }
  let emissionRecorded = null;
  if (workOrder?.persisted && run?.id) {
    try {
      emissionRecorded = Boolean((await setAgentRunEmittedCount({ runId: run.id, count: 1 }))?.persisted);
    } catch { emissionRecorded = false; }
  }

  const data = result.data && typeof result.data === "object"
    ? { ...result.data, workOrder, runId: run?.id || null, memory: { persisted: Boolean(run?.persisted), reason: run?.reason || null, emissionRecorded } }
    : result.data;
  return NextResponse.json(data, { status: result.status });
}

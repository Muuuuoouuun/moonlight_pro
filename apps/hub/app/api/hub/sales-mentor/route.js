import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleSalesContext } from "@/lib/sales-os/context-assembler";
import { advisorRunResult } from "@/lib/sales-os/advisor-result";
import { isGuidanceCardForDomain, isValidAdvisorInput } from "@/lib/advisor-input";
import { OFFICE_MENTOR_DRAFT_LIMIT } from "@/components/hub/office-mentor-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_PATH = "/api/ai/sales-mentor";
// A company-scope Office escalation is an open question that names its Office source.
// It carries the Office result verbatim, like the personal lane's office-review.
const OFFICE_SOURCE_DRAFT_LIMIT = OFFICE_MENTOR_DRAFT_LIMIT;
// JSON may spend up to 6 bytes per UTF-16 unit (\uXXXX escapes; Korean needs 3), so any
// draft within the character limit fits. Every other caller keeps the default 64 KiB cap.
const OFFICE_SOURCE_MAX_JSON_BYTES = 160 * 1024;
const DEFAULT_MAX_JSON_BYTES = 64 * 1024;
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

  const response = await fetch(`${engineUrl}${ENGINE_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
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

// One-line fingerprint of the assembled context for the episodic-memory log.
function summarizeContext(ctx) {
  if (!ctx) return null;
  const d = Array.isArray(ctx.deals) ? ctx.deals.length : 0;
  const l = Array.isArray(ctx.leads) ? ctx.leads.length : 0;
  const o = ctx.outcomes?.recent?.length || 0;
  const m = Array.isArray(ctx.missing) ? ctx.missing.length : 0;
  return `src=${ctx.source} deals=${d} leads=${l} outcomes=${o} missing=${m}${ctx.focus ? " focus=1" : ""}`;
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

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) {
    return guard;
  }

  const parsed = await readHubWriteJson(req, { maxBytes: OFFICE_SOURCE_MAX_JSON_BYTES });
  if (parsed.error) {
    return parsed.error;
  }

  const input = parsed.data;
  const fromOffice = input?.officeSource !== undefined;
  if (parsed.byteLength > DEFAULT_MAX_JSON_BYTES && !fromOffice) {
    return NextResponse.json(
      { status: "payload-too-large", error: `JSON payload must be ${DEFAULT_MAX_JSON_BYTES} bytes or smaller.` },
      { status: 413 },
    );
  }
  if (!isValidAdvisorInput(input)) {
    return NextResponse.json({ status: "error", error: "자문 설정의 형식을 확인해 주세요." }, { status: 400 });
  }
  const mode = typeof input.mode === "string" ? input.mode.trim() : "pipeline-triage";
  const ref = typeof input.ref === "string" ? input.ref.trim() || null : null;
  const draft = typeof input.draft === "string" ? input.draft : null;
  const officeSource = fromOffice ? parseOfficeSource(input.officeSource) : null;
  if (fromOffice && (
    mode !== "open-question" || input.scope !== "classin" || !officeSource
    || !draft?.trim() || draft.length > OFFICE_SOURCE_DRAFT_LIMIT
    || input.createWorkOrder !== false || input.guidanceId != null
    || (Array.isArray(input.legendIds) ? input.legendIds.length : 0) > 0
    || input.directives != null || input.values != null || input.knowledge != null
  )) {
    return NextResponse.json({ status: "error", error: "invalid-office-review" }, { status: 400 });
  }
  if (input.guidanceId != null && !isGuidanceCardForDomain(input.guidanceId, ["sales"])) {
    return NextResponse.json({ status: "error", error: "세일즈 카드만 영업 Guru에 사용할 수 있습니다." }, { status: 400 });
  }
  const directives = input.directives && typeof input.directives === "object" ? input.directives : undefined;
  const values = input.values && typeof input.values === "object" ? input.values : undefined;
  const knowledge = input.knowledge && typeof input.knowledge === "object" ? input.knowledge : undefined;
  const guidanceId = typeof input.guidanceId === "string" ? input.guidanceId : undefined;

  const context = await assembleSalesContext({ mode, ref });
  if (mode === "open-question" && ["preview", "error"].includes(context?.source)) {
    return NextResponse.json(
      { status: context.source, error: context.error || "영업 자료를 읽을 수 없습니다." },
      { status: context.source === "preview" ? 202 : 502 },
    );
  }
  let result;
  try {
    result = await callEngine({
      mode, ref, draft, context, directives, values, knowledge, guidanceId,
      ...(officeSource ? { scope: "classin", officeSource, createWorkOrder: false } : {}),
    });
  }
  catch { result = { status: 502, data: { status: "error", reason: "engine-request-failed" } }; }

  // Episodic memory: log what Guru recommended so the next call can remember it (best-effort).
  let runId = null;
  try {
    const run = await recordAgentRun({
      agent: "guru",
      mode,
      ref,
      // Same provenance marks as the personal lane's office-review run.
      inputSummary: officeSource
        ? `${summarizeContext(context) || ""} office-request=${officeSource.requestId}${officeSource.runId ? ` office-run=${officeSource.runId}` : ""}`.trim()
        : summarizeContext(context),
      recommendation: trimRecommendation(result.data),
      result: advisorRunResult(result.status, result.data),
    });
    runId = run?.id || null;
  } catch {
    // logging is best-effort — never let it break the coaching response.
  }

  // runId rides along so whoever turns this coaching into a work order can set
  // work_orders.run_id — the hook that makes outcome→run attribution live.
  const payload =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? { ...result.data, runId }
      : result.data;
  return NextResponse.json(payload, { status: result.status });
}

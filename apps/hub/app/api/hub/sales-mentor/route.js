import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleSalesContext } from "@/lib/sales-os/context-assembler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_PATH = "/api/ai/sales-mentor";

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

function resultStateFromStatus(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status === 202) return "needs_human"; // engine preview / not configured
  return "error";
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
  const mode = typeof input.mode === "string" ? input.mode.trim() : "pipeline-triage";
  const ref = typeof input.ref === "string" ? input.ref.trim() || null : null;
  const draft = typeof input.draft === "string" ? input.draft : null;

  const context = await assembleSalesContext({ mode, ref });
  const result = await callEngine({ mode, ref, draft, context });

  // Episodic memory: log what Guru recommended so the next call can remember it (best-effort).
  try {
    await recordAgentRun({
      agent: "guru",
      mode,
      ref,
      inputSummary: summarizeContext(context),
      recommendation: trimRecommendation(result.data),
      result: resultStateFromStatus(result.status),
    });
  } catch {
    // logging is best-effort — never let it break the coaching response.
  }

  return NextResponse.json(result.data, { status: result.status });
}

import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { recordAgentRun } from "@/lib/sales-os/agent-runs";
import { assembleBrandContext } from "@/lib/sales-os/brand-context";
import { advisorRunResult } from "@/lib/sales-os/advisor-result";
import { fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_PATH = "/api/ai/persona-chat";

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
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
  } catch {
    return {
      status: 502,
      data: { status: "error", reason: "engine-request-failed" },
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

// Assemble lightweight snapshot context based on persona and mode
async function assemblePersonaContext({ personaId, mode }) {
  // These requests describe one contact in draft (or an explicit context).
  // A recent-deals snapshot can introduce a different customer into the answer.
  if (mode === "outreach-draft" || mode === "extract-contact-outcome") {
    return null;
  }

  // If brand-related or content/production
  if (personaId === "content" || personaId === "production" || personaId === "council") {
    try {
      const brandCtx = await assembleBrandContext({ mode });
      return brandCtx;
    } catch {
      // fallback to basic
    }
  }

  // Weekly review context: read recent tasks and outcomes
  if (mode === "weekly-review") {
    try {
      const [tasks, updates] = await Promise.all([
        fetchSupabaseRows("tasks", {
          filters: withWorkspaceFilter(),
          order: "created_at.desc",
          limit: 20,
        }),
        fetchSupabaseRows("project_updates", {
          filters: withWorkspaceFilter(),
          order: "happened_at.desc",
          limit: 15,
        }),
      ]);
      return {
        source: "supabase",
        kind: "weekly-review-snapshot",
        recentTasks: Array.isArray(tasks) ? tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })) : [],
        recentUpdates: Array.isArray(updates) ? updates.map((u) => ({ title: u.title, summary: u.summary, happened_at: u.happened_at })) : [],
      };
    } catch {
      return { source: "preview", kind: "weekly-review-snapshot" };
    }
  }

  // Sales / Order context
  try {
    const deals = await fetchSupabaseRows("deals", {
      filters: withWorkspaceFilter(),
      order: "updated_at.desc",
      limit: 15,
    });
    return {
      source: "supabase",
      persona: personaId,
      deals: Array.isArray(deals) ? deals.map((d) => ({ name: d.name, stage: d.stage, value: d.value, nextAction: d.next_action })) : [],
    };
  } catch {
    return { source: "preview", persona: personaId };
  }
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
  const personaId = typeof input.personaId === "string" ? input.personaId.trim() : "order";
  const mode = typeof input.mode === "string" ? input.mode.trim() : "advice";
  const lens = typeof input.lens === "string" ? input.lens.trim() || null : null;
  const message = typeof input.message === "string" ? input.message : null;
  const draft = typeof input.draft === "string" ? input.draft : null;
  const conversationOnly = input.conversationOnly === true;
  const customContext = input.context && typeof input.context === "object" ? input.context : null;

  const context = conversationOnly
    ? customContext || { source: "operator-provided", scope: "unscoped" }
    : customContext || (await assemblePersonaContext({ personaId, mode }));
  const result = await callEngine({ personaId, mode, lens, message, draft, context, conversationOnly });

  // Best-effort episodic memory logging
  let run = { persisted: false, id: null };
  try {
    run = await recordAgentRun({
      agent: `persona.${personaId}`,
      mode,
      ref: lens ? `lens=${lens}` : null,
      inputSummary: `mode=${mode} lens=${lens || "none"} msg=${(message || "").slice(0, 50)}`,
      recommendation: result.data && typeof result.data === "object" ? { text: (result.data.text || "").slice(0, 2000) } : null,
      result: advisorRunResult(result.status, result.data),
    });
  } catch {
    // logging is best-effort
  }

  const data = result.data && typeof result.data === "object"
    ? { ...result.data, runId: run?.id || null }
    : result.data;

  return NextResponse.json(data, { status: result.status });
}

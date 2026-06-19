import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";

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

const trim = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

// Build a compact sales context from the existing revenue ledger so the Engine
// route stays focused on the LLM + persistence (see plan §7.1 / §7.2).
async function buildSalesContext(mode, ref) {
  let ledger;
  try {
    ledger = await getRevenueLedger();
  } catch (error) {
    return { source: "preview", error: error instanceof Error ? error.message : String(error) };
  }

  const context = {
    source: ledger.source,
    summary: ledger.summary || null,
    stages: ledger.stages || [],
    deals: trim(ledger.deals, 40),
    leads: trim(ledger.leads, 40),
    accounts: trim(ledger.accounts, 40),
    cases: trim(ledger.cases, 20),
  };

  if (ref && mode === "deal-review") {
    const needle = ref.toLowerCase();
    context.focus = {
      ref,
      deals: (ledger.deals || []).filter(
        (d) => String(d.id).toLowerCase() === needle || (d.name || "").toLowerCase().includes(needle),
      ),
      accounts: (ledger.accounts || []).filter((a) => (a.name || "").toLowerCase().includes(needle)),
    };
  }

  return context;
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

  const context = await buildSalesContext(mode, ref);
  const result = await callEngine({ mode, ref, draft, context });

  return NextResponse.json(result.data, { status: result.status });
}

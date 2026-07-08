// eeoCRM (Xiaoshouyi personal MCP) sync — real pipeline -> staging -> promote(dedupe).
//
// Mirrors sheets-sync.js's import -> staging -> promote model exactly: eeoCRM leads land in
// `lead_intake_raw` first, then the SAME `promoteStagedLeads` creates/links companies+leads.
// This is the one real CRM data source (105 leads / 24 accounts / 18 orders for this operator);
// everything else (Guru, personas, Daily Brief, followup scoring) reads off `leads`, so this
// is the upstream fix — see memory `sales-os-deep-map-findings`.
//
// Local-only by construction: the personal OAuth token lives in `~/.neocrm/credentials.json`,
// decrypted only by the eeoCRM MCP server itself (machine-bound). This module never touches
// that file — it talks to the already-running local MCP server over SSE, same as a human
// operator would. Requires `cd C:/Projects/eeocrm-personal && npm run dev` to be running.

import { Client } from "@modelcontextprotocol/sdk/client";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import {
  countSupabaseRows,
  eqFilter,
  fetchSupabaseRows,
  withWorkspaceFilter,
} from "@/lib/server-read";
import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";
import { computeMatchKey, normalizeName, normalizePhone } from "@/lib/sheets-normalize";
import { recordGoogleSheetsSync } from "@/lib/google-sheets";
import { promoteStagedLeads } from "@/lib/repositories/sheets-sync";

const STAGING_TABLE = "lead_intake_raw";
const PROVIDER = "eeocrm";
const OWNER_ID = "3935704427463307"; // 문준혁 — eeoCRM ownerId, see lib/external-crm/owner-names.js
const PAGE_SIZE = 100; // XOQL hard cap per the tool's own contract
const DEFAULT_MAX_PAGES = 5; // 500 leads/run ceiling — surfaced as `truncated`, never silently dropped

// eeoCRM lead.status is a numeric code (see eeocrm-personal/_build_sheets.mjs KO map).
const STATUS_CODE_TO_LEAD_STATUS = {
  1: "new",       // 미접촉
  2: "nurturing", // 접촉함
  3: "lost",      // 무효
  4: "won",       // 전환완료
  5: "nurturing", // 진행중
  16: "nurturing",
};

function resolveMcpUrl() {
  return process.env.EEOCRM_MCP_URL?.trim() || "http://localhost:3010/sse";
}

async function withEeocrmClient(fn) {
  const url = resolveMcpUrl();
  let client = null;
  try {
    client = new Client({ name: "moonlight-hub", version: "1.0.0" });
    const transport = new SSEClientTransport(new URL(url));
    await client.connect(transport);
    return await fn(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "mcp-unreachable", detail: message, mcpUrl: url };
  } finally {
    try { await client?.close(); } catch { /* best-effort teardown */ }
  }
}

function looksLikeAuthExpired(text) {
  return /登录|过期|Token|未找到个人凭证/i.test(text || "");
}

// Calls an eeoCRM MCP tool and classifies the outcome — distinguishes "server not
// running" (mcp-unreachable, from withEeocrmClient) from "server up but personal
// token stale" (auth-expired) so the UI can tell the operator which fix applies:
// start `npm run dev`, or re-run `npm run login` in eeocrm-personal.
async function callEeocrmTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = result?.content?.[0]?.text || "";
  if (result?.isError) {
    return { ok: false, reason: looksLikeAuthExpired(text) ? "auth-expired" : "query-failed", detail: text };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "query-failed", detail: "non-json tool response" };
  }
  const records = parsed?.data?.records || parsed?.records || [];
  return { ok: true, records: Array.isArray(records) ? records : [] };
}

function buildLeadSoql({ ownerId, offset, limit }) {
  return `SELECT id, name, companyName, mobile, email, status, createdAt FROM lead WHERE ownerId = '${ownerId}' LIMIT ${offset},${limit}`;
}

// Maps one eeoCRM lead record to the same `normalized` intake shape sheets-normalize.js
// produces, so promoteStagedLeads (companies/contacts/leads + dedupe) needs zero changes.
// eeoCRM shape: companyName = institution, name = the lead/decision-maker's own name —
// same institution+person split card-intake-core.js already uses.
function mapEeocrmLeadToIntake(record) {
  const institution = normalizeName(record.companyName) || normalizeName(record.name);
  const contactName = record.companyName ? normalizeName(record.name) : null;
  const phone = normalizePhone(record.mobile);
  const email = record.email ? String(record.email).trim() || null : null;
  const status = STATUS_CODE_TO_LEAD_STATUS[Number(record.status)] || "new";
  const createdTime = record.createdAt ? new Date(Number(record.createdAt)).toISOString() : null;

  return {
    name: institution,
    phone,
    address: null,
    contact_name: contactName,
    email,
    external_id: record.id != null ? String(record.id) : null,
    status,
    source: PROVIDER,
    channel: "eeoCRM",
    created_time: createdTime,
    note: null,
    extra: {},
    match_key: computeMatchKey({ phone: record.mobile, name: institution, address: null }),
  };
}

async function recordEeocrmSync({ workspaceId, status, payload, errorMessage = null }) {
  return recordGoogleSheetsSync({
    workspaceId,
    status,
    payload: { provider: PROVIDER, ...payload },
    errorMessage,
  });
}

// --- status -------------------------------------------------------------------

export async function getEeocrmSyncStatus(workspaceId = resolveDefaultWorkspaceId()) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { source: "preview", configured: Boolean(config), staging: {}, recentRuns: [], mcpUrl: resolveMcpUrl() };
  }

  const [recentRuns, pending, promoted, merged, review] = await Promise.all([
    fetchSupabaseRows("sync_runs", {
      filters: withWorkspaceFilter([["payload->>provider", eqFilter(PROVIDER)]]),
      order: "started_at.desc",
      limit: 10,
    }),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("pending")], ["source", eqFilter(PROVIDER)]])),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("promoted")], ["source", eqFilter(PROVIDER)]])),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("merged")], ["source", eqFilter(PROVIDER)]])),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("review")], ["source", eqFilter(PROVIDER)]])),
  ]);

  const runs = recentRuns || [];
  const lastSuccess = runs.find((r) => r.status === "success" && r.payload?.action === "import");

  return {
    source: "supabase",
    configured: true,
    mcpUrl: resolveMcpUrl(),
    ownerId: OWNER_ID,
    lastSyncAt: lastSuccess?.started_at || null,
    staging: { pending: pending ?? 0, promoted: promoted ?? 0, merged: merged ?? 0, review: review ?? 0 },
    recentRuns: runs.map((r) => ({
      status: r.status,
      action: r.payload?.action || null,
      startedAt: r.started_at,
      error: r.error_message || null,
    })),
  };
}

// --- import: eeoCRM -> staging --------------------------------------------------

export async function importEeocrmLeadsToStaging({
  workspaceId = resolveDefaultWorkspaceId(),
  maxPages = DEFAULT_MAX_PAGES,
} = {}) {
  if (!workspaceId) return { ok: false, reason: "missing-workspace" };
  if (!resolveSupabaseConfig()) return { ok: false, reason: "missing-config" };

  const result = await withEeocrmClient(async (client) => {
    let imported = 0;
    let skipped = 0;
    let total = 0;
    let truncated = false;

    for (let page = 0; page < maxPages; page += 1) {
      const soql = buildLeadSoql({ ownerId: OWNER_ID, offset: page * PAGE_SIZE, limit: PAGE_SIZE });
      const queryResult = await callEeocrmTool(client, "crm_soql_query", { soql });
      if (!queryResult.ok) return queryResult;

      const records = queryResult.records;
      total += records.length;

      for (const record of records) {
        const normalized = mapEeocrmLeadToIntake(record);
        if (!normalized.match_key) {
          skipped += 1;
          continue;
        }
        const sourceRef = `eeocrm:lead:${record.id}`;
        const inserted = await insertSupabaseRecord(STAGING_TABLE, {
          workspace_id: workspaceId,
          source: PROVIDER,
          source_ref: sourceRef,
          raw: record,
          normalized: { ...normalized, source_ref: sourceRef },
          match_key: normalized.match_key,
          status: "pending",
        });
        if (inserted.persisted) imported += 1;
        else skipped += 1; // includes http-409 (already staged — idempotent re-run)
      }

      if (records.length < PAGE_SIZE) break;
      if (page === maxPages - 1) truncated = true;
    }

    return { ok: true, imported, skipped, total, truncated };
  });

  await recordEeocrmSync({
    workspaceId,
    status: result.ok ? "success" : "failure",
    payload: { action: "import", ...result },
    errorMessage: result.ok ? null : (result.detail || result.reason),
  });

  return result;
}

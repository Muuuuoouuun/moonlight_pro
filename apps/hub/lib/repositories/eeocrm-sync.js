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
  updateSupabaseRecord,
} from "@/lib/server-write";
import { computeMatchKey, normalizeName, normalizePhone } from "@/lib/sheets-normalize";
import { recordGoogleSheetsSync } from "@/lib/google-sheets";
import { promoteStagedLeads } from "@/lib/repositories/sheets-sync";
import { assertEeocrmOwnerId, resolveEeocrmOwnerId } from "@/lib/sales-os/operator-scope";
import { extractEeocrmRecords } from "@/lib/external-crm/eeocrm-response";

const STAGING_TABLE = "lead_intake_raw";
const PROVIDER = "eeocrm";
const OWNER_ID = resolveEeocrmOwnerId(); // 문준혁 — eeoCRM ownerId, see lib/external-crm/owner-names.js
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

function compactMeta(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string" && !value.trim()) return false;
      return true;
    }),
  );
}

function normalizeEeocrmPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return normalizePhone(raw.replace(/^0082/, "0"));
}

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
  return { ok: true, records: extractEeocrmRecords(parsed) };
}

function buildLeadSoql({ ownerId, offset, limit }) {
  return `SELECT id, name, companyName, mobile, email, status, createdAt FROM lead WHERE ownerId = '${ownerId}' LIMIT ${offset},${limit}`;
}

function buildAccountSoql({ ownerId, offset, limit }) {
  return `SELECT id, accountName, ownerId, entityType, phone, address, createdAt FROM account WHERE ownerId = '${ownerId}' LIMIT ${offset},${limit}`;
}

function buildContactSoql({ ownerId, offset, limit }) {
  return `SELECT id, contactName, mobile, email, accountId, ownerId, createdAt FROM contact WHERE ownerId = '${ownerId}' LIMIT ${offset},${limit}`;
}

function buildOpportunitySoql({ ownerId, offset, limit }) {
  return `SELECT id, opportunityName, money, ownerId, accountId, saleStageId, status, closeDate, createdAt, updatedAt FROM opportunity WHERE ownerId = '${ownerId}' LIMIT ${offset},${limit}`;
}

function buildOrderSoql({ ownerId, offset, limit }) {
  return `SELECT id, accountId, opportunityId, amount, ownerId, transactionDate, createdAt FROM order WHERE ownerId = '${ownerId}' LIMIT ${offset},${limit}`;
}

function buildActivitySoql({ ownerId, offset, limit }) {
  return `SELECT id, content, startTime, entityType, dbcRelation26, ownerId FROM activityrecord WHERE ownerId = '${ownerId}' LIMIT ${offset},${limit}`;
}

// Maps one eeoCRM lead record to the same `normalized` intake shape sheets-normalize.js
// produces, so promoteStagedLeads (companies/contacts/leads + dedupe) needs zero changes.
// eeoCRM shape: companyName = institution, name = the lead/decision-maker's own name —
// same institution+person split card-intake-core.js already uses.
function mapEeocrmLeadToIntake(record) {
  const institution = normalizeName(record.companyName) || normalizeName(record.name);
  const contactName = record.companyName ? normalizeName(record.name) : null;
  const phone = normalizeEeocrmPhone(record.mobile);
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

function mapEeocrmAccountToCompany(record) {
  const name = normalizeName(record.accountName);
  const phone = normalizeEeocrmPhone(record.phone);
  const address = record.address ? String(record.address).trim() || null : null;

  return {
    name,
    phone,
    address,
    match_key: computeMatchKey({ phone, name, address }),
    meta: compactMeta({
      source: PROVIDER,
      source_transport: "eeocrm",
      source_family: "eeocrm_account",
      lane: "classin_sales",
      eeocrm_account_id: record.id != null ? String(record.id) : null,
      eeocrm_owner_id: record.ownerId != null ? String(record.ownerId) : null,
      eeocrm_entity_type: record.entityType != null ? String(record.entityType) : null,
      eeocrm_created_at: record.createdAt != null ? String(record.createdAt) : null,
    }),
  };
}

function timestampFromMillis(value) {
  if (value == null || value === "") return null;
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stageForEeocrmOpportunity(record) {
  const status = String(record.status ?? "").trim();
  if (status === "2") return "won";
  if (status === "3") return "lost";
  return "proposal";
}

function mapEeocrmOpportunityToDeal(record, company = null) {
  const stage = stageForEeocrmOpportunity(record);
  const occurredAt = timestampFromMillis(record.updatedAt || record.createdAt);
  const closedAt = timestampFromMillis(record.closeDate);

  return {
    title: normalizeName(record.opportunityName) || `eeoCRM opportunity ${record.id}`,
    amount: numberOrZero(record.money),
    currency: "CNY",
    stage,
    company_id: company?.id || null,
    expected_close_at: closedAt,
    last_activity_at: occurredAt,
    won_at: stage === "won" ? closedAt || occurredAt : null,
    lost_at: stage === "lost" ? closedAt || occurredAt : null,
    meta: compactMeta({
      source: PROVIDER,
      source_transport: "eeocrm",
      source_family: "eeocrm_opportunity",
      lane: "classin_sales",
      eeocrm_opportunity_id: record.id != null ? String(record.id) : null,
      eeocrm_account_id: record.accountId != null ? String(record.accountId) : null,
      eeocrm_owner_id: record.ownerId != null ? String(record.ownerId) : null,
      eeocrm_sale_stage_id: record.saleStageId != null ? String(record.saleStageId) : null,
      eeocrm_status: record.status != null ? String(record.status) : null,
      revenue_cny: record.money != null ? numberOrZero(record.money) : null,
      currency: "CNY",
    }),
  };
}

function mapEeocrmOrderToDeal(record, company = null) {
  const occurredAt = timestampFromMillis(record.transactionDate || record.createdAt);

  return {
    title: `eeoCRM order ${record.id}`,
    amount: numberOrZero(record.amount),
    currency: "CNY",
    stage: "won",
    company_id: company?.id || null,
    expected_close_at: occurredAt,
    last_activity_at: occurredAt,
    won_at: occurredAt,
    meta: compactMeta({
      source: PROVIDER,
      source_transport: "eeocrm",
      source_family: "eeocrm_order",
      lane: "classin_sales",
      eeocrm_order_id: record.id != null ? String(record.id) : null,
      eeocrm_account_id: record.accountId != null ? String(record.accountId) : null,
      eeocrm_opportunity_id: record.opportunityId != null ? String(record.opportunityId) : null,
      eeocrm_owner_id: record.ownerId != null ? String(record.ownerId) : null,
      revenue_cny: record.amount != null ? numberOrZero(record.amount) : null,
      currency: "CNY",
    }),
  };
}

function kindForEeocrmActivity(record) {
  const entityType = String(record.entityType ?? "");
  const content = String(record.content || "").toLowerCase();
  if (entityType === "11010011100001" || /전화|통화|콜|call/.test(content)) return "call";
  if (entityType === "11010011100002" || /방문|visit/.test(content)) return "visit";
  if (/데모|시연|demo/.test(content)) return "demo";
  if (/미팅|회의|meeting/.test(content)) return "meeting";
  return "update";
}

async function recordEeocrmSync({ workspaceId, status, payload, errorMessage = null }) {
  return recordGoogleSheetsSync({
    workspaceId,
    status,
    payload: { provider: PROVIDER, ...payload },
    errorMessage,
  });
}

async function fetchEeocrmPages(client, buildSoql, maxPages = DEFAULT_MAX_PAGES) {
  const records = [];
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const soql = buildSoql({ offset: page * PAGE_SIZE, limit: PAGE_SIZE });
    const queryResult = await callEeocrmTool(client, "crm_soql_query", { soql });
    if (!queryResult.ok) return queryResult;

    records.push(...queryResult.records);
    if (queryResult.records.length < PAGE_SIZE) break;
    if (page === maxPages - 1) truncated = true;
  }

  return { ok: true, records, truncated };
}

async function findCompanyByEeocrmAccountId(workspaceId, accountId) {
  if (!accountId) return null;
  const rows = await fetchSupabaseRows("companies", {
    filters: [["workspace_id", eqFilter(workspaceId)], ["meta->>eeocrm_account_id", eqFilter(accountId)]],
    limit: 1,
  });
  return rows?.[0] || null;
}

async function findCompanyForEeocrmAccount(workspaceId, mapped) {
  const byAccountId = await findCompanyByEeocrmAccountId(workspaceId, mapped.meta.eeocrm_account_id);
  if (byAccountId) return byAccountId;

  if (mapped.match_key) {
    const rows = await fetchSupabaseRows("companies", {
      filters: [["workspace_id", eqFilter(workspaceId)], ["match_key", eqFilter(mapped.match_key)]],
      limit: 1,
    });
    if (rows?.[0]) return rows[0];
  }

  if (mapped.name) {
    const rows = await fetchSupabaseRows("companies", {
      filters: [["workspace_id", eqFilter(workspaceId)], ["name", eqFilter(mapped.name)]],
      limit: 1,
    });
    if (rows?.[0]) return rows[0];
  }

  return null;
}

async function upsertEeocrmAccountCompany(workspaceId, record) {
  const mapped = mapEeocrmAccountToCompany(record);
  if (!mapped.name) return { ok: false, reason: "missing-name" };

  const existing = await findCompanyForEeocrmAccount(workspaceId, mapped);
  if (existing) {
    const mergedMeta = compactMeta({ ...(existing.meta || {}), ...mapped.meta });
    const update = await updateSupabaseRecord(
      "companies",
      [["id", eqFilter(existing.id)], ["workspace_id", eqFilter(workspaceId)]],
      {
        phone: existing.phone || mapped.phone || null,
        address: existing.address || mapped.address || null,
        match_key: existing.match_key || mapped.match_key || null,
        status: existing.status === "inactive" ? "inactive" : "active",
        meta: mergedMeta,
      },
      { returnRepresentation: true, select: "*" },
    );
    if (!update.persisted) return { ok: false, reason: update.reason || "company-update-failed", detail: update.detail };
    return { ok: true, company: update.record || existing, created: false };
  }

  const inserted = await insertSupabaseRecord(
    "companies",
    {
      workspace_id: workspaceId,
      name: mapped.name,
      phone: mapped.phone || null,
      address: mapped.address || null,
      match_key: mapped.match_key || null,
      status: "active",
      meta: mapped.meta,
    },
    { returnRepresentation: true, select: "*" },
  );

  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "company-insert-failed", detail: inserted.detail };
  return { ok: true, company: inserted.record, created: true };
}

async function upsertEeocrmContact(workspaceId, record, companyByEeocrmAccountId) {
  const accountId = record.accountId != null ? String(record.accountId) : "";
  const company = companyByEeocrmAccountId.get(accountId);
  if (!company?.id) return { ok: false, reason: "missing-company" };

  const name = normalizeName(record.contactName);
  if (!name) return { ok: false, reason: "missing-name" };
  const email = record.email ? String(record.email).trim() || null : null;

  const existing = await fetchSupabaseRows("contacts", {
    filters: [["workspace_id", eqFilter(workspaceId)], ["company_id", eqFilter(company.id)], ["name", eqFilter(name)]],
    limit: 1,
  });
  if (existing?.[0]) {
    if (email && !existing[0].email) {
      await updateSupabaseRecord(
        "contacts",
        [["id", eqFilter(existing[0].id)], ["workspace_id", eqFilter(workspaceId)]],
        { email },
      );
      return { ok: true, contact: { ...existing[0], email }, created: false };
    }
    return { ok: true, contact: existing[0], created: false };
  }

  const inserted = await insertSupabaseRecord(
    "contacts",
    {
      workspace_id: workspaceId,
      company_id: company.id,
      name,
      email,
      title: null,
    },
    { returnRepresentation: true, select: "*" },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "contact-insert-failed", detail: inserted.detail };
  return { ok: true, contact: inserted.record, created: true };
}

async function findDealByMetaRef(workspaceId, key, value) {
  if (!value) return null;
  const rows = await fetchSupabaseRows("deals", {
    filters: [["workspace_id", eqFilter(workspaceId)], [`meta->>${key}`, eqFilter(value)]],
    limit: 1,
  });
  return rows?.[0] || null;
}

async function findCustomerAccountByEeocrmAccountId(workspaceId, accountId) {
  if (!accountId) return null;
  const rows = await fetchSupabaseRows("customer_accounts", {
    filters: [["workspace_id", eqFilter(workspaceId)], ["meta->>eeocrm_account_id", eqFilter(accountId)]],
    limit: 1,
  });
  return rows?.[0] || null;
}

async function upsertEeocrmCustomerAccount(workspaceId, account, company) {
  const accountId = account.id != null ? String(account.id) : "";
  if (!accountId) return { ok: false, reason: "missing-account-id" };
  const name = normalizeName(account.accountName) || company?.name;
  if (!name) return { ok: false, reason: "missing-name" };

  const meta = compactMeta({
    source: PROVIDER,
    source_transport: "eeocrm",
    source_family: "eeocrm_account",
    lane: "classin_sales",
    eeocrm_account_id: accountId,
    eeocrm_owner_id: account.ownerId != null ? String(account.ownerId) : null,
    eeocrm_entity_type: account.entityType != null ? String(account.entityType) : null,
  });
  const existing = await findCustomerAccountByEeocrmAccountId(workspaceId, accountId);

  if (existing) {
    const update = await updateSupabaseRecord(
      "customer_accounts",
      [["id", eqFilter(existing.id)], ["workspace_id", eqFilter(workspaceId)]],
      {
        company_id: company?.id || existing.company_id || null,
        name,
        status: existing.status === "closed" ? "closed" : "active",
        meta: compactMeta({ ...(existing.meta || {}), ...meta }),
      },
      { returnRepresentation: true, select: "*" },
    );
    if (!update.persisted) return { ok: false, reason: update.reason || "customer-account-update-failed", detail: update.detail };
    return { ok: true, account: update.record || existing, created: false };
  }

  const inserted = await insertSupabaseRecord(
    "customer_accounts",
    {
      workspace_id: workspaceId,
      company_id: company?.id || null,
      name,
      status: "active",
      started_at: timestampFromMillis(account.createdAt),
      meta,
    },
    { returnRepresentation: true, select: "*" },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "customer-account-insert-failed", detail: inserted.detail };
  return { ok: true, account: inserted.record, created: true };
}

async function upsertEeocrmOpportunityDeal(workspaceId, record, companyByEeocrmAccountId) {
  const opportunityId = record.id != null ? String(record.id) : "";
  if (!opportunityId) return { ok: false, reason: "missing-opportunity-id" };

  const company = companyByEeocrmAccountId.get(String(record.accountId ?? ""));
  const mapped = mapEeocrmOpportunityToDeal(record, company);
  const existing = await findDealByMetaRef(workspaceId, "eeocrm_opportunity_id", opportunityId);

  if (existing) {
    const update = await updateSupabaseRecord(
      "deals",
      [["id", eqFilter(existing.id)], ["workspace_id", eqFilter(workspaceId)]],
      {
        company_id: mapped.company_id || existing.company_id || null,
        title: mapped.title,
        amount: mapped.amount,
        currency: mapped.currency,
        stage: mapped.stage,
        expected_close_at: mapped.expected_close_at,
        last_activity_at: mapped.last_activity_at,
        won_at: mapped.won_at,
        lost_at: mapped.lost_at,
        meta: compactMeta({ ...(existing.meta || {}), ...mapped.meta }),
      },
      { returnRepresentation: true, select: "*" },
    );
    if (!update.persisted) return { ok: false, reason: update.reason || "deal-update-failed", detail: update.detail };
    return { ok: true, deal: update.record || existing, created: false };
  }

  const inserted = await insertSupabaseRecord(
    "deals",
    {
      workspace_id: workspaceId,
      company_id: mapped.company_id,
      title: mapped.title,
      amount: mapped.amount,
      currency: mapped.currency,
      stage: mapped.stage,
      expected_close_at: mapped.expected_close_at,
      last_activity_at: mapped.last_activity_at,
      won_at: mapped.won_at,
      lost_at: mapped.lost_at,
      meta: mapped.meta,
    },
    { returnRepresentation: true, select: "*" },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "deal-insert-failed", detail: inserted.detail };
  return { ok: true, deal: inserted.record, created: true };
}

async function upsertEeocrmOrderDeal(workspaceId, record, companyByEeocrmAccountId, dealByEeocrmOpportunityId) {
  const orderId = record.id != null ? String(record.id) : "";
  if (!orderId) return { ok: false, reason: "missing-order-id" };

  const opportunityId = record.opportunityId != null ? String(record.opportunityId) : "";
  const opportunityDeal = opportunityId ? dealByEeocrmOpportunityId.get(opportunityId) : null;
  if (opportunityDeal?.id) {
    const existingOrderIds = Array.isArray(opportunityDeal.meta?.eeocrm_order_ids)
      ? opportunityDeal.meta.eeocrm_order_ids.map(String)
      : [];
    const orderIds = Array.from(new Set([...existingOrderIds, orderId]));
    const existingTotal = Number(opportunityDeal.meta?.eeocrm_order_total_cny || 0);
    const amount = numberOrZero(record.amount);
    const update = await updateSupabaseRecord(
      "deals",
      [["id", eqFilter(opportunityDeal.id)], ["workspace_id", eqFilter(workspaceId)]],
      {
        stage: "won",
        won_at: timestampFromMillis(record.transactionDate || record.createdAt) || opportunityDeal.won_at || null,
        meta: compactMeta({
          ...(opportunityDeal.meta || {}),
          eeocrm_order_ids: orderIds,
          eeocrm_order_total_cny: existingOrderIds.includes(orderId) ? existingTotal : existingTotal + amount,
          currency: "CNY",
        }),
      },
      { returnRepresentation: true, select: "*" },
    );
    if (!update.persisted) return { ok: false, reason: update.reason || "order-link-failed", detail: update.detail };
    dealByEeocrmOpportunityId.set(opportunityId, update.record || opportunityDeal);
    return { ok: true, deal: update.record || opportunityDeal, created: false, linkedToOpportunity: true };
  }

  const existing = await findDealByMetaRef(workspaceId, "eeocrm_order_id", orderId);
  if (existing) return { ok: true, deal: existing, created: false };

  const company = companyByEeocrmAccountId.get(String(record.accountId ?? ""));
  const mapped = mapEeocrmOrderToDeal(record, company);
  const inserted = await insertSupabaseRecord(
    "deals",
    {
      workspace_id: workspaceId,
      company_id: mapped.company_id,
      title: mapped.title,
      amount: mapped.amount,
      currency: mapped.currency,
      stage: mapped.stage,
      expected_close_at: mapped.expected_close_at,
      last_activity_at: mapped.last_activity_at,
      won_at: mapped.won_at,
      meta: mapped.meta,
    },
    { returnRepresentation: true, select: "*" },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "order-deal-insert-failed", detail: inserted.detail };
  return { ok: true, deal: inserted.record, created: true };
}

async function upsertEeocrmActivity(workspaceId, record, customerAccountByEeocrmAccountId, companyByEeocrmAccountId) {
  const eeocrmAccountId = record.dbcRelation26 != null ? String(record.dbcRelation26) : "";
  if (!eeocrmAccountId) return { ok: false, reason: "missing-account-relation" };

  const account = customerAccountByEeocrmAccountId.get(eeocrmAccountId);
  const company = companyByEeocrmAccountId.get(eeocrmAccountId);
  if (!account?.id) return { ok: false, reason: "missing-customer-account" };

  const body = String(record.content || "").trim();
  if (!body) return { ok: false, reason: "missing-body" };

  const occurredAt = timestampFromMillis(record.startTime);
  if (!occurredAt) return { ok: false, reason: "missing-occurred-at" };
  const kind = kindForEeocrmActivity(record);
  const existing = await fetchSupabaseRows("crm_activities", {
    filters: [
      ["workspace_id", eqFilter(workspaceId)],
      ["account_id", eqFilter(account.id)],
      ["occurred_at", eqFilter(occurredAt)],
      ["kind", eqFilter(kind)],
      ["body", eqFilter(body)],
    ],
    limit: 1,
  });
  if (existing?.[0]) return { ok: true, activity: existing[0], created: false };

  const inserted = await insertSupabaseRecord(
    "crm_activities",
    {
      workspace_id: workspaceId,
      account_id: account.id,
      company_id: company?.id || account.company_id || null,
      entity_type: "account",
      kind,
      body,
      owner_id: null,
      occurred_at: occurredAt || new Date().toISOString(),
    },
    { returnRepresentation: true, select: "*" },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "activity-insert-failed", detail: inserted.detail };
  return { ok: true, activity: inserted.record, created: true };
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
    expectedOwnerId: resolveEeocrmOwnerId(),
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

  const ownerCheck = assertEeocrmOwnerId(OWNER_ID);
  if (!ownerCheck.ok) return ownerCheck;

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

// --- hydrate: eeoCRM account/contact -> companies/contacts ---------------------

export async function hydrateEeocrmAccountsContacts({
  workspaceId = resolveDefaultWorkspaceId(),
  maxPages = DEFAULT_MAX_PAGES,
} = {}) {
  if (!workspaceId) return { ok: false, reason: "missing-workspace" };
  if (!resolveSupabaseConfig()) return { ok: false, reason: "missing-config" };

  const ownerCheck = assertEeocrmOwnerId(OWNER_ID);
  if (!ownerCheck.ok) return ownerCheck;

  const result = await withEeocrmClient(async (client) => {
    const accountResult = await fetchEeocrmPages(
      client,
      ({ offset, limit }) => buildAccountSoql({ ownerId: OWNER_ID, offset, limit }),
      maxPages,
    );
    if (!accountResult.ok) return accountResult;

    const companyByEeocrmAccountId = new Map();
    const customerAccountByEeocrmAccountId = new Map();
    let accountsCreated = 0;
    let accountsLinked = 0;
    let accountsSkipped = 0;
    let customerAccountsCreated = 0;
    let customerAccountsLinked = 0;
    let customerAccountsSkipped = 0;

    for (const account of accountResult.records) {
      const upserted = await upsertEeocrmAccountCompany(workspaceId, account);
      if (!upserted.ok || !upserted.company) {
        accountsSkipped += 1;
        continue;
      }
      companyByEeocrmAccountId.set(String(account.id), upserted.company);
      if (upserted.created) accountsCreated += 1;
      else accountsLinked += 1;

      const customerAccount = await upsertEeocrmCustomerAccount(workspaceId, account, upserted.company);
      if (!customerAccount.ok || !customerAccount.account) {
        customerAccountsSkipped += 1;
        continue;
      }
      customerAccountByEeocrmAccountId.set(String(account.id), customerAccount.account);
      if (customerAccount.created) customerAccountsCreated += 1;
      else customerAccountsLinked += 1;
    }

    const contactResult = await fetchEeocrmPages(
      client,
      ({ offset, limit }) => buildContactSoql({ ownerId: OWNER_ID, offset, limit }),
      maxPages,
    );
    if (!contactResult.ok) return contactResult;

    let contactsCreated = 0;
    let contactsLinked = 0;
    let contactsSkipped = 0;

    for (const contact of contactResult.records) {
      const upserted = await upsertEeocrmContact(workspaceId, contact, companyByEeocrmAccountId);
      if (!upserted.ok) {
        contactsSkipped += 1;
        continue;
      }
      if (upserted.created) contactsCreated += 1;
      else contactsLinked += 1;
    }

    const opportunityResult = await fetchEeocrmPages(
      client,
      ({ offset, limit }) => buildOpportunitySoql({ ownerId: OWNER_ID, offset, limit }),
      maxPages,
    );
    if (!opportunityResult.ok) return opportunityResult;

    const dealByEeocrmOpportunityId = new Map();
    let dealsCreated = 0;
    let dealsLinked = 0;
    let dealsSkipped = 0;

    for (const opportunity of opportunityResult.records) {
      const upserted = await upsertEeocrmOpportunityDeal(workspaceId, opportunity, companyByEeocrmAccountId);
      if (!upserted.ok || !upserted.deal) {
        dealsSkipped += 1;
        continue;
      }
      dealByEeocrmOpportunityId.set(String(opportunity.id), upserted.deal);
      if (upserted.created) dealsCreated += 1;
      else dealsLinked += 1;
    }

    const orderResult = await fetchEeocrmPages(
      client,
      ({ offset, limit }) => buildOrderSoql({ ownerId: OWNER_ID, offset, limit }),
      maxPages,
    );
    if (!orderResult.ok) return orderResult;

    let ordersCreated = 0;
    let ordersLinked = 0;
    let ordersSkipped = 0;

    for (const order of orderResult.records) {
      const upserted = await upsertEeocrmOrderDeal(workspaceId, order, companyByEeocrmAccountId, dealByEeocrmOpportunityId);
      if (!upserted.ok) {
        ordersSkipped += 1;
        continue;
      }
      if (upserted.created) ordersCreated += 1;
      else ordersLinked += 1;
    }

    const activityResult = await fetchEeocrmPages(
      client,
      ({ offset, limit }) => buildActivitySoql({ ownerId: OWNER_ID, offset, limit }),
      maxPages,
    );
    if (!activityResult.ok) return activityResult;

    let activitiesCreated = 0;
    let activitiesLinked = 0;
    let activitiesSkipped = 0;

    for (const activity of activityResult.records) {
      const upserted = await upsertEeocrmActivity(workspaceId, activity, customerAccountByEeocrmAccountId, companyByEeocrmAccountId);
      if (!upserted.ok) {
        activitiesSkipped += 1;
        continue;
      }
      if (upserted.created) activitiesCreated += 1;
      else activitiesLinked += 1;
    }

    return {
      ok: true,
      accounts: {
        total: accountResult.records.length,
        created: accountsCreated,
        linked: accountsLinked,
        skipped: accountsSkipped,
      },
      customerAccounts: {
        total: accountResult.records.length,
        created: customerAccountsCreated,
        linked: customerAccountsLinked,
        skipped: customerAccountsSkipped,
      },
      contacts: {
        total: contactResult.records.length,
        created: contactsCreated,
        linked: contactsLinked,
        skipped: contactsSkipped,
      },
      deals: {
        total: opportunityResult.records.length,
        created: dealsCreated,
        linked: dealsLinked,
        skipped: dealsSkipped,
      },
      orders: {
        total: orderResult.records.length,
        created: ordersCreated,
        linked: ordersLinked,
        skipped: ordersSkipped,
      },
      activities: {
        total: activityResult.records.length,
        created: activitiesCreated,
        linked: activitiesLinked,
        skipped: activitiesSkipped,
      },
      truncated: Boolean(accountResult.truncated || contactResult.truncated || opportunityResult.truncated || orderResult.truncated || activityResult.truncated),
    };
  });

  await recordEeocrmSync({
    workspaceId,
    status: result.ok ? "success" : "failure",
    payload: { action: "hydrate", ...result },
    errorMessage: result.ok ? null : (result.detail || result.reason),
  });

  return result;
}

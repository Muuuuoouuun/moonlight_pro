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
  eqFilter,
  fetchSupabaseRows,
  inFilterQuoted,
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
import {
  batchInsertStagingRows,
  compactMeta,
  tallyStagingByStatus,
} from "@/lib/repositories/repo-utils";
import { assertEeocrmOwnerId, resolveEeocrmOwnerId } from "@/lib/sales-os/operator-scope";
import { extractEeocrmRecords } from "@/lib/external-crm/eeocrm-response";

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

const COMPANY_SELECT = "id,name,phone,address,match_key,status,meta";

// Prefetches every company the account batch could resolve to — by eeoCRM
// account id, match key, or exact name — in three reads total, replacing the
// old 1-3 sequential lookups *per account*. The maps are kept current as new
// companies are inserted so later records resolve exactly like the sequential
// run did.
async function buildCompanyIndex(workspaceId, mappedAccounts) {
  const accountIds = [...new Set(mappedAccounts.map((m) => m.meta.eeocrm_account_id).filter(Boolean))];
  const matchKeys = [...new Set(mappedAccounts.map((m) => m.match_key).filter(Boolean))];
  const names = [...new Set(mappedAccounts.map((m) => m.name).filter(Boolean))];

  const [byAccountIdRows, byMatchKeyRows, byNameRows] = await Promise.all([
    accountIds.length
      ? fetchSupabaseRows("companies", {
          select: COMPANY_SELECT,
          filters: [["workspace_id", eqFilter(workspaceId)], ["meta->>eeocrm_account_id", inFilterQuoted(accountIds)]],
          limit: accountIds.length,
        })
      : [],
    matchKeys.length
      ? fetchSupabaseRows("companies", {
          select: COMPANY_SELECT,
          filters: [["workspace_id", eqFilter(workspaceId)], ["match_key", inFilterQuoted(matchKeys)]],
          limit: matchKeys.length,
        })
      : [],
    names.length
      ? fetchSupabaseRows("companies", {
          select: COMPANY_SELECT,
          filters: [["workspace_id", eqFilter(workspaceId)], ["name", inFilterQuoted(names)]],
          limit: names.length,
        })
      : [],
  ]);

  const index = { byAccountId: new Map(), byMatchKey: new Map(), byName: new Map() };
  const register = (company) => {
    if (!company) return;
    const accountId = company.meta?.eeocrm_account_id;
    if (accountId && !index.byAccountId.has(String(accountId))) index.byAccountId.set(String(accountId), company);
    if (company.match_key && !index.byMatchKey.has(company.match_key)) index.byMatchKey.set(company.match_key, company);
    if (company.name && !index.byName.has(company.name)) index.byName.set(company.name, company);
  };
  // byName last so the more specific keys win their slots first.
  (byAccountIdRows || []).forEach(register);
  (byMatchKeyRows || []).forEach(register);
  (byNameRows || []).forEach(register);
  index.register = register;
  return index;
}

function findCompanyForEeocrmAccount(companyIndex, mapped) {
  const accountId = mapped.meta.eeocrm_account_id;
  return (
    (accountId ? companyIndex.byAccountId.get(String(accountId)) : null) ||
    (mapped.match_key ? companyIndex.byMatchKey.get(mapped.match_key) : null) ||
    (mapped.name ? companyIndex.byName.get(mapped.name) : null) ||
    null
  );
}

async function upsertEeocrmAccountCompany(workspaceId, record, companyIndex) {
  const mapped = mapEeocrmAccountToCompany(record);
  if (!mapped.name) return { ok: false, reason: "missing-name" };

  const existing = findCompanyForEeocrmAccount(companyIndex, mapped);
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
      { returnRepresentation: true, select: COMPANY_SELECT },
    );
    if (!update.persisted) return { ok: false, reason: update.reason || "company-update-failed", detail: update.detail };
    const company = update.record || existing;
    companyIndex.register(company);
    return { ok: true, company, created: false };
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
    { returnRepresentation: true, select: COMPANY_SELECT },
  );

  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "company-insert-failed", detail: inserted.detail };
  companyIndex.register(inserted.record);
  return { ok: true, company: inserted.record, created: true };
}

const contactIndexKey = (companyId, name) => `${companyId}→${name}`;

// One read for every contact under the batch's companies; the map stays current
// as inserts land so duplicate contact rows in the same run resolve to one row.
async function buildContactIndex(workspaceId, companyIds) {
  const index = new Map();
  if (!companyIds.length) return index;

  const rows = await fetchSupabaseRows("contacts", {
    select: "id,company_id,name,email",
    filters: [["workspace_id", eqFilter(workspaceId)], ["company_id", inFilterQuoted(companyIds)]],
    limit: 2000,
  });
  for (const contact of rows || []) {
    const key = contactIndexKey(contact.company_id, contact.name);
    if (!index.has(key)) index.set(key, contact);
  }
  return index;
}

async function upsertEeocrmContact(workspaceId, record, companyByEeocrmAccountId, contactIndex) {
  const accountId = record.accountId != null ? String(record.accountId) : "";
  const company = companyByEeocrmAccountId.get(accountId);
  if (!company?.id) return { ok: false, reason: "missing-company" };

  const name = normalizeName(record.contactName);
  if (!name) return { ok: false, reason: "missing-name" };
  const email = record.email ? String(record.email).trim() || null : null;

  const existing = contactIndex.get(contactIndexKey(company.id, name));
  if (existing) {
    if (email && !existing.email) {
      await updateSupabaseRecord(
        "contacts",
        [["id", eqFilter(existing.id)], ["workspace_id", eqFilter(workspaceId)]],
        { email },
      );
      const merged = { ...existing, email };
      contactIndex.set(contactIndexKey(company.id, name), merged);
      return { ok: true, contact: merged, created: false };
    }
    return { ok: true, contact: existing, created: false };
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
    { returnRepresentation: true, select: "id,company_id,name,email" },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "contact-insert-failed", detail: inserted.detail };
  contactIndex.set(contactIndexKey(company.id, name), inserted.record);
  return { ok: true, contact: inserted.record, created: true };
}

const DEAL_SELECT = "id,company_id,title,amount,currency,stage,expected_close_at,last_activity_at,won_at,lost_at,meta";
const CUSTOMER_ACCOUNT_SELECT = "id,company_id,name,status,meta";

// One read per meta key across the whole batch (deals by opportunity/order id,
// customer accounts by eeoCRM account id) — replaces one lookup per record.
async function fetchRowsByMetaRef(workspaceId, table, select, metaKey, values) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  const index = new Map();
  if (!unique.length) return index;

  const rows = await fetchSupabaseRows(table, {
    select,
    filters: [["workspace_id", eqFilter(workspaceId)], [`meta->>${metaKey}`, inFilterQuoted(unique)]],
    limit: unique.length,
  });
  for (const row of rows || []) {
    const key = row.meta?.[metaKey];
    if (key != null && !index.has(String(key))) index.set(String(key), row);
  }
  return index;
}

async function upsertEeocrmCustomerAccount(workspaceId, account, company, customerAccountIndex) {
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
  const existing = customerAccountIndex.get(accountId) || null;

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
      { returnRepresentation: true, select: CUSTOMER_ACCOUNT_SELECT },
    );
    if (!update.persisted) return { ok: false, reason: update.reason || "customer-account-update-failed", detail: update.detail };
    const merged = update.record || existing;
    customerAccountIndex.set(accountId, merged);
    return { ok: true, account: merged, created: false };
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
    { returnRepresentation: true, select: CUSTOMER_ACCOUNT_SELECT },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "customer-account-insert-failed", detail: inserted.detail };
  customerAccountIndex.set(accountId, inserted.record);
  return { ok: true, account: inserted.record, created: true };
}

async function upsertEeocrmOpportunityDeal(workspaceId, record, companyByEeocrmAccountId, dealByOpportunityRef) {
  const opportunityId = record.id != null ? String(record.id) : "";
  if (!opportunityId) return { ok: false, reason: "missing-opportunity-id" };

  const company = companyByEeocrmAccountId.get(String(record.accountId ?? ""));
  const mapped = mapEeocrmOpportunityToDeal(record, company);
  const existing = dealByOpportunityRef.get(opportunityId) || null;

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
      { returnRepresentation: true, select: DEAL_SELECT },
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
    { returnRepresentation: true, select: DEAL_SELECT },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "deal-insert-failed", detail: inserted.detail };
  return { ok: true, deal: inserted.record, created: true };
}

async function upsertEeocrmOrderDeal(workspaceId, record, companyByEeocrmAccountId, dealByEeocrmOpportunityId, dealByOrderRef) {
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
      { returnRepresentation: true, select: DEAL_SELECT },
    );
    if (!update.persisted) return { ok: false, reason: update.reason || "order-link-failed", detail: update.detail };
    dealByEeocrmOpportunityId.set(opportunityId, update.record || opportunityDeal);
    return { ok: true, deal: update.record || opportunityDeal, created: false, linkedToOpportunity: true };
  }

  const existing = dealByOrderRef.get(orderId) || null;
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
    { returnRepresentation: true, select: DEAL_SELECT },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "order-deal-insert-failed", detail: inserted.detail };
  return { ok: true, deal: inserted.record, created: true };
}

// occurred_at is normalized to epoch millis: PostgREST returns "+00:00" offsets
// while timestampFromMillis emits "Z", and a raw string key would never match.
const activityDedupeKey = (accountId, occurredAt, kind, body) =>
  `${accountId}|${new Date(occurredAt).getTime()}|${kind}|${body}`;

// One read of the batch accounts' existing activities builds the dedupe set the
// old code re-queried per record (an eq on free-text `body` each time).
async function buildActivityDedupeSet(workspaceId, accountIds) {
  const seen = new Set();
  if (!accountIds.length) return seen;

  const rows = await fetchSupabaseRows("crm_activities", {
    select: "account_id,occurred_at,kind,body",
    filters: [["workspace_id", eqFilter(workspaceId)], ["account_id", inFilterQuoted(accountIds)]],
    limit: 5000,
  });
  for (const row of rows || []) {
    seen.add(activityDedupeKey(row.account_id, row.occurred_at, row.kind, row.body));
  }
  return seen;
}

async function upsertEeocrmActivity(workspaceId, record, customerAccountByEeocrmAccountId, companyByEeocrmAccountId, activityKeys) {
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
  const dedupeKey = activityDedupeKey(account.id, occurredAt, kind, body);
  if (activityKeys.has(dedupeKey)) return { ok: true, activity: null, created: false };

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
    { returnRepresentation: true, select: "id" },
  );
  if (!inserted.persisted) return { ok: false, reason: inserted.reason || "activity-insert-failed", detail: inserted.detail };
  activityKeys.add(dedupeKey);
  return { ok: true, activity: inserted.record, created: true };
}

// --- status -------------------------------------------------------------------

export async function getEeocrmSyncStatus(workspaceId = resolveDefaultWorkspaceId()) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { source: "preview", configured: Boolean(config), staging: {}, recentRuns: [], mcpUrl: resolveMcpUrl() };
  }

  const [recentRuns, staging] = await Promise.all([
    fetchSupabaseRows("sync_runs", {
      select: "status,payload,started_at,error_message",
      filters: withWorkspaceFilter([["payload->>provider", eqFilter(PROVIDER)]]),
      order: "started_at.desc",
      limit: 10,
    }),
    tallyStagingByStatus(PROVIDER),
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
    staging,
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

      const stagingRecords = [];
      for (const record of records) {
        const normalized = mapEeocrmLeadToIntake(record);
        if (!normalized.match_key) {
          skipped += 1;
          continue;
        }
        const sourceRef = `eeocrm:lead:${record.id}`;
        stagingRecords.push({
          workspace_id: workspaceId,
          source: PROVIDER,
          source_ref: sourceRef,
          raw: record,
          normalized: { ...normalized, source_ref: sourceRef },
          match_key: normalized.match_key,
          status: "pending",
        });
      }

      // One pre-check + one bulk insert per page; re-staged rows count as skipped
      // (idempotent re-run), same as the old per-row 409 handling.
      const batch = await batchInsertStagingRows(stagingRecords);
      imported += batch.imported;
      skipped += batch.skipped;

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

    // Prefetch phase — every per-record lookup the old loops issued is replaced
    // by one batched read per entity type (companies ×3 keys, customer accounts,
    // contacts, deals ×2 refs, activity dedupe keys). Writes stay sequential so
    // merge semantics and ordering match the previous implementation exactly.
    const mappedAccounts = accountResult.records.map((record) => mapEeocrmAccountToCompany(record));
    const accountEeocrmIds = accountResult.records.map((record) => String(record.id ?? "")).filter(Boolean);
    const [companyIndex, customerAccountIndex] = await Promise.all([
      buildCompanyIndex(workspaceId, mappedAccounts),
      fetchRowsByMetaRef(workspaceId, "customer_accounts", CUSTOMER_ACCOUNT_SELECT, "eeocrm_account_id", accountEeocrmIds),
    ]);

    const companyByEeocrmAccountId = new Map();
    const customerAccountByEeocrmAccountId = new Map();
    let accountsCreated = 0;
    let accountsLinked = 0;
    let accountsSkipped = 0;
    let customerAccountsCreated = 0;
    let customerAccountsLinked = 0;
    let customerAccountsSkipped = 0;

    for (const account of accountResult.records) {
      const upserted = await upsertEeocrmAccountCompany(workspaceId, account, companyIndex);
      if (!upserted.ok || !upserted.company) {
        accountsSkipped += 1;
        continue;
      }
      companyByEeocrmAccountId.set(String(account.id), upserted.company);
      if (upserted.created) accountsCreated += 1;
      else accountsLinked += 1;

      const customerAccount = await upsertEeocrmCustomerAccount(workspaceId, account, upserted.company, customerAccountIndex);
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

    const contactIndex = await buildContactIndex(
      workspaceId,
      [...companyByEeocrmAccountId.values()].map((company) => company.id),
    );

    let contactsCreated = 0;
    let contactsLinked = 0;
    let contactsSkipped = 0;

    for (const contact of contactResult.records) {
      const upserted = await upsertEeocrmContact(workspaceId, contact, companyByEeocrmAccountId, contactIndex);
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

    const dealByOpportunityRef = await fetchRowsByMetaRef(
      workspaceId,
      "deals",
      DEAL_SELECT,
      "eeocrm_opportunity_id",
      opportunityResult.records.map((record) => record.id),
    );

    const dealByEeocrmOpportunityId = new Map();
    let dealsCreated = 0;
    let dealsLinked = 0;
    let dealsSkipped = 0;

    for (const opportunity of opportunityResult.records) {
      const upserted = await upsertEeocrmOpportunityDeal(workspaceId, opportunity, companyByEeocrmAccountId, dealByOpportunityRef);
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

    const dealByOrderRef = await fetchRowsByMetaRef(
      workspaceId,
      "deals",
      DEAL_SELECT,
      "eeocrm_order_id",
      orderResult.records.map((record) => record.id),
    );

    let ordersCreated = 0;
    let ordersLinked = 0;
    let ordersSkipped = 0;

    for (const order of orderResult.records) {
      const upserted = await upsertEeocrmOrderDeal(workspaceId, order, companyByEeocrmAccountId, dealByEeocrmOpportunityId, dealByOrderRef);
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

    const activityKeys = await buildActivityDedupeSet(
      workspaceId,
      [...customerAccountByEeocrmAccountId.values()].map((account) => account.id),
    );

    let activitiesCreated = 0;
    let activitiesLinked = 0;
    let activitiesSkipped = 0;

    for (const activity of activityResult.records) {
      const upserted = await upsertEeocrmActivity(workspaceId, activity, customerAccountByEeocrmAccountId, companyByEeocrmAccountId, activityKeys);
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

#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  buildJunhyukLeadEnrichment,
  normalizeEntityName,
} from "../apps/hub/lib/sales-os/lead-enrichment.js";
import { assertEnrichmentApplyPolicy } from "./enrich-eeocrm-policy.mjs";

const DEFAULT_OWNER = {
  externalId: "3935704427463307",
  name: "문준혁",
  eeoCode: "EEO04186",
};

function parseArgs(argv) {
  const out = { apply: false, evidencePath: null, owner: { ...DEFAULT_OWNER } };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--evidence") out.evidencePath = argv[++index] || null;
    else if (arg === "--owner-id") out.owner.externalId = argv[++index] || "";
    else if (arg === "--owner-name") out.owner.name = argv[++index] || "";
    else if (arg === "--owner-code") out.owner.eeoCode = argv[++index] || "";
  }
  return out;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function supabaseHeaders(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function requestJson(url, { headers = {}, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const code = data && typeof data === "object" ? data.code || data.message : null;
    throw new Error(`${method} ${url} failed (${response.status}${code ? ` ${code}` : ""})`);
  }
  return data;
}

function ownerFilter(owner) {
  const aliases = [owner.externalId, owner.name, "Mun Junhyuk (문준혁)", "Junhyuk Mun"];
  return `owner_name=in.(${[...new Set(aliases)].map(encodeURIComponent).join(",")})`;
}

function classifyCalendarTitle(title) {
  const text = String(title || "").toLowerCase();
  if (/설명회|세미나|웨비나/.test(text)) return "infoSession";
  if (/미팅|회의|meeting|방문|상담/.test(text)) return "meeting";
  if (/콜|전화|call/.test(text)) return "call";
  return "other";
}

function monthRanges(now = new Date(), months = 7) {
  const ranges = [];
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    ranges.push({ timeMin: start.toISOString(), timeMax: end.toISOString() });
  }
  return ranges;
}

async function fetchCalendarEvents(hubUrl) {
  const events = [];
  for (const range of monthRanges()) {
    const url = new URL("/api/calendar/google/event", hubUrl);
    url.searchParams.set("timeMin", range.timeMin);
    url.searchParams.set("timeMax", range.timeMax);
    const payload = await requestJson(url);
    if (payload?.status !== "live") continue;
    events.push(...(payload.events || []));
  }
  return events;
}

async function loadPublicEvidence(filepath) {
  if (!filepath) return new Map();
  const parsed = JSON.parse(await readFile(filepath, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.accounts || [];
  return new Map(
    rows
      .filter((row) => row?.company)
      .map((row) => [normalizeEntityName(row.company), row.evidence || []]),
  );
}

function recordMatchesAccount(record, accountId) {
  const payload = record.payload || {};
  const candidates = [
    payload.accountId,
    payload.orderAccountId__c,
    payload.Account__c,
    payload.AccountGet__c,
    payload.ShroffAccount__c,
  ];
  return candidates.some((value) => String(value || "") === String(accountId));
}

function aggregateActivity({ records, account, calendarEvents }) {
  const matched = records.filter((record) => recordMatchesAccount(record, account.externalId));
  const normalizedName = normalizeEntityName(account.name);
  const matchingCalendar = calendarEvents.filter((event) => {
    const haystack = normalizeEntityName(`${event.title || ""} ${event.location || ""}`);
    return normalizedName.length >= 3 && haystack.includes(normalizedName);
  });
  const calendar = { meeting: 0, call: 0, infoSession: 0, other: 0, latestAt: null };
  for (const event of matchingCalendar) {
    calendar[classifyCalendarTitle(event.title)] += 1;
    if (event.start && (!calendar.latestAt || event.start > calendar.latestAt)) calendar.latestAt = event.start;
  }
  const counts = {
    opportunities: matched.filter((row) => row.object_api_key === "opportunity").length,
    collections: matched.filter((row) => row.object_api_key === "Collection__c").length,
    salesPerformance: matched.filter((row) => row.object_api_key === "SalesPerformance__c").length,
    contacts: matched.filter((row) => row.object_api_key === "contact").length,
    calendar,
  };
  const total = counts.opportunities + counts.collections + counts.salesPerformance + counts.contacts
    + calendar.meeting + calendar.call + calendar.infoSession + calendar.other;
  return total > 0 ? counts : null;
}

function semanticEnrichment(value) {
  if (!value || typeof value !== "object") return value;
  const copy = structuredClone(value);
  delete copy.generatedAt;
  return copy;
}

function summarize(results, context) {
  const scoreDistribution = {};
  for (const result of results) {
    scoreDistribution[result.patch.score] = (scoreDistribution[result.patch.score] || 0) + 1;
  }
  return {
    mode: context.apply ? "apply" : "dry-run",
    owner: context.owner,
    officialOwnerAccounts: context.accounts.length,
    moonlightEeoCrmLeads: context.leads.length,
    exactMatchedCompanies: context.matchedCompanies.length,
    targetedLeads: results.length,
    changedLeads: results.filter((row) => row.changed).length,
    unchangedLeads: results.filter((row) => !row.changed).length,
    calendarEventsScanned: context.calendarEvents.length,
    scoreDistribution,
    targets: results.map((row) => ({
      company: row.company,
      status: row.status,
      previousScore: row.previousScore,
      nextScore: row.patch.score,
      lane: row.patch.meta.enrichment.pipeline.lane,
      tags: row.patch.meta.enrichment.tags,
      changed: row.changed,
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertEnrichmentApplyPolicy(args);
  const moonUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const moonKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const classinUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const classinKey = requiredEnv("SUPABASE_SECRET_KEY");
  const workspaceId = requiredEnv("COM_MOON_DEFAULT_WORKSPACE_ID");
  const hubUrl = (process.env.COM_MOON_HUB_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const moonHeaders = supabaseHeaders(moonKey);
  const classinHeaders = supabaseHeaders(classinKey);
  const publicEvidence = await loadPublicEvidence(args.evidencePath);

  const [externalRecords, companies, leads, calendarEvents] = await Promise.all([
    requestJson(
      `${classinUrl}/rest/v1/external_crm_records?select=external_id,object_api_key,display_name,normalized_name,owner_name,payload,status,amount,occurred_at,updated_at&${ownerFilter(args.owner)}&limit=10000`,
      { headers: classinHeaders },
    ),
    requestJson(`${moonUrl}/rest/v1/companies?select=id,name,phone,meta&workspace_id=eq.${encodeURIComponent(workspaceId)}&limit=1000`, {
      headers: moonHeaders,
    }),
    requestJson(`${moonUrl}/rest/v1/leads?select=id,company_id,name,email,status,score,next_action,meta&workspace_id=eq.${encodeURIComponent(workspaceId)}&source=eq.eeocrm&limit=1000`, {
      headers: moonHeaders,
    }),
    fetchCalendarEvents(hubUrl).catch(() => []),
  ]);

  const accounts = externalRecords
    .filter((row) => row.object_api_key === "account")
    .map((row) => ({
      externalId: String(row.external_id),
      name: row.display_name || row.payload?.accountName || row.normalized_name,
      ownerId: String(row.payload?.ownerId || args.owner.externalId),
      matchType: "exact_name",
    }))
    .filter((row) => row.name && row.ownerId === String(args.owner.externalId));
  const accountByName = new Map(accounts.map((account) => [normalizeEntityName(account.name), account]));
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const eeoCrmLeadCompanyIds = new Set(leads.map((lead) => lead.company_id).filter(Boolean));
  const matchedCompanies = companies.filter(
    (company) => eeoCrmLeadCompanyIds.has(company.id) && accountByName.has(normalizeEntityName(company.name)),
  );
  const matchedCompanyIds = new Set(matchedCompanies.map((company) => company.id));
  const targets = leads.filter((lead) => matchedCompanyIds.has(lead.company_id));
  const now = new Date().toISOString();
  const results = targets.map((lead) => {
    const company = companyById.get(lead.company_id);
    const officialAccount = accountByName.get(normalizeEntityName(company.name));
    const activity = aggregateActivity({ records: externalRecords, account: officialAccount, calendarEvents });
    const built = buildJunhyukLeadEnrichment({
      owner: args.owner,
      lead,
      company,
      officialAccount,
      activity,
      publicEvidence: publicEvidence.get(normalizeEntityName(company.name)) || [],
      now,
    });
    const currentFingerprint = lead.meta?.enrichment?.evidenceFingerprint || null;
    const changed = lead.score !== built.patch.score
      || lead.next_action !== built.patch.next_action
      || (currentFingerprint
        ? currentFingerprint !== built.enrichment.evidenceFingerprint
        : JSON.stringify(semanticEnrichment(lead.meta?.enrichment)) !== JSON.stringify(semanticEnrichment(built.enrichment)));
    return {
      leadId: lead.id,
      company: company.name,
      status: lead.status,
      previousScore: lead.score,
      patch: built.patch,
      changed,
    };
  });

  const report = summarize(results, {
    apply: args.apply,
    owner: args.owner,
    accounts,
    leads,
    matchedCompanies,
    calendarEvents,
  });

  if (!args.apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  for (const result of results.filter((row) => row.changed)) {
    await requestJson(`${moonUrl}/rest/v1/leads?id=eq.${encodeURIComponent(result.leadId)}`, {
      method: "PATCH",
      headers: supabaseHeaders(moonKey, { prefer: "return=minimal" }),
      body: result.patch,
    });
  }

  const correlationId = randomUUID();
  await requestJson(`${moonUrl}/rest/v1/sync_runs`, {
    method: "POST",
    headers: supabaseHeaders(moonKey, { prefer: "return=minimal" }),
    body: {
      workspace_id: workspaceId,
      correlation_id: correlationId,
      provider_event_id: `eeocrm-junhyuk-enrichment:${now}`,
      status: "success",
      started_at: now,
      finished_at: new Date().toISOString(),
      payload: {
        action: "owner_scoped_lead_enrichment",
        owner_external_id: args.owner.externalId,
        exact_matched_companies: matchedCompanies.length,
        targeted_leads: results.length,
        changed_leads: results.filter((row) => row.changed).length,
        public_evidence_file: Boolean(args.evidencePath),
      },
    },
  });
  console.log(JSON.stringify({ ...report, correlationId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

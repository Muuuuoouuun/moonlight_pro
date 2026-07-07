#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const SOURCE_KEYS = ["eeocrm", "google_sheets", "gmail", "business_card"];

function parseEnvFile(filepath) {
  if (!existsSync(filepath)) return {};
  const values = {};

  for (const rawLine of readFileSync(filepath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const i = normalized.indexOf("=");
    if (i <= 0) continue;
    const key = normalized.slice(0, i).trim();
    let value = normalized.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function loadHubEnv() {
  const appDir = path.join(root, "apps", "hub");
  return {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
    ...parseEnvFile(path.join(appDir, ".env")),
    ...parseEnvFile(path.join(appDir, ".env.local")),
    ...process.env,
  };
}

function cleanUrl(value, fallback) {
  return String(value || fallback || "").trim().replace(/\/$/, "");
}

function redact(value) {
  if (!value) return "missing";
  const s = String(value);
  if (s.includes("@")) return s.replace(/^(.{2}).*(@.*)$/, "$1***$2");
  return s.length > 14 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

function printSection(title) {
  console.log(`\n${title}`);
}

function printResult(level, label, detail) {
  console.log(`[${level}] ${label}: ${detail}`);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = text || null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Keep text payload.
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function isOpaqueSupabaseApiKey(apiKey) {
  return apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_");
}

function makeSupabaseHeaders(apiKey, extra = {}) {
  const headers = { apikey: apiKey, ...extra };
  if (!isOpaqueSupabaseApiKey(apiKey)) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

async function countSupabase(env, table, filters = {}) {
  const url = cleanUrl(env.SUPABASE_URL);
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "";
  const workspaceId = env.COM_MOON_DEFAULT_WORKSPACE_ID || env.DEFAULT_WORKSPACE_ID || "";
  if (!url || !apiKey) return null;

  const target = new URL(`${url}/rest/v1/${table}`);
  target.searchParams.set("select", "id");
  if (workspaceId) target.searchParams.set("workspace_id", `eq.${workspaceId}`);
  for (const [key, value] of Object.entries(filters)) {
    target.searchParams.set(key, value);
  }

  const response = await fetch(target, {
    headers: makeSupabaseHeaders(apiKey, { prefer: "count=exact", Range: "0-0" }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return Number.parseInt((response.headers.get("content-range") || "/0").split("/")[1] || "0", 10);
}

async function crmCounts(env) {
  const counts = {
    companies: await countSupabase(env, "companies"),
    contacts: await countSupabase(env, "contacts"),
    leads: await countSupabase(env, "leads"),
    deals: await countSupabase(env, "deals"),
    customerAccounts: await countSupabase(env, "customer_accounts"),
    activities: await countSupabase(env, "crm_activities"),
    staging: {},
    leadsBySource: {},
  };
  for (const source of SOURCE_KEYS) {
    counts.staging[source] = await countSupabase(env, "lead_intake_raw", { source: `eq.${source}` });
    counts.leadsBySource[source] = await countSupabase(env, "leads", { source: `eq.${source}` });
  }
  return counts;
}

function summarizeCounts(counts) {
  if (!counts) return "unavailable";
  return [
    `companies ${counts.companies ?? "?"}`,
    `contacts ${counts.contacts ?? "?"}`,
    `leads ${counts.leads ?? "?"}`,
    `deals ${counts.deals ?? "?"}`,
    `accounts ${counts.customerAccounts ?? "?"}`,
    `activities ${counts.activities ?? "?"}`,
    `staging eeoCRM ${counts.staging.eeocrm ?? "?"}`,
    `sheets ${counts.staging.google_sheets ?? "?"}`,
    `gmail ${counts.staging.gmail ?? "?"}`,
  ].join(" · ");
}

function writeHeaders(env, hubUrl) {
  const headers = {
    "content-type": "application/json",
    origin: hubUrl,
  };
  if (env.COM_MOON_HUB_WRITE_SECRET) {
    headers["x-com-moon-hub-write-secret"] = env.COM_MOON_HUB_WRITE_SECRET;
  }
  return headers;
}

async function postAction(env, hubUrl, path, body, timeoutMs = 60_000) {
  return fetchJson(`${hubUrl}${path}`, {
    method: "POST",
    headers: writeHeaders(env, hubUrl),
    body: JSON.stringify(body),
    timeoutMs,
  });
}

function resultOk(result, key) {
  const branch = result?.data?.results?.[key] || result?.data?.[key] || result?.data;
  return Boolean(branch && typeof branch === "object" && branch.ok !== false);
}

async function pendingCount(env, source) {
  return countSupabase(env, "lead_intake_raw", { source: `eq.${source}`, status: "eq.pending" });
}

function sourceResultSummary(data) {
  if (!data || typeof data !== "object") return "no response";
  if (data.status === "preview") return `preview: ${data.reason || "unknown"}`;
  if (data.status && data.results) return `${data.status}: ${JSON.stringify(sanitizeForLog(data.results))}`;
  return JSON.stringify(sanitizeForLog(data));
}

function sanitizeForLog(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = sanitizeForLog(childValue, childKey);
    }
    return out;
  }

  if (typeof value !== "string") return value;

  if (/token|secret|authorization|connectUrl/i.test(key)) return value ? "[redacted]" : value;
  if (/email/i.test(key)) return redact(value);
  if (/spreadsheetId/i.test(key)) return redact(value);
  if (/accounts\.google\.com\/o\/oauth2/i.test(value)) return "[oauth-url-redacted]";
  return value;
}

function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    skipEeocrm: flags.has("--skip-eeocrm"),
    skipSheets: flags.has("--skip-sheets"),
    skipGmail: flags.has("--skip-gmail"),
    maxMessages: Number.parseInt(argv.find((a) => a.startsWith("--maxMessages="))?.split("=")[1] || "20", 10) || 20,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadHubEnv();
  const hubUrl = cleanUrl(env.COM_MOON_HUB_URL || env.NEXT_PUBLIC_APP_URL, "http://localhost:3000");
  const mcpUrl = cleanUrl(env.EEOCRM_MCP_URL, "http://localhost:3010/sse");
  const mcpHealthUrl = mcpUrl.endsWith("/sse") ? `${mcpUrl.slice(0, -4)}/health` : `${mcpUrl}/health`;

  printSection("CRM Fill Scope");
  printResult("INFO", "operator", `${redact(env.COM_MOON_OPERATOR_EMAIL || "junhyuk.mun@classin.com")} / ${env.COM_MOON_OPERATOR_ALIAS || "junhyuk"}`);
  printResult("INFO", "personal leads sheet", redact(env.COM_MOON_PERSONAL_LEADS_SPREADSHEET_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID));
  printResult("INFO", "eeoCRM ownerId", env.EEOCRM_OWNER_ID || "3935704427463307");

  printSection("Readiness");
  const health = await fetchJson(`${hubUrl}/api/health`, { timeoutMs: 10_000 });
  printResult(health.ok ? "PASS" : "FAIL", "Hub health", health.ok ? "reachable" : `${health.status || "no-status"} ${health.data}`);

  const mcpHealth = await fetchJson(mcpHealthUrl, { timeoutMs: 5000 });
  printResult(mcpHealth.ok ? "PASS" : "WARN", "eeoCRM MCP health", mcpHealth.ok ? "reachable" : "not running or unreachable");

  const before = await crmCounts(env);
  printResult("INFO", "before", summarizeCounts(before));

  printSection("Status");
  const [eeocrmStatus, sheetsStatus, gmailStatus] = await Promise.all([
    fetchJson(`${hubUrl}/api/hub/eeocrm`, { timeoutMs: 10_000 }),
    fetchJson(`${hubUrl}/api/hub/sheets`, { timeoutMs: 10_000 }),
    fetchJson(`${hubUrl}/api/email/gmail/status`, { timeoutMs: 10_000 }),
  ]);
  printResult(eeocrmStatus.ok ? "INFO" : "WARN", "eeoCRM", sourceResultSummary(eeocrmStatus.data));
  printResult(sheetsStatus.ok ? "INFO" : "WARN", "Sheets", sourceResultSummary(sheetsStatus.data));
  printResult(gmailStatus.ok ? "INFO" : "WARN", "Gmail", sourceResultSummary(gmailStatus.data));

  printSection("Run");
  if (!args.skipEeocrm) {
    const imported = await postAction(env, hubUrl, "/api/integrations/eeocrm/sync", { action: "import" }, 90_000);
    printResult(imported.ok ? "INFO" : "WARN", "eeoCRM import", sourceResultSummary(imported.data));
    const pending = await pendingCount(env, "eeocrm");
    if (resultOk(imported, "import") || pending > 0) {
      const promoted = await postAction(env, hubUrl, "/api/integrations/eeocrm/sync", { action: "promote" }, 90_000);
      printResult(promoted.ok ? "INFO" : "WARN", "eeoCRM promote", sourceResultSummary(promoted.data));
    } else {
      printResult("INFO", "eeoCRM promote", "skipped; import failed and no eeoCRM pending rows");
    }
    const hydrated = await postAction(env, hubUrl, "/api/integrations/eeocrm/sync", { action: "hydrate" }, 90_000);
    printResult(hydrated.ok ? "INFO" : "WARN", "eeoCRM hydrate", sourceResultSummary(hydrated.data));
  }
  if (!args.skipSheets) {
    const imported = await postAction(env, hubUrl, "/api/integrations/sheets/sync", { action: "import" }, 90_000);
    printResult(imported.ok ? "INFO" : "WARN", "Sheets import", sourceResultSummary(imported.data));
    const pending = await pendingCount(env, "google_sheets");
    if (resultOk(imported, "import") || pending > 0) {
      const promoted = await postAction(env, hubUrl, "/api/integrations/sheets/sync", { action: "promote" }, 90_000);
      printResult(promoted.ok ? "INFO" : "WARN", "Sheets promote", sourceResultSummary(promoted.data));
      const pushed = await postAction(env, hubUrl, "/api/integrations/sheets/sync", { action: "push" }, 90_000);
      printResult(pushed.ok ? "INFO" : "WARN", "Sheets push", sourceResultSummary(pushed.data));
    } else {
      printResult("INFO", "Sheets promote/push", "skipped; import failed and no Sheets pending rows");
    }
  }
  if (!args.skipGmail) {
    const result = await postAction(env, hubUrl, "/api/hub/email/scan", { maxMessages: args.maxMessages }, 60_000);
    printResult(result.ok ? "INFO" : "WARN", "Gmail scan", sourceResultSummary(result.data));
  }

  const after = await crmCounts(env);
  printResult("INFO", "after", summarizeCounts(after));
}

main().catch((error) => {
  console.error(`[FAIL] crm:fill: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

// Sheets sync orchestration — import -> staging -> promote(dedupe) -> push.
//
// Honors the design's proposal model: sheet rows land in `lead_intake_raw`
// first, then `promoteStagedLeads` creates/links `companies` + `leads`. The DB
// stays the source of truth; the sheet never upserts directly.

import {
  countSupabaseRows,
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import {
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";
import { mapRowToIntake, rowsToObjects } from "@/lib/sheets-normalize";
import {
  getValidAccessToken,
  readSheetValues,
  recordGoogleSheetsSync,
  resolveSheetsConnection,
  writeSheetValues,
} from "@/lib/google-sheets";
import {
  classinLeadChannel,
  classinLeadScore,
  classinNextAction,
} from "@/lib/sales-os/operator-context";

const STAGING_TABLE = "lead_intake_raw";

function sheetSourceRef(sheetName, normalized) {
  const sheet = String(sheetName || "Leads").trim() || "Leads";
  const ref = normalized?.source_ref || "row:unknown";
  return `${sheet}!${ref}`;
}

function compactMeta(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string" && !value.trim()) return false;
      return true;
    }),
  );
}

// --- local insert-with-return (server-write inserts are return=minimal) ------

async function insertReturning(table, record) {
  const config = resolveSupabaseConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}`, {
      method: "POST",
      headers: makeSupabaseHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: "return=representation",
      }),
      body: JSON.stringify(record),
      cache: "no-store",
    });
    if (!response.ok) {
      return { error: `http-${response.status}`, detail: await response.text().catch(() => "") };
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : rows;
  } catch (error) {
    return { error: "request-failed", detail: String(error) };
  }
}

// Insert that tolerates the staging unique-index conflict (re-import) as a skip.
async function insertStagingRow(record) {
  const config = resolveSupabaseConfig();
  if (!config) return { ok: false, reason: "missing-config" };

  try {
    const response = await fetch(`${config.url}/rest/v1/${STAGING_TABLE}`, {
      method: "POST",
      headers: makeSupabaseHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: "return=minimal",
      }),
      body: JSON.stringify(record),
      cache: "no-store",
    });
    if (response.status === 409) return { ok: false, reason: "duplicate" };
    if (!response.ok) return { ok: false, reason: `http-${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "request-failed", detail: String(error) };
  }
}

async function patchRows(table, filters, record) {
  const config = resolveSupabaseConfig();
  if (!config) return { ok: false };

  const params = new URLSearchParams();
  filters.forEach(([key, value]) => params.append(key, value));

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}?${params.toString()}`, {
      method: "PATCH",
      headers: makeSupabaseHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: "return=minimal",
      }),
      body: JSON.stringify(record),
      cache: "no-store",
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}

// --- status -----------------------------------------------------------------

export async function getSheetsSyncStatus(workspaceId = resolveDefaultWorkspaceId()) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { source: "preview", configured: Boolean(config), connected: false, spreadsheetId: null, staging: {}, recentRuns: [] };
  }

  const [connectionRows, recentRuns, pending, promoted, merged, review] = await Promise.all([
    fetchSupabaseRows("integration_connections", {
      filters: withWorkspaceFilter([["provider", eqFilter("google_sheets")]]),
      order: "created_at.desc",
      limit: 1,
    }),
    fetchSupabaseRows("sync_runs", {
      filters: withWorkspaceFilter([["payload->>provider", eqFilter("google_sheets")]]),
      order: "started_at.desc",
      limit: 10,
    }),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("pending")]])),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("promoted")]])),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("merged")]])),
    countSupabaseRows(STAGING_TABLE, withWorkspaceFilter([["status", eqFilter("review")]])),
  ]);

  const connection = connectionRows?.[0] || null;

  return {
    source: "supabase",
    configured: true,
    connected: Boolean(connection?.config?.refreshToken) || Boolean(process.env.GOOGLE_SHEETS_REFRESH_TOKEN?.trim()),
    spreadsheetId: connection?.config?.spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null,
    lastSyncAt: connection?.last_synced_at || null,
    staging: { pending: pending ?? 0, promoted: promoted ?? 0, merged: merged ?? 0, review: review ?? 0 },
    recentRuns: (recentRuns || []).map((r) => ({
      status: r.status,
      action: r.payload?.action || null,
      startedAt: r.started_at,
      error: r.error_message || null,
    })),
  };
}

// --- import: sheet -> staging ----------------------------------------------

export async function importSheetToStaging({
  workspaceId = resolveDefaultWorkspaceId(),
  sheetName = "Leads",
  range,
  headerMap = {},
} = {}) {
  const connection = await resolveSheetsConnection(workspaceId);
  if (!connection) return { ok: false, reason: "not-connected" };
  if (!connection.spreadsheetId) return { ok: false, reason: "missing-spreadsheet-id" };

  try {
    const accessToken = await getValidAccessToken(connection);
    if (!accessToken) return { ok: false, reason: "auth-failed" };

    const values = await readSheetValues({
      accessToken,
      spreadsheetId: connection.spreadsheetId,
      range: range || sheetName,
    });
    const objects = rowsToObjects(values);

    let imported = 0;
    let skipped = 0;
    for (const obj of objects) {
      const normalized = mapRowToIntake(obj, headerMap);
      if (!normalized.name && !normalized.phone) {
        skipped += 1;
        continue;
      }
      const sourceRef = sheetSourceRef(sheetName, normalized);
      const result = await insertStagingRow({
        workspace_id: workspaceId || null,
        connection_id: connection.connectionId,
        source: "google_sheets",
        source_ref: sourceRef,
        raw: obj,
        normalized: { ...normalized, sheet_name: sheetName, source_ref: sourceRef },
        match_key: normalized.match_key,
        status: "pending",
      });
      if (result.ok) imported += 1;
      else skipped += 1;
    }

    await recordGoogleSheetsSync({
      workspaceId,
      connectionId: connection.connectionId,
      status: "success",
      payload: { action: "import", sheet: sheetName, imported, skipped, total: objects.length },
    });
    return { ok: true, imported, skipped, total: objects.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordGoogleSheetsSync({
      workspaceId,
      connectionId: connection.connectionId,
      status: "failure",
      payload: { action: "import", sheet: sheetName },
      errorMessage: message,
    });
    return { ok: false, reason: "import-failed", detail: message };
  }
}

// --- promote: staging -> companies/leads (dedupe) ---------------------------

async function findCompanyByMatchKey(workspaceId, matchKey) {
  const rows = await fetchSupabaseRows("companies", {
    filters: withWorkspaceFilter([["match_key", eqFilter(matchKey)]]),
    limit: 1,
  });
  return rows?.[0] || null;
}

export async function promoteStagedLeads({
  workspaceId = resolveDefaultWorkspaceId(),
  limit = 200,
  intakeIds = null,
} = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) return { ok: false, reason: "missing-config" };

  const pendingFilters = [["status", eqFilter("pending")]];
  if (Array.isArray(intakeIds) && intakeIds.length) {
    pendingFilters.push(["id", inFilter(intakeIds)]);
  }
  const pendingRows = await fetchSupabaseRows(STAGING_TABLE, {
    filters: withWorkspaceFilter(pendingFilters),
    order: "created_at.asc",
    limit,
  });
  if (!pendingRows) return { ok: false, reason: "read-failed" };

  let promoted = 0;
  let mergedCount = 0;
  let review = 0;
  const now = new Date().toISOString();

  for (const row of pendingRows) {
    const n = row.normalized || {};
    if (!n.match_key) {
      await patchRows(STAGING_TABLE, [["id", eqFilter(row.id)]], { status: "review", note: "no match_key" });
      review += 1;
      continue;
    }

    let company = await findCompanyByMatchKey(workspaceId, n.match_key);
    let outcome = "merged";

    if (!company) {
      const created = await insertReturning("companies", {
        workspace_id: workspaceId,
        name: n.name || "이름미상 기관",
        phone: n.phone || null,
        address: n.address || null,
        match_key: n.match_key,
        status: "prospect",
        meta: compactMeta({
          source: n.source || "google_sheets",
          source_transport: "google_sheets",
          lane: "classin_sales",
          intake_id: row.id,
          campaign: n.campaign_name,
          form_id: n.form_id,
        }),
      });
      if (!created || created.error) {
        await patchRows(STAGING_TABLE, [["id", eqFilter(row.id)]], { status: "review", note: created?.error || "company-insert-failed" });
        review += 1;
        continue;
      }
      company = created;
      outcome = "promoted";
    }

    // Create/link a contact (decision-maker) when we have a name. Business cards
    // carry title/email, so the person becomes a first-class contact, not just meta.
    let contactId = null;
    const contactName = n.contact_name;
    if (contactName) {
      const existingContact = await fetchSupabaseRows("contacts", {
        filters: withWorkspaceFilter([["company_id", eqFilter(company.id)], ["name", eqFilter(contactName)]]),
        limit: 1,
      });
      if (Array.isArray(existingContact) && existingContact[0]) {
        contactId = existingContact[0].id;
      } else {
        const createdContact = await insertReturning("contacts", {
          workspace_id: workspaceId,
          company_id: company.id,
          name: contactName,
          email: n.email || null,
          title: n.title || null,
        });
        contactId = createdContact && !createdContact.error ? createdContact.id : null;
      }
    }

    const lead = await insertReturning("leads", {
      workspace_id: workspaceId,
      company_id: company.id,
      contact_id: contactId,
      name: n.name || company.name,
      email: n.email || null,
      source: n.source || "google_sheets",
      channel: classinLeadChannel(n),
      status: n.status || "new",
      score: classinLeadScore(n),
      next_action: classinNextAction(n),
      last_touch_at: now,
      updated_at: now,
      meta: compactMeta({
        lane: "classin_sales",
        source_transport: row.source || "google_sheets",
        source_family: n.source || "google_sheets",
        source_ref: n.source_ref || row.source_ref || null,
        sheet_name: n.sheet_name || null,
        match_key: n.match_key,
        address: n.address || null,
        contact_name: n.contact_name || null,
        intake_id: row.id,
        note: n.note || null,
        campaign: n.campaign_name || null,
        ad_name: n.ad_name || null,
        adset_name: n.adset_name || null,
        ad_id: n.ad_id || null,
        form_name: n.form_name || null,
        form_id: n.form_id || null,
        created_time: n.created_time || null,
        intent: n.intent || null,
        validity: n.validity || null,
        unit_count: n.unit_count ?? null,
        revenue_cny: n.revenue_cny ?? null,
        currency: n.currency || (n.revenue_cny ? "CNY" : null),
        crm_stage: n.crm_stage || null,
        customer_state: n.customer_state || null,
        extra: n.extra && Object.keys(n.extra).length ? n.extra : null,
      }),
    });

    if (!lead || lead.error) {
      await patchRows(STAGING_TABLE, [["id", eqFilter(row.id)]], { status: "review", note: lead?.error || "lead-insert-failed", company_id: company.id });
      review += 1;
      continue;
    }

    await patchRows(STAGING_TABLE, [["id", eqFilter(row.id)]], {
      status: outcome,
      company_id: company.id,
      lead_id: lead.id,
      promoted_at: now,
    });
    if (outcome === "promoted") promoted += 1;
    else mergedCount += 1;
  }

  await recordGoogleSheetsSync({
    workspaceId,
    status: "success",
    payload: { action: "promote", promoted, merged: mergedCount, review, total: pendingRows.length },
  });
  return { ok: true, promoted, merged: mergedCount, review, total: pendingRows.length };
}

// --- push: DB -> sheet (read-only live view) --------------------------------

export async function pushLeadsToSheet({
  workspaceId = resolveDefaultWorkspaceId(),
  sheetName = "Outreach Log",
} = {}) {
  const connection = await resolveSheetsConnection(workspaceId);
  if (!connection) return { ok: false, reason: "not-connected" };
  if (!connection.spreadsheetId) return { ok: false, reason: "missing-spreadsheet-id" };

  try {
    const accessToken = await getValidAccessToken(connection);
    if (!accessToken) return { ok: false, reason: "auth-failed" };

    const [leads, companies] = await Promise.all([
      fetchSupabaseRows("leads", {
        filters: withWorkspaceFilter(),
        order: "last_touch_at.desc.nullslast",
        limit: 500,
      }),
      fetchSupabaseRows("companies", { filters: withWorkspaceFilter(), limit: 1000 }),
    ]);
    const companyById = new Map((companies || []).map((c) => [c.id, c]));

    const header = ["기관", "리드명", "전화", "상태", "점수", "다음 행동", "최근 접촉"];
    const rows = (leads || []).map((lead) => {
      const company = lead.company_id ? companyById.get(lead.company_id) : null;
      return [
        company?.name || "—",
        lead.name || "—",
        company?.phone || lead.meta?.phone || "—",
        lead.status || "new",
        lead.score ?? 0,
        lead.next_action || "—",
        lead.last_touch_at ? String(lead.last_touch_at).slice(0, 10) : "—",
      ];
    });

    await writeSheetValues({
      accessToken,
      spreadsheetId: connection.spreadsheetId,
      range: `${sheetName}!A1`,
      values: [header, ...rows],
    });

    await recordGoogleSheetsSync({
      workspaceId,
      connectionId: connection.connectionId,
      status: "success",
      payload: { action: "push", sheet: sheetName, pushed: rows.length },
    });
    return { ok: true, pushed: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordGoogleSheetsSync({
      workspaceId,
      connectionId: connection.connectionId,
      status: "failure",
      payload: { action: "push", sheet: sheetName },
      errorMessage: message,
    });
    return { ok: false, reason: "push-failed", detail: message };
  }
}

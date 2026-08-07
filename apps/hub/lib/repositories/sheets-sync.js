// Sheets sync orchestration — import -> staging -> promote(dedupe) -> push.
//
// Honors the design's proposal model: sheet rows land in `lead_intake_raw`
// first, then `promoteStagedLeads` creates/links `companies` + `leads`. The DB
// stays the source of truth; the sheet never upserts directly.
//
// Both hot paths run in batch phases (one lookup + one bulk write per entity)
// instead of per-row round trips: a 200-row promote is ~8 HTTP calls, not 600+.

import {
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  inFilterQuoted,
  withWorkspaceFilter,
} from "@/lib/server-read";
import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
  upsertSupabaseRecords,
} from "@/lib/server-write";
import {
  batchInsertStagingRows,
  compactMeta,
  mapWithConcurrency,
  tallyStagingByStatus,
} from "@/lib/repositories/repo-utils";
import { mapRowToIntake, rowsToObjects } from "@/lib/sheets-normalize";
import { fetchGoogleUserEmail } from "@/lib/google-oauth";
import {
  getValidAccessToken,
  readSheetValues,
  recordGoogleSheetsSync,
  resolveSheetsConnection,
  writeSheetValues,
} from "@/lib/google-sheets";
import {
  assertOperatorEmail,
  assertPersonalLeadsSpreadsheetId,
  resolveOperatorEmail,
  resolvePersonalLeadsSpreadsheetId,
} from "@/lib/sales-os/operator-scope";
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

function scopeFailureDetail(check) {
  return [check.reason, check.source, check.actual ? `actual=${check.actual}` : null, check.expected ? `expected=${check.expected}` : null]
    .filter(Boolean)
    .join(" ");
}

async function assertSheetsPersonalScope(connection, accessToken) {
  const sheetCheck = assertPersonalLeadsSpreadsheetId(connection?.spreadsheetId);
  if (!sheetCheck.ok) return sheetCheck;

  const email = connection?.config?.email || await fetchGoogleUserEmail(accessToken);
  const emailCheck = assertOperatorEmail(email, "google_sheets");
  if (!emailCheck.ok) return emailCheck;

  return { ok: true, email: emailCheck.email, spreadsheetId: sheetCheck.spreadsheetId };
}

// --- status -----------------------------------------------------------------

export async function getSheetsSyncStatus(workspaceId = resolveDefaultWorkspaceId()) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { source: "preview", configured: Boolean(config), connected: false, spreadsheetId: null, staging: {}, recentRuns: [] };
  }

  const [connectionRows, recentRuns, staging] = await Promise.all([
    fetchSupabaseRows("integration_connections", {
      select: "id,config,last_synced_at",
      filters: withWorkspaceFilter([["provider", eqFilter("google_sheets")]]),
      order: "created_at.desc",
      limit: 1,
    }),
    fetchSupabaseRows("sync_runs", {
      select: "status,payload,started_at,error_message",
      filters: withWorkspaceFilter([["payload->>provider", eqFilter("google_sheets")]]),
      order: "started_at.desc",
      limit: 10,
    }),
    tallyStagingByStatus("google_sheets", { nullOnReadFailure: true }),
  ]);

  // 연결 행은 코어다 — 못 읽으면 connected 판정 자체가 성립하지 않는다. 예전엔 null이
  // "연결 안 됨"과 구분되지 않아 RLS 거부·타임아웃 중에도 화면이 "미연결 + 연결하기 CTA"로
  // 위장됐다(8차 잔여 M · Phase 0: preview는 미구성 전용).
  if (connectionRows === null) {
    return {
      source: "error",
      error: "sheets-connection-read-failed",
      configured: true,
      connected: false,
      spreadsheetId: null,
      staging: {},
      recentRuns: [],
    };
  }

  // 보강 소스(스테이징 집계·최근 run)는 실패해도 연결 판정을 막지 않는다 — 다만 0으로
  // 뭉개지 말고 어느 소스가 빠졌는지 이름을 남긴다.
  const failedSources = [];
  if (staging === null) failedSources.push("lead_intake_raw");
  if (recentRuns === null) failedSources.push("sync_runs");

  const connection = connectionRows[0] || null;

  return {
    source: "supabase",
    partial: failedSources.length > 0,
    failedSources,
    configured: true,
    connected: Boolean(connection?.config?.refreshToken) || Boolean(process.env.GOOGLE_SHEETS_REFRESH_TOKEN?.trim()),
    spreadsheetId: connection?.config?.spreadsheetId || resolvePersonalLeadsSpreadsheetId() || null,
    expectedOperatorEmail: resolveOperatorEmail(),
    expectedSpreadsheetId: resolvePersonalLeadsSpreadsheetId() || null,
    lastSyncAt: connection?.last_synced_at || null,
    staging: staging === null ? null : staging,
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

    const scopeCheck = await assertSheetsPersonalScope(connection, accessToken);
    if (!scopeCheck.ok) {
      await recordGoogleSheetsSync({
        workspaceId,
        connectionId: connection.connectionId,
        status: "failure",
        payload: { action: "import", sheet: sheetName, scope: "personal" },
        errorMessage: scopeFailureDetail(scopeCheck),
      });
      return { ok: false, reason: scopeCheck.reason, detail: scopeFailureDetail(scopeCheck) };
    }

    const values = await readSheetValues({
      accessToken,
      spreadsheetId: connection.spreadsheetId,
      range: range || sheetName,
    });
    const objects = rowsToObjects(values);

    let blank = 0;
    const records = [];
    for (const obj of objects) {
      const normalized = mapRowToIntake(obj, headerMap);
      if (!normalized.name && !normalized.phone) {
        blank += 1;
        continue;
      }
      const sourceRef = sheetSourceRef(sheetName, normalized);
      records.push({
        workspace_id: workspaceId || null,
        connection_id: connection.connectionId,
        source: "google_sheets",
        source_ref: sourceRef,
        raw: obj,
        normalized: { ...normalized, sheet_name: sheetName, source_ref: sourceRef },
        match_key: normalized.match_key,
        status: "pending",
      });
    }

    const { imported, skipped } = await batchInsertStagingRows(records);

    await recordGoogleSheetsSync({
      workspaceId,
      connectionId: connection.connectionId,
      status: "success",
      payload: { action: "import", sheet: sheetName, imported, skipped: skipped + blank, total: objects.length },
    });
    return { ok: true, imported, skipped: skipped + blank, total: objects.length };
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

function buildCompanyRecord(workspaceId, row) {
  const n = row.normalized || {};
  return {
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
  };
}

function buildLeadRecord(workspaceId, row, company, contactId, now) {
  const n = row.normalized || {};
  return {
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
  };
}

// Finalize staging rows in one upsert-as-patch call. Every row carries the same
// key set (PostgREST bulk requires uniform keys); id conflicts route each row to
// DO UPDATE, and workspace_id/source are echoed to satisfy insert-shape checks.
async function finalizeStagingRows(entries) {
  if (!entries.length) {
    return { persisted: true, reason: "ok" };
  }

  const payload = entries.map(({ row, patch }) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    source: row.source,
    status: patch.status,
    company_id: patch.company_id ?? null,
    lead_id: patch.lead_id ?? null,
    promoted_at: patch.promoted_at ?? null,
    note: patch.note ?? null,
  }));

  const bulk = await upsertSupabaseRecords(STAGING_TABLE, payload, { onConflict: "id" });
  if (bulk.persisted) {
    return bulk;
  }

  // Degraded path: one PATCH per row with a small concurrency cap.
  await mapWithConcurrency(entries, 8, ({ row, patch }) =>
    updateSupabaseRecord(STAGING_TABLE, [["id", eqFilter(row.id)]], patch),
  );
  return { persisted: true, reason: "fallback-patch" };
}

export async function promoteStagedLeads({
  workspaceId = resolveDefaultWorkspaceId(),
  limit = 200,
  intakeIds = null,
  // Tags the sync_runs row so per-source status views (getSheetsSyncStatus,
  // getEeocrmSyncStatus) can filter their own history instead of sharing one feed.
  provider = "google_sheets",
} = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) return { ok: false, reason: "missing-config" };

  const pendingFilters = [["status", eqFilter("pending")]];
  if (Array.isArray(intakeIds) && intakeIds.length) {
    pendingFilters.push(["id", inFilter(intakeIds)]);
  } else if (provider) {
    pendingFilters.push(["source", eqFilter(provider)]);
  }
  const pendingRows = await fetchSupabaseRows(STAGING_TABLE, {
    filters: withWorkspaceFilter(pendingFilters),
    order: "created_at.asc",
    limit,
  });
  if (!pendingRows) return { ok: false, reason: "read-failed" };

  const now = new Date().toISOString();
  const finalize = [];
  const markReview = (row, note, companyId = null) => {
    finalize.push({ row, patch: { status: "review", note, company_id: companyId } });
  };

  // Phase 1 — split rows without a match key straight into review.
  const keyedRows = [];
  for (const row of pendingRows) {
    if (row.normalized?.match_key) keyedRows.push(row);
    else markReview(row, "no match_key");
  }

  // Phase 2 — resolve companies for every match key in one read, create the
  // missing ones in one bulk insert. First row per new key counts as the
  // creator ("promoted"); later rows merge into it, same as the sequential run.
  const matchKeys = [...new Set(keyedRows.map((row) => row.normalized.match_key))];
  const companyByKey = new Map();
  if (matchKeys.length) {
    const existingCompanies = await fetchSupabaseRows("companies", {
      select: "id,name,phone,match_key",
      filters: withWorkspaceFilter([["match_key", inFilterQuoted(matchKeys)]]),
      limit: matchKeys.length,
    });
    for (const company of existingCompanies || []) {
      if (!companyByKey.has(company.match_key)) companyByKey.set(company.match_key, company);
    }
  }

  const creatorRowByKey = new Map();
  for (const row of keyedRows) {
    const key = row.normalized.match_key;
    if (!companyByKey.has(key) && !creatorRowByKey.has(key)) {
      creatorRowByKey.set(key, row);
    }
  }

  const failedCompanyKeys = new Set();
  if (creatorRowByKey.size) {
    const newCompanyRecords = [...creatorRowByKey.values()].map((row) => buildCompanyRecord(workspaceId, row));
    const created = await insertSupabaseRecord("companies", newCompanyRecords, {
      returnRepresentation: true,
      select: "id,name,phone,match_key",
    });
    if (created.persisted) {
      for (const company of created.records || []) {
        companyByKey.set(company.match_key, company);
      }
    } else {
      for (const key of creatorRowByKey.keys()) failedCompanyKeys.add(key);
    }
  }

  const promotable = [];
  for (const row of keyedRows) {
    const key = row.normalized.match_key;
    if (failedCompanyKeys.has(key)) {
      markReview(row, "company-insert-failed");
      continue;
    }
    const company = companyByKey.get(key);
    if (!company) {
      markReview(row, "company-insert-failed");
      continue;
    }
    promotable.push({
      row,
      company,
      outcome: creatorRowByKey.get(key) === row ? "promoted" : "merged",
    });
  }

  // Phase 3 — contacts: one lookup across the touched companies, one bulk
  // insert for the missing (company, name) pairs. Best-effort like before —
  // a failed contact write downgrades to contact_id null, never blocks the lead.
  const contactRows = promotable.filter(({ row }) => row.normalized?.contact_name);
  const contactIdByKey = new Map();
  if (contactRows.length) {
    const companyIds = [...new Set(contactRows.map(({ company }) => company.id))];
    const existingContacts = await fetchSupabaseRows("contacts", {
      select: "id,company_id,name",
      filters: withWorkspaceFilter([["company_id", inFilter(companyIds)]]),
      limit: 1000,
    });
    for (const contact of existingContacts || []) {
      const key = `${contact.company_id}→${contact.name}`;
      if (!contactIdByKey.has(key)) contactIdByKey.set(key, contact.id);
    }

    const newContactByKey = new Map();
    for (const { row, company } of contactRows) {
      const n = row.normalized;
      const key = `${company.id}→${n.contact_name}`;
      if (!contactIdByKey.has(key) && !newContactByKey.has(key)) {
        newContactByKey.set(key, {
          workspace_id: workspaceId,
          company_id: company.id,
          name: n.contact_name,
          email: n.email || null,
          title: n.title || null,
        });
      }
    }

    if (newContactByKey.size) {
      const createdContacts = await insertSupabaseRecord("contacts", [...newContactByKey.values()], {
        returnRepresentation: true,
        select: "id,company_id,name",
      });
      for (const contact of createdContacts.records || []) {
        contactIdByKey.set(`${contact.company_id}→${contact.name}`, contact.id);
      }
    }
  }

  // Phase 4 — leads: one bulk insert; representation rows map back by index.
  let promoted = 0;
  let mergedCount = 0;
  if (promotable.length) {
    const leadRecords = promotable.map(({ row, company }) => {
      const contactKey = `${company.id}→${row.normalized?.contact_name}`;
      const contactId = row.normalized?.contact_name ? contactIdByKey.get(contactKey) ?? null : null;
      return buildLeadRecord(workspaceId, row, company, contactId, now);
    });

    const createdLeads = await insertSupabaseRecord("leads", leadRecords, {
      returnRepresentation: true,
      select: "id",
    });

    if (createdLeads.persisted && Array.isArray(createdLeads.records)) {
      promotable.forEach(({ row, company, outcome }, index) => {
        const lead = createdLeads.records[index];
        if (!lead?.id) {
          markReview(row, "lead-insert-failed", company.id);
          return;
        }
        finalize.push({
          row,
          patch: {
            status: outcome,
            company_id: company.id,
            lead_id: lead.id,
            promoted_at: now,
          },
        });
        if (outcome === "promoted") promoted += 1;
        else mergedCount += 1;
      });
    } else {
      for (const { row, company } of promotable) {
        markReview(row, createdLeads.reason || "lead-insert-failed", company.id);
      }
    }
  }

  // Phase 5 — one bulk status write for every staging row we touched.
  await finalizeStagingRows(finalize);

  const review = finalize.filter(({ patch }) => patch.status === "review").length;
  await recordGoogleSheetsSync({
    workspaceId,
    status: "success",
    payload: { provider, action: "promote", promoted, merged: mergedCount, review, total: pendingRows.length },
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

    const scopeCheck = await assertSheetsPersonalScope(connection, accessToken);
    if (!scopeCheck.ok) {
      await recordGoogleSheetsSync({
        workspaceId,
        connectionId: connection.connectionId,
        status: "failure",
        payload: { action: "push", sheet: sheetName, scope: "personal" },
        errorMessage: scopeFailureDetail(scopeCheck),
      });
      return { ok: false, reason: scopeCheck.reason, detail: scopeFailureDetail(scopeCheck) };
    }

    const [leads, companies] = await Promise.all([
      fetchSupabaseRows("leads", {
        select: "id,name,status,score,next_action,last_touch_at,company_id,meta",
        filters: withWorkspaceFilter(),
        order: "last_touch_at.desc.nullslast",
        limit: 500,
      }),
      fetchSupabaseRows("companies", {
        select: "id,name,phone",
        filters: withWorkspaceFilter(),
        limit: 1000,
      }),
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

// Shared repository helpers — staging batch ops and small utilities that were
// previously copy-pasted between sheets-sync.js / eeocrm-sync.js / gmail-intake.js.

import { eqFilter, fetchSupabaseRows, inFilterQuoted, withWorkspaceFilter } from "@/lib/server-read";
import { insertSupabaseRecord, upsertSupabaseRecords } from "@/lib/server-write";

export const STAGING_TABLE = "lead_intake_raw";
const STAGING_STATUSES = ["pending", "promoted", "merged", "review"];

export function compactMeta(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string" && !value.trim()) return false;
      return true;
    }),
  );
}

export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Tally staging rows by status for one source in a single fetch — replaces the
// previous four count=exact scans per status view.
// 읽기가 거부되면 null을 돌려준다 — `rows || []`로 뭉개면 전 상태 0건 집계가
// "유입이 없다"는 사실처럼 렌더된다(호출부가 실패를 명명해야 한다).
export async function tallyStagingByStatus(source) {
  const rows = await fetchSupabaseRows(STAGING_TABLE, {
    select: "status",
    filters: withWorkspaceFilter([["source", eqFilter(source)]]),
    limit: 5000,
  });

  if (!Array.isArray(rows)) return null;

  const tally = Object.fromEntries(STAGING_STATUSES.map((status) => [status, 0]));
  for (const row of rows) {
    if (row.status in tally) tally[row.status] += 1;
  }
  return tally;
}

// Bulk-load staging rows, skipping rows whose (workspace, source, source_ref)
// already landed. Pre-checks existing refs, bulk-inserts the rest; falls back to
// capped-concurrency single inserts when the bulk write is rejected (e.g. the
// pre-0018 partial unique index cannot arbitrate on_conflict).
export async function batchInsertStagingRows(records) {
  if (!records.length) {
    return { imported: 0, skipped: 0 };
  }

  const existing = await fetchSupabaseRows(STAGING_TABLE, {
    select: "source_ref",
    filters: withWorkspaceFilter([
      ["source", eqFilter(records[0].source)],
      ["source_ref", inFilterQuoted(records.map((r) => r.source_ref))],
    ]),
    limit: records.length,
  });
  const known = new Set((existing || []).map((row) => row.source_ref));
  const fresh = records.filter((record) => !known.has(record.source_ref));

  if (!fresh.length) {
    return { imported: 0, skipped: records.length };
  }

  const bulk = await upsertSupabaseRecords(STAGING_TABLE, fresh, {
    onConflict: "workspace_id,source,source_ref",
    ignoreDuplicates: true,
  });

  if (bulk.persisted) {
    return { imported: fresh.length, skipped: records.length - fresh.length };
  }

  const singles = await mapWithConcurrency(fresh, 8, (record) =>
    insertSupabaseRecord(STAGING_TABLE, record),
  );
  const imported = singles.filter((result) => result.persisted).length;
  return { imported, skipped: records.length - imported };
}

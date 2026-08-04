// Engine Supabase access — delegates to the shared @com-moon/supabase-rest
// client (timeouts, bulk writes, duplicate detection, error logging live there).
// Kept as a module so engine call sites keep their import path and the loose
// `any` row typing they were written against.
import {
  checkSupabaseRest as sharedCheckSupabaseRest,
  countSupabaseRows as sharedCountSupabaseRows,
  fetchSupabaseRows as sharedFetchSupabaseRows,
  insertSupabaseRecord as sharedInsertSupabaseRecord,
  updateSupabaseRecord as sharedUpdateSupabaseRecord,
  upsertSupabaseRecords as sharedUpsertSupabaseRecords,
  type SupabaseFilter,
  type SupabaseHealthResult,
  type SupabaseQueryOptions,
  type SupabaseUpsertOptions,
  type SupabaseWriteOptions,
  type SupabaseWriteResult,
} from "@com-moon/supabase-rest";

export { inFilter } from "@com-moon/supabase-rest";

export function checkSupabaseRest(table = "projects"): Promise<SupabaseHealthResult> {
  return sharedCheckSupabaseRest(table);
}

export function fetchSupabaseRows(table: string, options: SupabaseQueryOptions = {}): Promise<any[] | null> {
  return sharedFetchSupabaseRows<any>(table, options);
}

export function countSupabaseRows(table: string, filters: SupabaseFilter[] = []): Promise<number | null> {
  return sharedCountSupabaseRows(table, filters);
}

export function insertSupabaseRecord(
  table: string,
  record: Record<string, unknown> | Array<Record<string, unknown>>,
  options: SupabaseWriteOptions = {},
): Promise<SupabaseWriteResult<any>> {
  return sharedInsertSupabaseRecord<any>(table, record, options);
}

export function upsertSupabaseRecords(
  table: string,
  records: Record<string, unknown> | Array<Record<string, unknown>>,
  options: SupabaseUpsertOptions = {},
): Promise<SupabaseWriteResult<any>> {
  return sharedUpsertSupabaseRecords<any>(table, records, options);
}

export function updateSupabaseRecord(
  table: string,
  filters: SupabaseFilter[],
  record: Record<string, unknown>,
  options: SupabaseWriteOptions = {},
): Promise<SupabaseWriteResult<any>> {
  return sharedUpdateSupabaseRecord<any>(table, filters, record, options);
}

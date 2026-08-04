export interface SupabaseRestConfig {
  url: string;
  apiKey: string;
}

export type SupabaseFilter = [string, string];

export interface SupabaseQueryOptions {
  select?: string;
  filters?: SupabaseFilter[];
  limit?: number;
  order?: string;
  timeoutMs?: number;
  /** Set false to bypass in-flight GET dedup for this call. */
  dedupe?: boolean;
  /** "exact" adds Prefer: count=exact and fills `count` in the detailed result. */
  count?: "exact";
}

export interface SupabaseReadError {
  reason: string;
  status: number | null;
  detail: string;
}

export interface SupabaseDetailedReadResult<T = Record<string, unknown>> {
  rows: T[] | null;
  /** Total count of the filtered set — only when the query asked for count: "exact". */
  count: number | null;
  configured: boolean;
  error: SupabaseReadError | null;
}

export interface SupabaseWriteResult<T = Record<string, unknown>> {
  persisted: boolean;
  reason: string;
  detail?: string;
  record?: T | null;
  records?: T[];
  id?: string | null;
}

export interface SupabaseWriteOptions {
  returnRepresentation?: boolean;
  select?: string;
  timeoutMs?: number;
}

export interface SupabaseUpsertOptions extends SupabaseWriteOptions {
  /** Comma-separated conflict target columns, e.g. "workspace_id,provider". */
  onConflict?: string;
  /** true → resolution=ignore-duplicates (DO NOTHING) instead of merge. */
  ignoreDuplicates?: boolean;
}

export interface SupabaseHealthResult {
  configured: boolean;
  reachable: boolean;
  status: number | null;
  reason: string;
}

export function resolveSupabaseConfig(): SupabaseRestConfig | null;
export function makeSupabaseHeaders(
  apiKey: string,
  options?: { contentType?: string; prefer?: string },
): Record<string, string>;
export function resolveDefaultWorkspaceId(): string;
export function eqFilter(value: string | number): string;
export function inFilter(values: Array<string | number>): string;
export function withWorkspaceFilter(filters?: SupabaseFilter[]): SupabaseFilter[];

export function fetchSupabaseRows<T = Record<string, unknown>>(
  table: string,
  options?: SupabaseQueryOptions,
): Promise<T[] | null>;
export function fetchSupabaseRowsDetailed<T = Record<string, unknown>>(
  table: string,
  options?: SupabaseQueryOptions,
): Promise<SupabaseDetailedReadResult<T>>;
export function countSupabaseRows(
  table: string,
  filters?: SupabaseFilter[],
  options?: { timeoutMs?: number },
): Promise<number | null>;

export function insertSupabaseRecord<T = Record<string, unknown>>(
  table: string,
  record: Record<string, unknown> | Array<Record<string, unknown>>,
  options?: SupabaseWriteOptions,
): Promise<SupabaseWriteResult<T>>;
export function upsertSupabaseRecords<T = Record<string, unknown>>(
  table: string,
  records: Record<string, unknown> | Array<Record<string, unknown>>,
  options?: SupabaseUpsertOptions,
): Promise<SupabaseWriteResult<T>>;
export function updateSupabaseRecord<T = Record<string, unknown>>(
  table: string,
  filters: SupabaseFilter[],
  record?: Record<string, unknown>,
  options?: SupabaseWriteOptions,
): Promise<SupabaseWriteResult<T>>;
export function deleteSupabaseRecord(
  table: string,
  filters: SupabaseFilter[],
  options?: { timeoutMs?: number },
): Promise<SupabaseWriteResult>;

export function checkSupabaseRest(
  table?: string,
  options?: { timeoutMs?: number },
): Promise<SupabaseHealthResult>;

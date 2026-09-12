type JsonRecord = Record<string, unknown>;
export type InquiryContext = { workspaceId?: string };
export type InquiryResult = JsonRecord & { status: string; error?: string; retryable?: boolean };
type RpcResult = { ok: boolean; data?: unknown; error?: string };
type Dependencies = { rpc: (name: string, params: JsonRecord) => Promise<RpcResult> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['new', 'in_progress', 'waiting', 'closed', 'ignored']);
const KINDS = new Set(['sales', 'support', 'partnership', 'general']);
const CLASSIFICATIONS = new Set(['inquiry', 'review', 'ignored']);
const SCOPES = new Set(['classin', 'personal', 'unclassified']);
const RESULTS = new Set(['saved', 'duplicate', 'conflict', 'invalid-input', 'error', 'busy', 'not-found']);

export function inquiryRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function string(value: unknown, max: number, required = false): string | null {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.includes('\0')) return null;
  const text = value.trim();
  return text.length > max || (required && !text) ? null : text;
}

function uuid(value: unknown) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

export function inquiryTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  // Preserve Postgres microseconds for compare-and-swap tokens.
  return value;
}

function sourceUrl(value: unknown) {
  const text = string(value, 2048);
  if (text === null || !text) return text;
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function contact(input: unknown) {
  if (input == null) return { name: '', email: '', phone: '' };
  const record = inquiryRecord(input);
  if (!record) return null;
  const name = string(record.name, 200), email = string(record.email, 320), phone = string(record.phone, 100);
  if (name === null || email === null || phone === null || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null;
  return { name, email, phone };
}

export function normalizeInquiryCommand(input: unknown, context: InquiryContext) {
  const workspaceId = uuid(context.workspaceId), body = inquiryRecord(input);
  const invalid = (error: string) => ({ ok: false as const, error });
  if (!workspaceId) return invalid('missing-workspace');
  if (!body) return invalid('invalid-command');
  const action = body.action;
  let command: JsonRecord;
  if (action === 'ingest') {
    const sourceAccountKey = string(body.sourceAccountKey, 320, true), externalEventId = string(body.externalEventId, 300, true);
    const threadId = string(body.threadId, 300), canonicalKey = string(body.canonicalKey, 700);
    const subject = string(body.subject, 500), text = string(body.body, 40000, true), who = contact(body.contact);
    const reason = string(body.reason, 1000), receivedAt = inquiryTimestamp(body.receivedAt), url = sourceUrl(body.sourceUrl);
    const kind = body.kind ?? 'general', classification = body.classification ?? 'review', orgScope = body.orgScope ?? 'unclassified';
    if (!['gmail', 'webhook', 'manual'].includes(String(body.source)) || typeof body.source !== 'string' ||
      !sourceAccountKey || !externalEventId || threadId === null || canonicalKey === null || subject === null || !text ||
      !who || reason === null || !receivedAt || url === null || typeof kind !== 'string' || !KINDS.has(kind) ||
      typeof classification !== 'string' || !CLASSIFICATIONS.has(classification) || typeof orgScope !== 'string' || !SCOPES.has(orgScope) ||
      (body.historical !== undefined && typeof body.historical !== 'boolean')) return invalid('invalid-inquiry');
    command = { action, source: body.source, sourceAccountKey, externalEventId, threadId: threadId || null, canonicalKey: canonicalKey || null,
      subject: subject || '제목 없는 문의', body: text, contact: who, kind, classification, reason, orgScope,
      receivedAt: new Date(receivedAt).toISOString(), historical: body.historical ?? false, sourceUrl: url || null };
    if (body.leaseToken !== undefined || body.accountKey !== undefined) {
      const leaseToken = uuid(body.leaseToken);
      if (body.source !== 'gmail' || !leaseToken || body.accountKey !== sourceAccountKey) return invalid('invalid-ingest-lease');
      command.leaseToken = leaseToken;
      command.accountKey = sourceAccountKey;
    }
  } else if (action === 'mark_read') {
    const id = uuid(body.id);
    if (!id || !Number.isSafeInteger(body.seenSeq) || Number(body.seenSeq) < 0) return invalid('invalid-read-sequence');
    command = { action, id, seenSeq: body.seenSeq };
  } else if (action === 'update') {
    const id = uuid(body.id), expectedUpdatedAt = inquiryTimestamp(body.expectedUpdatedAt), raw = inquiryRecord(body.patch);
    if (!id || !expectedUpdatedAt || !raw || !Object.keys(raw).length) return invalid('invalid-update');
    const patch: JsonRecord = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'status' || key === 'kind' || key === 'classification' || key === 'org_scope') {
        const choices = key === 'status' ? STATUSES : key === 'kind' ? KINDS : key === 'classification' ? CLASSIFICATIONS : SCOPES;
        if (typeof value !== 'string' || !choices.has(value)) return invalid('invalid-update');
        patch[key] = value;
      } else if (['lead_id', 'deal_id', 'case_id'].includes(key)) {
        if (value !== null && !uuid(value)) return invalid('invalid-reference');
        patch[key] = value === null ? null : uuid(value);
      } else if (['subject', 'reason', 'contact_name', 'contact_email', 'contact_phone'].includes(key)) {
        const max = key === 'subject' ? 500 : key === 'reason' ? 1000 : key === 'contact_name' ? 200 : key === 'contact_email' ? 320 : 100;
        const text = string(value, max, key === 'subject');
        if (text === null || (key === 'contact_email' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))) return invalid('invalid-update');
        patch[key] = text;
      } else return invalid('unsupported-patch-field');
    }
    command = { action, id, expectedUpdatedAt, patch };
  } else if (action === 'split') {
    const id = uuid(body.id), eventId = uuid(body.eventId), idempotencyKey = string(body.idempotencyKey, 200, true);
    if (!id || !eventId || !idempotencyKey) return invalid('invalid-split');
    command = { action, id, eventId, idempotencyKey };
  } else if (action === 'claim_sync' || action === 'save_sync' || action === 'release_sync') {
    const accountKey = string(body.accountKey, 320, true);
    if (!accountKey) return invalid('invalid-account');
    command = { action, accountKey };
    if (action !== 'claim_sync') {
      const leaseToken = uuid(body.leaseToken);
      if (!leaseToken) return invalid('invalid-lease');
      command.leaseToken = leaseToken;
    }
    if (action === 'save_sync') {
      const state = inquiryRecord(body.state), error = string(body.error, 500);
      if (!state || error === null || Buffer.byteLength(JSON.stringify(state), 'utf8') > 32768 ||
        (body.success !== undefined && typeof body.success !== 'boolean')) return invalid('invalid-sync-state');
      command.state = state;
      if (body.success !== undefined) command.success = body.success;
      if (body.error !== undefined) command.error = error;
    }
  } else return invalid('unknown-action');
  return { ok: true as const, params: { p_workspace_id: workspaceId, p_command: command } };
}

export async function executeInquiryCommand(input: unknown, context: InquiryContext, dependencies: Dependencies): Promise<InquiryResult> {
  const normalized = normalizeInquiryCommand(input, context);
  if (!normalized.ok) return { status: 'invalid-input', error: normalized.error, retryable: false };
  try {
    const result = await dependencies.rpc('inquiry_command_v1', normalized.params);
    if (!result.ok) return { status: 'error', error: result.error || 'inquiry-rpc-failed', retryable: true };
    const response = inquiryRecord(result.data);
    if (!response || typeof response.status !== 'string' || !RESULTS.has(response.status)) {
      return { status: 'error', error: 'invalid-inquiry-response', retryable: true };
    }
    return response as InquiryResult;
  } catch { return { status: 'error', error: 'inquiry-rpc-failed', retryable: true }; }
}

import { createHash, timingSafeEqual } from 'node:crypto';
import { inquiryRecord, normalizeInquiryCommand, type InquiryContext, type InquiryResult } from './inquiry-command.ts';

type Execute = (command: Record<string, unknown>, context: InquiryContext) => Promise<InquiryResult>;
type Source = { id: string; token: string; workspaceId: string; orgScope: string; formIds: string[] };
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,299}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readInquiryJson(req: Request, options: { maxBytes?: number; timeoutMs?: number } = {}) {
  const maxBytes = options.maxBytes ?? 128 * 1024, timeoutMs = options.timeoutMs ?? 5000;
  const fail = (error: string) => ({ ok: false as const, error });
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { void req.body?.cancel().catch(() => {}); return fail('body-too-large'); }
  if (!req.body) return fail('invalid-json');
  const reader = req.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error('body-timeout')); void reader.cancel().catch(() => {}); }, timeoutMs);
  });
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0, text = '';
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); return fail('body-too-large'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = inquiryRecord(JSON.parse(text));
    return body ? { ok: true as const, body } : fail('invalid-json');
  } catch (error) {
    void reader.cancel().catch(() => {});
    return fail(error instanceof Error && error.message === 'body-timeout' ? 'body-timeout' : 'invalid-json');
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

function sameSecret(candidate: string, expected: string) {
  // Hash to fixed-size digests so timingSafeEqual also covers unequal lengths.
  return timingSafeEqual(createHash('sha256').update(candidate).digest(), createHash('sha256').update(expected).digest());
}

function bearer(req: Request) {
  const header = req.headers.get('authorization') || '';
  return /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() || '';
}

function response(body: InquiryResult, status: number) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function resultResponse(result: InquiryResult, intake = false) {
  const status = result.status === 'saved' ? (intake ? 201 : 200) : result.status === 'duplicate' ? 200 :
    result.status === 'conflict' || result.status === 'busy' ? 409 : result.status === 'invalid-input' ? 400 : result.status === 'not-found' ? 404 : 502;
  return response(result, status);
}

function readSources(raw: string | undefined): Source[] | null {
  try {
    const parsed: unknown = JSON.parse(raw || 'null');
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100) return null;
    const ids = new Set();
    for (const value of parsed) {
      const entry = inquiryRecord(value);
      if (!entry || typeof entry.id !== 'string' || !SOURCE_ID.test(entry.id) || ids.has(entry.id) ||
        typeof entry.token !== 'string' || !entry.token.trim() || entry.token.length > 4096 ||
        typeof entry.workspaceId !== 'string' || !UUID.test(entry.workspaceId) || !['classin', 'personal', 'unclassified'].includes(String(entry.orgScope)) ||
        !Array.isArray(entry.formIds) || !entry.formIds.length || !entry.formIds.every(id => typeof id === 'string' && SOURCE_ID.test(id))) return null;
      ids.add(entry.id);
    }
    return parsed as Source[];
  } catch { return null; }
}

export async function handleInquiryIntake(req: Request, options: { sourceConfig?: string; execute: Execute }) {
  const sources = readSources(options.sourceConfig);
  if (!sources) return response({ status: 'error', error: 'inquiry-sources-not-configured', retryable: true }, 503);
  const source = sources.find(entry => entry.id === req.headers.get('x-inquiry-source'));
  const token = bearer(req);
  // External credentials are mandatory, regardless of local open-webhook mode.
  if (!source || !token || !sameSecret(token, source.token)) return response({ status: 'unauthorized', error: 'invalid-source-credentials', retryable: false }, 401);
  const parsed = await readInquiryJson(req, { maxBytes: 64 * 1024 });
  if (!parsed.ok) return response({ status: 'invalid-input', error: parsed.error, retryable: parsed.error === 'body-timeout' }, 400);
  const body = parsed.body;
  if (typeof body.formId !== 'string' || !source.formIds.includes(body.formId)) return response({ status: 'unauthorized', error: 'form-not-allowed', retryable: false }, 403);
  const idempotency = req.headers.get('idempotency-key');
  if (typeof body.eventId !== 'string' || !EVENT_ID.test(body.eventId) || (idempotency !== null && idempotency !== body.eventId) ||
    body.eventType !== 'inquiry.created' || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 20000) {
    return response({ status: 'invalid-input', error: 'invalid-inquiry-event', retryable: false }, 400);
  }
  const who = inquiryRecord(body.contact);
  if (!who || (!who.email && !who.phone)) return response({ status: 'invalid-input', error: 'reply-channel-required', retryable: false }, 400);
  const command = { action: 'ingest', source: 'webhook', sourceAccountKey: source.id, externalEventId: body.eventId,
    canonicalKey: `form:${source.id}:${body.formId}:${body.eventId}`, subject: body.subject ?? '제목 없는 문의', body: body.message,
    contact: who, kind: 'general', classification: 'inquiry', reason: 'registered-form', orgScope: source.orgScope,
    receivedAt: body.submittedAt, historical: false, sourceUrl: body.pageUrl };
  const context = { workspaceId: source.workspaceId };
  const validated = normalizeInquiryCommand(command, context);
  if (!validated.ok) return response({ status: 'invalid-input', error: validated.error, retryable: false }, 400);
  const normalizedContact = inquiryRecord(validated.params.p_command.contact);
  if (!normalizedContact?.email && !normalizedContact?.phone) return response({ status: 'invalid-input', error: 'reply-channel-required', retryable: false }, 400);
  try { return resultResponse(await options.execute(validated.params.p_command, context), true); }
  catch { return response({ status: 'error', error: 'inquiry-save-failed', retryable: true }, 502); }
}

export async function handleInquiryCommand(req: Request, options: { sharedSecret?: string; defaultWorkspaceId?: string; execute: Execute }) {
  const expected = options.sharedSecret?.trim();
  if (!expected) return response({ status: 'error', error: 'shared-secret-not-configured', retryable: true }, 503);
  const candidate = req.headers.get('x-com-moon-shared-secret')?.trim() || bearer(req);
  if (!candidate || !sameSecret(candidate, expected)) return response({ status: 'unauthorized', error: 'invalid-shared-secret', retryable: false }, 401);
  const parsed = await readInquiryJson(req);
  if (!parsed.ok) return response({ status: 'invalid-input', error: parsed.error, retryable: parsed.error === 'body-timeout' }, 400);
  const workspaceId = typeof parsed.body.workspaceId === 'string' ? parsed.body.workspaceId.trim() : options.defaultWorkspaceId?.trim();
  const validated = normalizeInquiryCommand(parsed.body, { workspaceId });
  if (!validated.ok) return response({ status: 'invalid-input', error: validated.error, retryable: false }, 400);
  try { return resultResponse(await options.execute(validated.params.p_command, { workspaceId })); }
  catch { return response({ status: 'error', error: 'inquiry-save-failed', retryable: true }, 502); }
}

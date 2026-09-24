// 휴대폰 사건 intake의 HTTP 경계 — 인증·본문·판정·HTTP 의미를 여기서 고정하고, 저장은 주입받는다.
//
// 인증은 폰 전용 시크릿(COM_MOON_PHONE_INTAKE_SECRET)이다. Hub→Engine 공용 시크릿을 쓰지 않는
// 이유: 폰의 자동화 앱은 시크릿을 평문으로 들고 다닌다. 폰을 잃어도 이 경로 하나만 열리게 한다.
// 로컬 open-webhook 모드에서도 시크릿은 필수다(문의 intake와 같은 원칙).

import { createHash, timingSafeEqual } from 'node:crypto';
import {
  buildPhoneDirectory,
  isConversation,
  matchPhoneEvent,
  normalizePhoneEvent,
  parsePhoneBody,
  phoneCandidatePayload,
  phoneEventDedupeKey,
  phoneNotice,
  PHONE_EVENT_SOURCE,
  type DirectoryRows,
  type PhoneEvent,
} from './phone-capture.ts';

export const PHONE_SECRET_HEADER = 'x-com-moon-phone-secret';
export { PHONE_EVENT_SOURCE };

type StoreResult = { status: 'saved'; id?: string | null } | { status: 'duplicate' } | { status: 'failed'; reason?: string };

export type PhoneIntakeDeps = {
  secret?: string;
  workspaceId?: string;
  now?: () => Date;
  loadDirectory: () => Promise<DirectoryRows | null>;
  store: (row: {
    eventType: string;
    providerEventId: string;
    payload: Record<string, unknown>;
    receivedAt: string;
  }) => Promise<StoreResult>;
  // 고객이 아닌 사건은 내용 없이 오늘 개수만 센다. 실패해도 응답은 바뀌지 않는다.
  countDiscard?: (type: PhoneEvent['type'], now: Date) => Promise<void>;
  // 저장 뒤 보존 기한 정리(선택). 실패해도 응답은 바뀌지 않는다.
  afterStore?: (now: Date) => Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameSecret(candidate: string, expected: string) {
  return timingSafeEqual(createHash('sha256').update(candidate).digest(), createHash('sha256').update(expected).digest());
}

function bearer(req: Request) {
  return /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1]?.trim() || '';
}

// 인증 뒤에만 읽는다. 알림 미리보기 하나에 16KB면 넉넉하다.
const MAX_BODY_BYTES = 16 * 1024;
async function readBoundedText(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') || '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const text = await req.text().catch(() => '');
  return Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES ? null : text;
}

function respond(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function handlePhoneEventIntake(req: Request, deps: PhoneIntakeDeps) {
  const expected = deps.secret?.trim();
  if (!expected) return respond({ status: 'error', error: 'phone-intake-not-configured', retryable: false }, 503);
  const candidate = req.headers.get(PHONE_SECRET_HEADER)?.trim() || bearer(req);
  if (!candidate || !sameSecret(candidate, expected)) {
    return respond({ status: 'unauthorized', error: 'invalid-phone-secret', retryable: false }, 401);
  }
  const workspaceId = deps.workspaceId?.trim();
  if (!workspaceId || !UUID.test(workspaceId)) {
    return respond({ status: 'error', error: 'workspace-not-configured', retryable: false }, 503);
  }

  const raw = await readBoundedText(req);
  if (raw == null) return respond({ status: 'invalid-input', error: 'body-too-large', retryable: false }, 400);
  const body = parsePhoneBody(raw);
  if (!body) return respond({ status: 'invalid-input', error: 'invalid-json', retryable: false }, 400);
  const now = deps.now ? deps.now() : new Date();
  const normalized = normalizePhoneEvent(body, now);
  if (!normalized.ok) return respond({ status: 'invalid-input', error: normalized.error, retryable: false }, 400);
  const event = normalized.event;

  if (!isConversation(event)) return respond({ status: 'ignored', reason: 'no-conversation' }, 200);

  let rows: DirectoryRows | null = null;
  try { rows = await deps.loadDirectory(); } catch { rows = null; }
  if (!rows) return respond({ status: 'error', error: 'customer-directory-read-failed', retryable: true }, 502);

  const match = matchPhoneEvent(event, buildPhoneDirectory(rows));
  if (match.status !== 'matched') {
    // 고객이 아니거나(unmatched) 누구인지 가를 수 없으면(ambiguous) 내용 없이 버린다.
    // 응답에도 이름·번호를 싣지 않는다.
    try { await deps.countDiscard?.(event.type, now); } catch { /* 개수는 보조 정보다 */ }
    return respond({ status: 'ignored', reason: match.status === 'ambiguous' ? 'ambiguous-customer' : 'not-a-customer' }, 200);
  }

  let stored: StoreResult;
  try {
    stored = await deps.store({
      eventType: `phone.${event.type}`,
      providerEventId: phoneEventDedupeKey(event),
      payload: phoneCandidatePayload(event, match),
      receivedAt: now.toISOString(),
    });
  } catch {
    stored = { status: 'failed', reason: 'store-threw' };
  }
  if (stored.status === 'duplicate') return respond({ status: 'duplicate' }, 200);
  if (stored.status !== 'saved') return respond({ status: 'failed', error: 'phone-event-save-failed', retryable: true }, 502);

  try { await deps.afterStore?.(now); } catch { /* 보존 정리는 다음 intake에서 다시 돈다 */ }
  return respond({ status: 'saved', id: stored.id ?? null, notice: phoneNotice(event, match.customer) }, 201);
}

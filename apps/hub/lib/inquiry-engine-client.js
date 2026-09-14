// Hub BFF transport. Engine alone owns inquiry mutations.
export async function forwardInquiryCommand(command, { env = process.env, fetchImpl = fetch } = {}) {
  const base = String(env.COM_MOON_ENGINE_URL || '').trim().replace(/\/$/, '');
  const secret = String(env.COM_MOON_SHARED_WEBHOOK_SECRET || '').trim();
  if (!base) return { ok: false, httpStatus: 202, data: { status: 'preview', error: 'engine-not-configured' } };
  if (!secret) return { ok: false, httpStatus: 503, data: { status: 'error', error: 'shared-secret-not-configured' } };
  try {
    const response = await fetchImpl(`${base}/api/inquiries/command`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': secret },
      body: JSON.stringify(command), cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    const ok = response.ok && ['saved', 'duplicate'].includes(data?.status);
    const httpStatus = ok ? response.status : response.ok && data?.status === 'error' ? 502 : response.status;
    return { ok, httpStatus, data };
  } catch {
    return { ok: false, httpStatus: 502, data: { status: 'error', error: 'inquiry-engine-unavailable', retryable: true } };
  }
}

// Public browser inputs can never impersonate a provider or choose a tenant.
export function publicInquiryCommand(input, workspaceId) {
  if (!input || !workspaceId) return null;
  const { action } = input;
  if (action === 'ingest') {
    return { action, workspaceId, source: 'manual', sourceAccountKey: 'operator',
      externalEventId: input.externalEventId, subject: input.subject, body: input.body,
      contact: input.contact, kind: input.kind || 'general', classification: 'inquiry',
      reason: '직접 등록', orgScope: input.orgScope || 'unclassified', receivedAt: input.receivedAt };
  }
  if (action === 'mark_read') return { action, workspaceId, id: input.id, seenSeq: input.seenSeq };
  if (action === 'split') return { action, workspaceId, id: input.id, eventId: input.eventId, idempotencyKey: input.idempotencyKey };
  if (action === 'update') return { action, workspaceId, id: input.id, patch: input.patch, expectedUpdatedAt: input.expectedUpdatedAt };
  return null;
}

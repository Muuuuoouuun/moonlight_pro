import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { isAgentUuid } from '@com-moon/agent-contracts';
import { parseOfficeDeliberation } from '@com-moon/agent-contracts/office';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowContext, parseOfficeWorkflowResult, parseOfficeWorkflowOrigin } from '@com-moon/agent-contracts/office-workflow';

const INTENTS = new Set(['weekly_report', 'customer_reply']);
const errorResult = (error, status = 'error', persisted = false) => ({ status, error, persistence: { persisted }, capabilities: { generate: false, applyTask: false } });
const identityValid = context => isAgentUuid(context?.workspaceId) && /^[a-zA-Z0-9._:@/-]{1,128}$/.test(context?.actorId || '');
const publicApplication = application => application ? Object.fromEntries(['state', 'commandId', 'action', 'targetRef', 'entityId', 'error', 'entityConfirmed'].filter(key => application[key] !== undefined).map(key => [key, application[key]])) : null;

// Browser responses never contain raw input/context snapshots, attempt tokens,
// command payloads, RPC exceptions, service credentials or database actor keys.
export function projectOfficeReceipt(envelope) {
  const row = envelope?.request;
  if (!row) return errorResult(envelope?.error || 'office-receipt-unavailable', envelope?.status || 'unknown', envelope?.persisted ?? null);
  const status = envelope.status;
  let deliberation;
  // Project only the typed meeting controls, never arbitrary snapshot fields.
  if (row.mode === 'council' && row.input_snapshot?.deliberation) {
    try { deliberation = parseOfficeDeliberation(row.input_snapshot.deliberation, row.participants); } catch { /* Legacy/malformed controls are not exposed. */ }
  }
  return {
    status, state: status, requestId: row.id, intent: row.intent, scope: row.scope, originRef: row.origin_ref,
    ownerId: row.owner_id, mode: row.mode, participants: row.participants, createdAt: row.created_at,
    ...(deliberation ? { deliberation } : {}),
    logState: row.log_state ?? (row.state === 'generated' ? 'unknown' : null),
    parentRequestId: row.parent_request_id ?? null, expired: status === 'expired', resultRevision: row.result_revision ?? null,
    result: status === 'expired' ? null : row.state === 'generated' ? row.result ?? null : null,
    persistence: { persisted: true }, application: publicApplication(row.application),
    ...(row.state === 'error' && row.result?.error ? { error: row.result.error } : {}),
    capabilities: { generate: false, applyTask: status === 'generated' && row.context_snapshot?.capabilities?.applyTask === true && !row.application },
  };
}

// Generation-time refs vs current refs: what the operator should know before linking anyway.
export function officeContextChange(storedRefs, currentRefs) {
  const before = new Map((Array.isArray(storedRefs) ? storedRefs : []).map(ref => [ref?.id, ref]));
  const after = new Map((Array.isArray(currentRefs) ? currentRefs : []).map(ref => [ref?.id, ref]));
  let added = 0, updated = 0, removed = 0;
  for (const [id, ref] of after) {
    if (!before.has(id)) added++;
    else if ((before.get(id)?.updatedAt ?? null) !== (ref?.updatedAt ?? null)) updated++;
  }
  for (const id of before.keys()) if (!after.has(id)) removed++;
  return { added, updated, removed };
}

export function createOfficeWorkflowService(deps) {
  const now = () => deps.now?.() ?? Date.now();
  const recoverySecret = () => typeof deps.recoverySecret === 'function' ? deps.recoverySecret() : deps.recoverySecret;
  const rpc = (name, params, identity) => deps.rpc(name, { p_workspace_id: identity.workspaceId, p_actor_id: identity.actorId, ...params });
  const failure = (error, writing = false) => errorResult(error?.preparation ? 'office-storage-not-ready' : writing ? 'office-outcome-unknown' : 'office-read-unavailable', error?.preparation ? 'preview' : writing ? 'unknown' : 'error', writing ? null : false);
  function query(input) {
    if (!INTENTS.has(input?.intent) || !['personal', 'classin'].includes(input.scope)) throw new Error('invalid-office-query');
    return { intent: input.intent, scope: input.scope, originRef: parseOfficeWorkflowOrigin(input.originRef, input.intent) };
  }
  async function internalReceipt(id, identity, request = null) {
    const receipt = await rpc('office_request_receipt_v1', { p_request_id: id, p_request: request }, identity);
    if (receipt.request?.application && receipt.status !== 'conflict') {
      try { return await rpc('office_application_refresh_v1', { p_request_id: id }, identity); } catch { /* The existing receipt remains useful; no dispatch here. */ }
    }
    return receipt;
  }
  async function receipt(id, identity) {
    if (!isAgentUuid(id) || !identityValid(identity)) return errorResult('invalid-office-request', 'invalid-input');
    try { return projectOfficeReceipt(await internalReceipt(id.toLowerCase(), identity)); }
    catch (error) { return failure(error); }
  }
  async function context(input, identity) {
    if (!identityValid(identity)) return errorResult('office-workspace-not-configured', 'preview');
    try {
      const normalized = query(input);
      const resolved = await deps.readContext(normalized, identity);
      if (resolved.status !== 'ready') return resolved;
      // Reading an empty list is also a migration/RPC readiness check. A model
      // call is never offered without the durable request store.
      const check = await rpc('office_request_list_v1', { p_intent: normalized.intent, p_scope: normalized.scope, p_origin_ref: normalized.originRef, p_limit: 1, p_before: null }, identity);
      if (check.status !== 'ready') return errorResult('office-storage-not-ready', 'preview');
      const ready = deps.engineConfigured?.() !== false && Boolean(recoverySecret());
      return { ...resolved, status: ready ? 'ready' : 'preview', capabilities: { generate: ready && resolved.capabilities.generate, applyTask: ready && resolved.capabilities.applyTask }, ...(!ready ? { error: 'office-engine-not-configured' } : {}) };
    } catch (error) { return failure(error); }
  }
  async function list(input, identity) {
    if (!identityValid(identity)) return errorResult('office-workspace-not-configured', 'preview');
    let normalized, limit, before = null;
    try {
      normalized = query(input); limit = input.limit === undefined ? 10 : Number(input.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error();
      if (input.cursor) {
        if (typeof input.cursor !== 'string' || input.cursor.length > 600) throw new Error();
        before = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
        if (Object.keys(before).some(key => !['id', 'createdAt'].includes(key)) || !isAgentUuid(before.id) || !Number.isFinite(Date.parse(before.createdAt))) throw new Error();
      }
    } catch { return errorResult('invalid-office-query', 'invalid-input'); }
    try {
      const result = await rpc('office_request_list_v1', { p_intent: normalized.intent, p_scope: normalized.scope, p_origin_ref: normalized.originRef, p_limit: limit, p_before: before }, identity);
      if (result.status !== 'ready' || !Array.isArray(result.items)) return errorResult(result.error || 'office-list-unavailable');
      const requests = result.items.slice(0, limit).map(projectOfficeReceipt).map(({ result: _result, ...item }) => item);
      const last = requests.at(-1);
      return { status: 'ready', requests, nextCursor: result.items.length > limit && last ? Buffer.from(JSON.stringify({ id: last.requestId, createdAt: last.createdAt })).toString('base64url') : null };
    } catch (error) { return failure(error); }
  }
  function unsaved(result, request, attemptToken, identity, token, reason = 'office-result-persistence-unknown') {
    const payload = { version: 1, workspaceId: identity.workspaceId, actorId: identity.actorId, requestId: request.requestId, attemptToken, expiresAt: now() + 86400000, result };
    const body = deflateRawSync(Buffer.from(JSON.stringify(payload))).toString('base64url');
    const key = recoverySecret();
    const recoveryToken = token || (key ? `${body}.${createHmac('sha256', key).update(body).digest('base64url')}` : null);
    return { status: 'unsaved', state: 'unknown', requestId: request.requestId, result, persistence: { persisted: reason === 'office-result-persistence-unknown' ? null : false }, application: null, capabilities: { generate: false, applyTask: false }, recoveryToken, error: reason, ...(reason === 'office-result-expired' ? { expired: true } : {}) };
  }
  async function finish(result, row, identity) {
    return rpc('office_request_finish_v1', { p_request_id: row.id, p_attempt_token: row.attempt_token, p_result: result }, identity);
  }
  async function execute(input, identity) {
    let request;
    try { request = parseOfficeWorkflowRequest(input); if (!INTENTS.has(request.intent)) return errorResult('office-workflow-not-enabled', 'preview'); }
    catch (error) { return errorResult(error.message || 'invalid-office-request', 'invalid-input'); }
    if (!identityValid(identity)) return errorResult('office-workspace-not-configured', 'preview');
    let prior;
    try { prior = await internalReceipt(request.requestId, identity, request); }
    catch (error) { return failure(error, true); }
    if (prior.status !== 'not-found') return projectOfficeReceipt(prior);
    if (deps.engineConfigured?.() === false || !recoverySecret()) return errorResult('office-engine-not-configured', 'preview');
    let resolved;
    try {
      resolved = await deps.readContext(query(request), identity);
      if (resolved.status !== 'ready') return resolved;
      if (resolved.contextHash !== request.expectedContextHash) return errorResult('office-context-changed', 'conflict');
      resolved = parseOfficeWorkflowContext(resolved, request);
      if (!resolved.capabilities.generate) return errorResult('office-generation-not-ready', 'preview');
    } catch { return errorResult('office-context-unavailable'); }
    let claimed;
    try { claimed = await rpc('office_request_claim_v1', { p_request: request, p_context: resolved }, identity); }
    catch (error) { return { ...failure(error, true), requestId: request.requestId }; }
    if (claimed.claimed !== true || claimed.persisted !== true || !claimed.request?.attempt_token) return projectOfficeReceipt(claimed);
    let result;
    try {
      result = await deps.generate(request, resolved);
      if (result.status === 'generated') result = parseOfficeWorkflowResult(result, request, resolved);
      else if (result.status !== 'unknown') result = { status: 'error', error: result.error || 'office-generation-failed' };
    } catch { result = { status: 'error', error: 'office-result-validation-failed' }; }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32768) result = { status: 'error', error: 'office-result-too-large' };
    try {
      let saved = await finish(result, claimed.request, identity);
      // A reviewed body is still useful when persistence definitively rejects
      // it (e.g. an older deployed storage contract). Never discard that only
      // copy or replace it with an empty error/expiry receipt.
      if (result.status === 'generated' && saved.status !== 'generated' && (saved.persisted === true || ['conflict', 'invalid-input', 'expired', 'not-found'].includes(saved.status))) {
        return unsaved(result, request, claimed.request.attempt_token, identity, null, saved.status === 'expired' ? 'office-result-expired' : 'office-result-storage-rejected');
      }
      if (saved.persisted === true) {
        if (result.status === 'generated' && saved.status === 'generated') {
          let run = null;
          try { run = await deps.recordRun?.({ workspaceId: identity.workspaceId, agent: `office.${request.ownerId}`, mode: request.mode, ref: `office-request:${request.requestId}`, inputSummary: `intent=${request.intent} scope=${request.scope}`, recommendation: { requestId: request.requestId, artifactKind: result.artifact.kind, status: 'generated' }, result: 'ok' }); } catch { /* receipt remains authoritative */ }
          const logState = run?.persisted === true && isAgentUuid(run.id) ? 'saved' : run?.persisted === false ? 'error' : 'unknown';
          try {
            const logged = await rpc('office_request_log_v1', { p_request_id: request.requestId, p_run_id: logState === 'saved' ? run.id : null, p_log_state: logState }, identity);
            if (logged.persisted === true) saved = logged;
          } catch { saved = { ...saved, request: { ...saved.request, log_state: 'unknown' } }; }
        }
        return projectOfficeReceipt(saved);
      }
      if (['conflict', 'invalid-input', 'expired'].includes(saved.status)) return projectOfficeReceipt(saved);
    } catch { /* Re-read before offering recovery; finish may already have committed. */ }
    try {
      const saved = await internalReceipt(request.requestId, identity, request);
      if (saved.status === 'generated') return projectOfficeReceipt(saved);
      if (['error', 'expired'].includes(saved.status)) return result.status === 'generated'
        ? unsaved(result, request, claimed.request.attempt_token, identity, null, saved.status === 'expired' ? 'office-result-expired' : 'office-result-storage-rejected')
        : projectOfficeReceipt(saved);
    } catch {}
    return result.status === 'generated' ? unsaved(result, request, claimed.request.attempt_token, identity) : { ...errorResult('office-result-persistence-unknown', 'unknown', null), requestId: request.requestId };
  }
  async function recover(id, input, identity) {
    let payload;
    try {
      if (!isAgentUuid(id) || !identityValid(identity) || typeof input?.recoveryToken !== 'string' || input.recoveryToken.length > 70000 || Object.keys(input).some(key => key !== 'recoveryToken')) throw new Error();
      const [body, signature, extra] = input.recoveryToken.split('.');
      const key = recoverySecret(); if (!body || !signature || extra || !key) throw new Error();
      const expected = createHmac('sha256', key).update(body).digest(), supplied = Buffer.from(signature, 'base64url');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error();
      payload = JSON.parse(inflateRawSync(Buffer.from(body, 'base64url'), { maxOutputLength: 100000 }).toString('utf8'));
      if (payload.version !== 1 || payload.requestId !== id || payload.workspaceId !== identity.workspaceId || payload.actorId !== identity.actorId || payload.expiresAt <= now() || payload.result?.status !== 'generated') throw new Error();
    } catch { return errorResult('invalid-office-recovery-token', 'invalid-input'); }
    let existing;
    try { existing = await internalReceipt(id, identity); } catch (error) { return failure(error, true); }
    if (!existing.request) return unsaved(payload.result, { requestId: id }, payload.attemptToken, identity, input.recoveryToken, 'office-result-storage-rejected');
    if (existing.request.attempt_token !== payload.attemptToken) return errorResult('office-attempt-mismatch', 'conflict');
    if (existing.status === 'expired') return unsaved(payload.result, { requestId: id }, payload.attemptToken, identity, input.recoveryToken, 'office-result-expired');
    // A valid signed body is still checked against the stored request/context.
    let verified;
    try { verified = parseOfficeWorkflowResult(payload.result, existing.request.input_snapshot, existing.request.context_snapshot); }
    catch { return errorResult('invalid-office-recovery-result', 'invalid-input'); }
    try {
      const saved = await finish(verified, existing.request, identity);
      if (saved.status === 'generated' && saved.persisted === true) return projectOfficeReceipt(saved);
      if (saved.persisted === true || ['conflict', 'invalid-input', 'expired', 'not-found'].includes(saved.status)) return unsaved(verified, { requestId: id }, payload.attemptToken, identity, input.recoveryToken, saved.status === 'expired' ? 'office-result-expired' : 'office-result-storage-rejected');
    } catch {}
    return unsaved(verified, { requestId: id }, payload.attemptToken, identity, input.recoveryToken);
  }
  async function apply(id, input, identity) {
    if (!isAgentUuid(id) || !identityValid(identity)) return errorResult('invalid-office-request', 'invalid-input');
    let existing;
    try { existing = await internalReceipt(id, identity); } catch (error) { return failure(error, true); }
    if (!existing.request) return projectOfficeReceipt(existing);
    const row = existing.request;
    let sourceRefs = null, contextChange = null;
    if (!row.application) {
      if (existing.status === 'expired') return projectOfficeReceipt(existing);
      if (row.state !== 'generated' || input?.resultRevision !== row.result_revision || row.context_snapshot?.capabilities?.applyTask !== true) return errorResult('office-result-not-applicable', 'conflict');
      if (!input?.fields || Object.keys(input).some(key => !['resultRevision', 'fields', 'acknowledgeContextChange'].includes(key))
        || (input.acknowledgeContextChange !== undefined && typeof input.acknowledgeContextChange !== 'boolean')) return errorResult('invalid-office-application', 'invalid-input');
      try {
        const current = await deps.readContext(query(row.input_snapshot), identity);
        if (current.status !== 'ready') return errorResult('office-context-unavailable', 'conflict');
        // 2026-09-23 운영자 확정: 기록이 바뀌었으면 막지 않고 알린다. 운영자가 확인하면 그대로 연결한다.
        if (current.contextHash !== row.context_hash) {
          contextChange = officeContextChange(row.source_refs ?? row.context_snapshot?.sourceRefs, current.sourceRefs);
          if (input.acknowledgeContextChange !== true) return { ...errorResult('office-context-changed', 'conflict'), requestId: id, contextChange };
        }
        const target = await deps.readTargets(input.fields, row.scope, identity);
        if (target.status !== 'ready') return target;
        sourceRefs = target.sourceRefs;
      } catch { return errorResult('office-target-read-unavailable'); }
    }
    let outcome;
    try { outcome = await deps.apply({ requestId: id, ...(row.application ? {} : { resultRevision: input.resultRevision, fields: input.fields, sourceRefs }) }, identity); }
    catch { outcome = { status: 'unknown', error: 'office-application-outcome-unknown', persisted: null }; }
    if (outcome.status === 'saved') {
      let entityConfirmed = false;
      try { entityConfirmed = await deps.confirmTask?.(outcome.entity.id, identity) === true; } catch {}
      // 이미 저장 확인된 적용의 재확인은 새 연결이 아니다 — 요약의 '할 일 연결' 수를 부풀리지 않는다.
      if (row.application?.state !== 'saved') try {
        await deps.recordRun?.({ workspaceId: identity.workspaceId, agent: 'office.apply', mode: 'apply', ref: `office-request:${id}`, inputSummary: `intent=${row.intent} scope=${row.scope}`,
          recommendation: { requestId: id, contextChanged: Boolean(contextChange), ...(contextChange ? { change: contextChange } : {}) }, result: 'ok' });
      } catch { /* 적용 영수증이 정본이다. 실행 기록 실패는 저장 결과를 바꾸지 않는다. */ }
      return { status: 'saved', requestId: id, persistence: { persisted: true }, application: { state: 'saved', action: 'create_task', commandId: outcome.commandId, entityId: outcome.entity.id, targetRef: { type: 'tasks', id: outcome.entity.id }, entityConfirmed }, capabilities: { generate: false, applyTask: false } };
    }
    return { ...errorResult(outcome.error || 'office-application-unavailable', outcome.status, outcome.persisted ?? null), requestId: id, application: publicApplication(row.application) };
  }
  return { context, list, receipt, execute, recover, apply };
}

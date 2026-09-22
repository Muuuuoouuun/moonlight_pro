import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { isAgentUuid, agentHash } from '@com-moon/agent-contracts';

export const ASSISTANCE_ENTITIES = Object.freeze(['tasks', 'projects', 'content_items']);
export const ASSISTANCE_OPERATIONS = Object.freeze(['draft', 'rewrite', 'critique', 'analyze']);
const SOURCE_FIELDS = {
  tasks: 'id,workspace_id,title,description,next_action,status,updated_at',
  projects: 'id,workspace_id,name,summary,next_action,status,updated_at',
  content_items: 'id,workspace_id,title,source_idea,summary,status,updated_at',
};
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('invalid-fields'); }
function bounded(value, max, required = false) { if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > max || (required && !value.trim())) throw new Error('invalid-text'); return value.trim(); }
function contextInput(input) {
  if (!ASSISTANCE_ENTITIES.includes(input.entityType) || !isAgentUuid(input.entityId) || !['personal', 'company'].includes(input.scope)) throw new Error('invalid-source');
  return { entityType: input.entityType, entityId: input.entityId.toLowerCase(), scope: input.scope };
}
export function normalizeAssistanceCommand(value) {
  keys(value, ['commandId', 'action', 'input']);
  if (!isAgentUuid(value.commandId) || !['save_candidate', 'generate', 'review_candidate', 'recover_candidate'].includes(value.action)) throw new Error('invalid-command');
  const input = value.input;
  if (value.action === 'recover_candidate') {
    keys(input, ['recoveryToken']);
    return { commandId: value.commandId.toLowerCase(), action: value.action, input: { recoveryToken: bounded(input.recoveryToken, 60000, true) } };
  }
  if (value.action === 'review_candidate') {
    keys(input, ['candidateId', 'expectedRevision', 'outcome', 'baselineMinutes', 'reviewMinutes', 'actualMinutes', 'note']);
    if (!isAgentUuid(input.candidateId) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1 || !['accepted', 'edited', 'rejected'].includes(input.outcome)) throw new Error('invalid-review');
    const minutes = {};
    for (const key of ['baselineMinutes', 'reviewMinutes', 'actualMinutes']) {
      const n = input[key] ?? null;
      if (n !== null && (!Number.isFinite(n) || n < 0 || n > 10080)) throw new Error('invalid-minutes');
      minutes[key] = n;
    }
    return { commandId: value.commandId.toLowerCase(), action: value.action, input: { candidateId: input.candidateId.toLowerCase(), expectedRevision: input.expectedRevision, outcome: input.outcome, ...minutes, note: bounded(input.note ?? '', 2000) } };
  }
  keys(input, ['entityType', 'entityId', 'scope', 'expectedSourceUpdatedAt', 'operation', 'instruction', ...(value.action === 'save_candidate' ? ['output', 'client', 'model'] : [])]);
  const source = contextInput(input);
  if (!ASSISTANCE_OPERATIONS.includes(input.operation) || typeof input.expectedSourceUpdatedAt !== 'string' || input.expectedSourceUpdatedAt.length > 60 || !Number.isFinite(Date.parse(input.expectedSourceUpdatedAt))) throw new Error('invalid-source-version');
  const normalized = { ...source, expectedSourceUpdatedAt: input.expectedSourceUpdatedAt, operation: input.operation, instruction: bounded(input.instruction ?? '', 4000) };
  if (value.action === 'save_candidate') Object.assign(normalized, { output: bounded(input.output, 24000, true), client: bounded(input.client, 80, true), model: input.model == null ? null : bounded(input.model, 100, true) });
  return { commandId: value.commandId.toLowerCase(), action: value.action, input: normalized };
}
export function assistanceTimeSaved(review) {
  return ['baselineMinutes', 'reviewMinutes', 'actualMinutes'].every(key => Number.isFinite(review?.[key]))
    ? review.baselineMinutes - review.reviewMinutes - review.actualMinutes : null;
}
const failure = (error, status = 'error', persisted = false) => ({ status, source: 'error', error, persisted });
function textPage(value, budget) {
  const text = typeof value === 'string' ? value : '';
  if (Buffer.byteLength(JSON.stringify(text)) <= budget) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (Buffer.byteLength(JSON.stringify(text.slice(0, mid))) <= budget) lo = mid; else hi = mid - 1; }
  if (lo && /[\uD800-\uDBFF]/.test(text[lo - 1])) lo--;
  return text.slice(0, lo);
}
function projectCandidate(row, budget = 16000) {
  const fields = ['id','entity_type','entity_id','scope','source_updated_at','operation','status','provider','client','model','usage_reason','review','revision','created_at','updated_at'];
  const candidate = Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
  const output = textPage(row.output, budget);
  return { ...candidate, output: row.output == null ? null : output, outputTruncated: typeof row.output === 'string' && output.length < row.output.length,
    usage: row.usage ?? null, outputHash: agentHash(row.output || ''), nextOffset: output.length < (row.output?.length || 0) ? output.length : null,
    status: row.status === 'running' && Date.parse(row.created_at) < Date.now() - 120000 ? 'unknown' : row.status };
}
const projectResponse = result => result?.candidate ? { ...result, candidate: projectCandidate(result.candidate) } : result;

export function createAssistanceService(deps) {
  const secret = () => typeof deps.recoverySecret === 'function' ? deps.recoverySecret() : deps.recoverySecret;
  function unsavedResult(result, commandId, context) {
    const data = { status: 'unsaved', persisted: null, commandId, output: textPage(result.output, 16000), outputTruncated: textPage(result.output, 16000).length < (result.output?.length || 0), error: 'generation-persistence-unknown', nextAction: 'recover_ai_candidate' };
    const key = secret();
    if (key && result.status === 'generated' && typeof result.output === 'string' && Buffer.byteLength(result.output) <= 24000) {
      const verified = { status: 'generated', output: result.output, model: result.model || null, provider: 'gemini', usage: result.usage && Buffer.byteLength(JSON.stringify(result.usage)) <= 4096 ? result.usage : null };
      const payload = deflateRawSync(Buffer.from(JSON.stringify({ version: 2, workspaceId: context.workspaceId, actorId: context.actorId || 'operator', commandId, expiresAt: Date.now() + 86400000, result: verified }))).toString('base64url');
      data.recoveryToken = `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
    }
    return data;
  }
  async function recover(command, context) {
    let payload;
    try {
      const [body, signature, extra] = command.input.recoveryToken.split('.');
      if (!secret() || !body || !signature || extra) throw new Error();
      const expected = createHmac('sha256', secret()).update(body).digest();
      const actual = Buffer.from(signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
      payload = JSON.parse(inflateRawSync(Buffer.from(body, 'base64url'), { maxOutputLength: 200000 }).toString('utf8'));
      if (payload.version !== 2 || payload.workspaceId !== context.workspaceId || payload.actorId !== (context.actorId || 'operator') || payload.commandId !== command.commandId || payload.expiresAt <= Date.now() || payload.result?.status !== 'generated') throw new Error();
    } catch { return failure('invalid-recovery-token', 'invalid-input'); }
    try {
      const result = await deps.rpc('operating_ai_finish_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId || 'operator', p_candidate_id: command.commandId, p_result: payload.result });
      if (result.persisted === true) return projectResponse(result);
    } catch {}
    return { ...unsavedResult(payload.result, command.commandId, context), recoveryToken: command.input.recoveryToken };
  }
  async function source(input, context) {
    let query;
    try { query = contextInput(input); } catch (error) { return failure(error.message, 'invalid-input'); }
    if (!isAgentUuid(context?.workspaceId)) return { status: 'preview', source: 'preview', error: 'missing-workspace', persisted: false };
    const result = await deps.read(query.entityType, { select: SOURCE_FIELDS[query.entityType], filters: [['workspace_id', `eq.${context.workspaceId}`], ['id', `eq.${query.entityId}`]], limit: 1, strictRows: true });
    if (result.error) return failure('source-read-failed');
    const row = result.rows?.[0];
    if (!row || row.id !== query.entityId || row.workspace_id !== context.workspaceId) return failure('source-not-found');
    const resolved = await deps.resolveScope({ ...query, workspaceId: context.workspaceId });
    if (!resolved.scope) return failure(resolved.reason || 'scope-unmeasured');
    if (resolved.scope !== query.scope) return failure('scope-mismatch');
    if (!row.updated_at) return failure('source-version-unavailable');
    const data = Object.fromEntries(Object.entries(row).filter(([key]) => !['workspace_id'].includes(key)));
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 20000) return failure('source-too-large');
    let goals = null;
    if (deps.goals) {
      try {
        const ledger = await deps.goals(query, context);
        const objectives = (ledger.objectives || []).slice(0, 3).map(item => ({ id: item.id, title: item.title, scope: item.scope, periodStart: item.periodStart, periodEnd: item.periodEnd, revision: item.revision }));
        const ids = new Set(objectives.map(item => item.id));
        const metrics = (ledger.metrics || []).filter(item => ids.has(item.objectiveId)).slice(0, 8).map(item => ({ id: item.id, objectiveId: item.objectiveId, name: item.name, revision: item.revision, unit: item.unit, role: item.role, sourceKey: item.sourceKey, baseline: item.baseline, target: item.target, targetMin: item.targetMin, targetMax: item.targetMax, measurement: item.measurement, progress: item.progress }));
        goals = { status: ledger.status, asOf: ledger.asOf, objectives, metrics, bounded: (ledger.objectives?.length || 0) > 3 || (ledger.metrics?.length || 0) > 8 };
        if (Buffer.byteLength(JSON.stringify(goals)) > 6000) goals = { status: 'partial', missing: ['goal-context-too-large'] };
      } catch { goals = { status: 'error', missing: ['goals-unavailable'] }; }
    }
    const partial = goals && goals.status !== 'live';
    return { status: partial ? 'partial' : 'live', source: 'supabase', ...query, sourceUpdatedAt: row.updated_at, sourceRefs: [{ entityType: query.entityType, entityId: query.entityId, updatedAt: row.updated_at }], snapshot: data, goals, missing: partial ? ['goals-incomplete'] : [], asOf: new Date().toISOString() };
  }
  async function receipt(commandId, context, request = null) {
    if (!isAgentUuid(commandId) || !isAgentUuid(context?.workspaceId)) return failure('invalid-receipt', 'invalid-input');
    try { return projectResponse(await deps.rpc('operating_ai_receipt_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId || 'operator', p_command_id: commandId, p_request: request })); }
    catch { return failure('receipt-unavailable', 'unknown', null); }
  }
  async function readContext(input, context) {
    try {
      const resolved = await source(input, context);
      if (!['live', 'partial'].includes(resolved.status)) return resolved;
      const results = await deps.read('operating_ai_candidates', { select: 'id,entity_type,entity_id,scope,source_updated_at,operation,status,output,provider,client,model,usage,usage_reason,review,revision,created_at,updated_at', filters: [['workspace_id', `eq.${context.workspaceId}`], ['entity_type', `eq.${input.entityType}`], ['entity_id', `eq.${input.entityId}`], ['scope', `eq.${input.scope}`]], order: 'created_at.desc', limit: 3, strictRows: true });
      if (results.error) return { ...resolved, status: 'partial', candidates: [], failedSources: ['operating_ai_candidates'] };
      const candidates = (results.rows || []).map(row => ({ ...projectCandidate(row), stale: row.source_updated_at !== resolved.sourceUpdatedAt, timeSavedMinutes: assistanceTimeSaved(row.review) }));
      const response = { ...resolved, candidates, candidatesTruncated: results.rows?.length >= 3, totalCandidateCount: null };
      while (Buffer.byteLength(JSON.stringify(response)) > 96000 && candidates.length > 1) { candidates.pop(); response.candidatesTruncated = true; }
      return response;
    } catch { return failure('assistance-context-unavailable'); }
  }
  async function execute(payload, context) {
    let command;
    try { command = normalizeAssistanceCommand(payload); } catch (error) { return failure(error.message, 'invalid-input'); }
    if (!isAgentUuid(context?.workspaceId)) return { status: 'preview', source: 'preview', error: 'missing-workspace', persisted: false };
    if (command.action === 'recover_candidate') return recover(command, context);
    const prior = await receipt(command.commandId, context, command);
    if (prior.persisted === true || prior.status === 'conflict') return prior;
    // A receipt read failure may hide an in-flight claim. Do not invoke a provider.
    if (prior.error && prior.error !== 'receipt-not-found') return prior;
    let resolved = null;
    if (command.action !== 'review_candidate') {
      try { resolved = await source(command.input, context); } catch { return failure('source-read-failed'); }
      if (!['live', 'partial'].includes(resolved.status)) return resolved;
      if (resolved.sourceUpdatedAt !== command.input.expectedSourceUpdatedAt) return failure('source-conflict', 'conflict');
    }
    let claimed;
    try { claimed = await deps.rpc('operating_ai_command_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId || 'operator', p_command: command, p_source: resolved }); }
    catch { return { ...failure('command-outcome-unknown', 'unknown', null), commandId: command.commandId }; }
    if (command.action !== 'generate' || claimed.persisted !== true || claimed.claimed !== true) return projectResponse(claimed);
    let generated;
    try { generated = await deps.generate({ operation: command.input.operation, instruction: command.input.instruction, scope: command.input.scope, source: resolved }); }
    catch { generated = { status: 'unknown', error: 'provider-outcome-unknown', usage: null }; }
    try {
      const finished = await deps.rpc('operating_ai_finish_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId || 'operator', p_candidate_id: command.commandId, p_result: generated });
      if (finished.persisted === true) return projectResponse(finished);
    } catch {}
    return generated.status === 'generated' && generated.output ? unsavedResult(generated, command.commandId, context) : { status: 'unknown', persisted: null, commandId: command.commandId, error: 'generation-persistence-unknown', nextAction: 'get_assistance_receipt', requestHash: agentHash(command) };
  }
  async function candidate(input, context) {
    const offset = Number(input.offset ?? 0);
    if (!isAgentUuid(input.candidateId) || !isAgentUuid(context?.workspaceId) || !Number.isInteger(offset) || offset < 0 || offset > 24000) return failure('invalid-candidate-page', 'invalid-input');
    try {
      const result = await deps.read('operating_ai_candidates', { select: 'id,workspace_id,entity_type,entity_id,scope,source_updated_at,operation,status,output,provider,client,model,usage,usage_reason,review,revision,created_at,updated_at', filters: [['workspace_id', `eq.${context.workspaceId}`], ['id', `eq.${input.candidateId}`]], limit: 1, strictRows: true });
      const row = result.rows?.[0];
      if (result.error || !row || row.id !== input.candidateId || row.workspace_id !== context.workspaceId) return failure('candidate-read-failed');
      const outputHash = agentHash(row.output || '');
      if (offset && input.outputHash !== outputHash) return failure('candidate-output-changed', 'conflict');
      const output = textPage((row.output || '').slice(offset), 16000);
      const nextOffset = offset + output.length < (row.output?.length || 0) ? offset + output.length : null;
      return { status: 'live', source: 'supabase', candidate: { ...projectCandidate(row, 16000), output, outputTruncated: nextOffset !== null, nextOffset }, offset, nextOffset, outputHash };
    } catch { return failure('candidate-read-failed'); }
  }
  return { context: readContext, execute, receipt, candidate };
}

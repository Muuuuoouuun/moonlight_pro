import { extractMeetingReviewText } from '@/lib/meeting-review-extractor';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { isCanonicalUuid } from './uuid.js';
import { validateTaskChecklist } from './task-checklist.js';

const KINDS = new Set(['decision', 'open_issue', 'value', 'concern', 'signal', 'action']);
const CERTAINTIES = new Set(['stated', 'derived', 'unknown']);
const ACTION_SCOPES = new Set(['mine', 'related', 'unknown']);
const DATE_ROLES = new Set(['deadline', 'scheduled', 'reference']);
const defaultDependencies = {
  rpc: invokeSupabaseRpc,
  extract: extractMeetingReviewText,
  workspaceId: resolveDefaultWorkspaceId,
  configured: () => Boolean(resolveSupabaseConfig()),
  providerConfigured: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
};

function context(deps) {
  const configured = deps.configured();
  const workspaceId = deps.workspaceId();
  return { configured, workspaceId: isCanonicalUuid(workspaceId) ? workspaceId.toLowerCase() : null };
}
function readFailure(base, error = 'read-failed') {
  return { ...base, status: 'error', entryId: null, revision: null, run: null, proposals: [], usage: { status: 'unknown' }, error };
}
function writeFailure(base, error = 'outcome-unknown', httpStatus = 502, status = 'unknown', requestId = null) {
  return { ...base, status, httpStatus, requestId, error, retryable: false };
}
function projection(base, snapshot, status = 'live') {
  if (snapshot?.status !== 'live' || !isCanonicalUuid(snapshot.entryId)
    || !Number.isSafeInteger(snapshot.revision) || !Array.isArray(snapshot.proposals)) return null;
  return { ...base, ...snapshot, status };
}
async function call(deps, name, params) {
  const result = await deps.rpc(name, params);
  if (!result?.ok || !result.data || typeof result.data !== 'object') throw new Error('meeting-review-storage-unavailable');
  return result.data;
}
function isDate(value) {
  if (value == null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function sourceEvidence(value, sourceBody, parent) {
  return value && typeof value.quote === 'string' && value.quote.trim()
    && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end)
    && value.start >= parent.start && value.end <= parent.end && value.end > value.start
    && sourceBody.slice(value.start, value.end) === value.quote;
}
function normalizeActionSuggestion(candidate, sourceBody) {
  const parent = { start: candidate.start, end: candidate.end };
  const actionScope = candidate.actionScope ?? 'unknown';
  const relation = candidate.relation ?? null;
  const dateMentions = candidate.dateMentions ?? [];
  const methodQuote = candidate.methodQuote ?? null;
  const checklist = candidate.checklist ?? [];
  if (!ACTION_SCOPES.has(actionScope)
    || (relation !== null && !sourceEvidence(relation, sourceBody, parent))
    || ((actionScope === 'mine' || actionScope === 'related') && relation === null)
    || !Array.isArray(dateMentions) || dateMentions.length > 10
    || dateMentions.some((item) => !sourceEvidence(item, sourceBody, parent)
      || !DATE_ROLES.has(item.role) || !isDate(item.date))
    || (methodQuote !== null && (typeof methodQuote !== 'string' || !methodQuote.trim()
      || !candidate.quote.includes(methodQuote) || methodQuote.length > 1000))
    || !Array.isArray(checklist) || checklist.length > 50
    || checklist.some((item) => !sourceEvidence(item, sourceBody, parent) || item.quote.length > 200)) return null;
  return { actionScope, relation, dateMentions, methodQuote, checklist };
}

function normalizeReviewExecution(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !ACTION_SCOPES.has(value.actionScope) || !isDate(value.dueAt)
    || (value.method != null && (typeof value.method !== 'string' || value.method.length > 1000))
    || !Array.isArray(value.checklist) || validateTaskChecklist(value.checklist)
    || value.checklist.some((item) => item.done !== false)) return false;
  return { actionScope: value.actionScope, dueAt: value.dueAt ?? null,
    method: value.method?.trim() || null,
    checklist: value.checklist.map((item) => ({ id: item.id.toLowerCase(), title: item.title.trim(), done: false,
      note: item.note || '', ...(item.dueAt ? { dueAt: item.dueAt } : {}) })) };
}

// The model's JSON is never sent to the definer RPC without rechecking the
// exact source span. JS offsets are UTF-16, matching the browser selection API.
export function normalizeMeetingAnalysis(result, sourceBody) {
  const data = result?.data;
  if (!result?.ok || typeof sourceBody !== 'string' || typeof data?.summary !== 'string'
    || !data.summary.trim() || data.summary.length > 4000 || !Array.isArray(data.proposals) || data.proposals.length > 30
    || typeof result.model !== 'string' || !result.model.trim() || result.model.length > 120) return null;
  const proposals = [];
  for (const candidate of data.proposals) {
    if (!KINDS.has(candidate?.kind) || typeof candidate.text !== 'string' || !candidate.text.trim() || candidate.text.length > 4000
      || typeof candidate.quote !== 'string' || !candidate.quote.trim()
      || !Number.isSafeInteger(candidate.start) || !Number.isSafeInteger(candidate.end)
      || candidate.start < 0 || candidate.end <= candidate.start || candidate.end > sourceBody.length
      || sourceBody.slice(candidate.start, candidate.end) !== candidate.quote
      || !CERTAINTIES.has(candidate.certainty) || !isDate(candidate.suggestedDue)) return null;
    const action = candidate.kind === 'action' ? normalizeActionSuggestion(candidate, sourceBody) : null;
    if (candidate.kind === 'action' && !action) return null;
    proposals.push({ kind: candidate.kind, text: candidate.text, quote: candidate.quote,
      start: candidate.start, end: candidate.end, certainty: candidate.certainty,
      ...(candidate.suggestedDue ? { suggestedDue: candidate.suggestedDue } : {}),
      ...(action || {}) });
  }
  const rawUsage = result.usage;
  const usage = rawUsage && ['promptTokens', 'candidatesTokens', 'totalTokens'].some((key) =>
    Number.isSafeInteger(rawUsage[key]) && rawUsage[key] >= 0)
    ? Object.fromEntries(['promptTokens', 'candidatesTokens', 'totalTokens'].map((key) =>
      [key, Number.isSafeInteger(rawUsage[key]) && rawUsage[key] >= 0 ? rawUsage[key] : null]))
    : null;
  return { state: 'ready', summary: data.summary, proposals, model: result.model, ...(usage ? { usage } : {}) };
}

export function createMeetingReviewService(overrides = {}) {
  const deps = { ...defaultDependencies, ...overrides };
  const base = () => context(deps);

  async function get(entryId) {
    const ctx = base();
    if (!isCanonicalUuid(entryId)) return readFailure(ctx, 'invalid-entry');
    if (!ctx.configured || !ctx.workspaceId) return { ...ctx, status: 'preview', entryId, revision: null, run: null, proposals: [], usage: { status: 'unknown' } };
    try {
      const data = await call(deps, 'meeting_review_snapshot_v2', { p_workspace_id: ctx.workspaceId, p_journal_id: entryId.toLowerCase(), p_request_id: null });
      if (data.status === 'not-found') return readFailure(ctx, 'note-unavailable');
      return projection(ctx, data) ?? readFailure(ctx);
    } catch { return readFailure(ctx); }
  }

  async function analyze(input) {
    const ctx = base();
    const { entryId, requestId, expectedRevision } = input || {};
    if (!isCanonicalUuid(entryId) || !isCanonicalUuid(requestId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      return writeFailure(ctx, 'invalid-request', 400, 'invalid-input');
    if (!ctx.configured || !ctx.workspaceId) return writeFailure(ctx, 'missing-persistence', 503, 'preview', requestId);
    if (!deps.providerConfigured()) return writeFailure(ctx, 'gemini-not-configured', 503, 'preview', requestId);
    let claim;
    try {
      claim = await call(deps, 'meeting_review_claim_v2', { p_workspace_id: ctx.workspaceId, p_journal_id: entryId.toLowerCase(),
        p_revision: expectedRevision, p_request_id: requestId.toLowerCase() });
    } catch { return writeFailure(ctx, 'claim-outcome-unknown', 502, 'unknown', requestId); }
    if (claim.status === 'conflict') return writeFailure(ctx, claim.error || 'revision-conflict', 409, 'conflict', requestId);
    if (claim.status === 'not-found') return writeFailure(ctx, 'note-unavailable', 404, 'invalid-input', requestId);
    if (claim.status === 'invalid-input') return writeFailure(ctx, claim.error || 'invalid-request', 400, 'invalid-input', requestId);
    if (claim.status === 'existing') {
      const existing = projection(ctx, claim.snapshot, 'duplicate');
      if (!existing) return writeFailure(ctx, 'receipt-unavailable', 502, 'unknown', requestId);
      if (existing.run?.state === 'ready') return { ...existing, httpStatus: 200 };
      if (existing.run?.state === 'error') return { ...existing, status: 'error', httpStatus: 502, error: existing.run.error || 'analysis-failed', retryable: false };
      return { ...existing, status: 'unknown', httpStatus: 202, error: 'analysis-outcome-pending', retryable: false };
    }
    if (claim.status !== 'claimed' || typeof claim.sourceBody !== 'string')
      return writeFailure(ctx, 'claim-unavailable', 502, 'unknown', requestId);
    let extraction;
    try { extraction = await deps.extract({ text: claim.sourceBody }); }
    catch { extraction = { ok: false, reason: 'provider-error' }; }
    const analysis = normalizeMeetingAnalysis(extraction, claim.sourceBody);
    const result = analysis ?? { state: 'error', error: extraction?.reason === 'gemini-not-configured' ? 'provider-unavailable' : 'analysis-failed' };
    let finished;
    try {
      finished = await call(deps, 'meeting_review_finish_v2', { p_workspace_id: ctx.workspaceId, p_journal_id: entryId.toLowerCase(),
        p_request_id: requestId.toLowerCase(), p_result: result });
    } catch { return writeFailure(ctx, 'finish-outcome-unknown', 502, 'unknown', requestId); }
    if (finished.status === 'invalid-input') return writeFailure(ctx, finished.error || 'invalid-analysis', 502, 'error', requestId);
    if (!['saved', 'existing'].includes(finished.status)) return writeFailure(ctx, 'finish-outcome-unknown', 502, 'unknown', requestId);
    const saved = projection(ctx, finished.snapshot, finished.status === 'existing' ? 'duplicate' : 'saved');
    if (!saved) return writeFailure(ctx, 'receipt-unavailable', 502, 'unknown', requestId);
    if (saved.run?.state === 'error') return { ...saved, status: 'error', httpStatus: 502, error: saved.run.error || 'analysis-failed', retryable: false };
    if (saved.run?.state !== 'ready') return { ...saved, status: 'unknown', httpStatus: 202, error: 'analysis-outcome-pending', retryable: false };
    return { ...saved, httpStatus: 200 };
  }

  async function review(input) {
    const ctx = base();
    const { entryId, proposalId, decision, editedText, execution } = input || {};
    const normalizedExecution = normalizeReviewExecution(execution);
    if (!isCanonicalUuid(entryId) || !isCanonicalUuid(proposalId) || !['pending', 'accepted', 'rejected'].includes(decision)
      || (editedText !== undefined && editedText !== null && (typeof editedText !== 'string' || !editedText.trim() || editedText.length > 4000))
      || normalizedExecution === false || (decision !== 'accepted' && normalizedExecution !== null))
      return writeFailure(ctx, 'invalid-review', 400, 'invalid-input');
    if (!ctx.configured || !ctx.workspaceId) return writeFailure(ctx, 'missing-persistence', 503, 'preview');
    let result;
    try {
      result = await call(deps, 'meeting_review_decide_v2', { p_workspace_id: ctx.workspaceId, p_journal_id: entryId.toLowerCase(),
        p_proposal_id: proposalId.toLowerCase(), p_decision: decision, p_edited_text: editedText ?? null,
        p_execution: normalizedExecution });
    } catch { return writeFailure(ctx, 'review-outcome-unknown', 502, 'unknown'); }
    if (result.status === 'conflict') return writeFailure(ctx, result.error || 'review-conflict', 409, 'conflict');
    if (result.status === 'not-found') return writeFailure(ctx, 'proposal-unavailable', 404, 'invalid-input');
    if (result.status === 'invalid-input') return writeFailure(ctx, 'invalid-review', 400, 'invalid-input');
    if (!['saved', 'duplicate'].includes(result.status)) return writeFailure(ctx, 'review-outcome-unknown', 502, 'unknown');
    const saved = projection(ctx, result.snapshot, result.status);
    return saved ? { ...saved, httpStatus: 200 } : writeFailure(ctx, 'review-outcome-unknown', 502, 'unknown');
  }
  return { get, analyze, review };
}

export const meetingReviewService = createMeetingReviewService();

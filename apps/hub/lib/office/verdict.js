// 오피스 결과 판정(그대로·고쳐·버림) — agent_runs 행의 recommendation.verdict에 병합 저장한다(마이그레이션 없음).
// agent_runs는 Hub가 쓰므로(sales-os/agent-runs.js) 판정도 Hub가 직접 읽고-병합-갱신한다.
import { assertHubWriteAllowed, readHubWriteJson } from '../hub-write-guard.js';
import { eqFilter, fetchSupabaseRowsDetailed, withWorkspaceFilter } from '../server-read.js';
import { resolveDefaultWorkspaceId, updateSupabaseRecord } from '../server-write.js';

export const OFFICE_VERDICT_VALUES = ['kept', 'edited', 'dropped'];
export const OFFICE_VERDICT_REASONS = ['context', 'wrong', 'useless'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 순수 검증. 반환: { ok:true, runId, verdict } | { ok:false, error }
export function parseOfficeVerdict(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid-verdict' };
  const { runId, value, reason, at } = input;
  if (typeof runId !== 'string' || !UUID.test(runId)) return { ok: false, error: 'invalid-run-id' };
  if (!OFFICE_VERDICT_VALUES.includes(value)) return { ok: false, error: 'invalid-verdict-value' };
  if (value === 'dropped' && !OFFICE_VERDICT_REASONS.includes(reason)) return { ok: false, error: 'invalid-verdict-reason' };
  const time = typeof at === 'string' && Number.isFinite(Date.parse(at)) ? Date.parse(at) : now;
  return { ok: true, runId: runId.toLowerCase(), verdict: { value, reason: value === 'dropped' ? reason : null, at: new Date(time).toISOString() } };
}

// 다른 키는 지우지 않는다. 배열·비객체 recommendation은 건드리지 않고 빈 객체에서 시작한다.
export function mergeVerdict(recommendation, verdict) {
  const base = recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation) ? recommendation : {};
  return { ...base, verdict };
}

export async function recordOfficeVerdict(input, { workspaceId = resolveDefaultWorkspaceId(), fetchRows = fetchSupabaseRowsDetailed, update = updateSupabaseRecord } = {}) {
  const parsed = parseOfficeVerdict(input);
  if (!parsed.ok) return { status: 'error', error: parsed.error, http: 400 };
  if (!workspaceId) return { status: 'preview', error: 'office-verdict-needs-workspace', http: 202 };
  const answer = await fetchRows('agent_runs', {
    select: 'id,recommendation',
    filters: withWorkspaceFilter([['id', eqFilter(parsed.runId)], ['agent', 'like.office.*']]),
    limit: 1,
    dedupe: false,
  });
  if (answer?.configured === false) return { status: 'preview', error: 'office-verdict-needs-connection', http: 202 };
  if (answer?.error || !Array.isArray(answer?.rows)) return { status: 'failed', error: 'office-verdict-read-failed', http: 502 };
  if (!answer.rows.length) return { status: 'error', error: 'run-not-found', http: 404 };
  // ponytail: 읽기-병합-쓰기는 원자적이지 않다. 같은 행에 verdict 외 동시 쓰기가 없어 충분하고, 생기면 RPC로 옮긴다.
  const saved = await update('agent_runs',
    [['id', eqFilter(parsed.runId)], ['workspace_id', eqFilter(workspaceId)], ['agent', 'like.office.*']],
    { recommendation: mergeVerdict(answer.rows[0].recommendation, parsed.verdict) },
    { returnRepresentation: true, select: 'id' });
  if (saved?.reason === 'missing-config') return { status: 'preview', error: 'office-verdict-needs-connection', http: 202 };
  if (saved?.reason === 'no-matching-row') return { status: 'error', error: 'run-not-found', http: 404 };
  if (!saved?.persisted) return { status: 'failed', error: 'office-verdict-save-failed', http: 502 };
  return { status: 'saved', runId: parsed.runId, verdict: parsed.verdict, http: 200 };
}

export function createOfficeVerdictHandler({ guard = assertHubWriteAllowed, record = recordOfficeVerdict } = {}) {
  return async req => {
    const denied = guard(req);
    if (denied) return denied;
    const body = await readHubWriteJson(req, { maxBytes: 4000 });
    if (body.error) return body.error;
    try {
      const { http, ...result } = await record(body.data);
      return Response.json(result.status === 'saved' || result.status === 'preview' ? { ok: result.status === 'saved', ...result } : { ok: false, ...result }, { status: http, headers: { 'cache-control': 'no-store' } });
    } catch {
      return Response.json({ ok: false, status: 'failed', error: 'office-verdict-save-failed' }, { status: 502, headers: { 'cache-control': 'no-store' } });
    }
  };
}

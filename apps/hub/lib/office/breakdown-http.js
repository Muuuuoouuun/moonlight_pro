import { OfficeInputError } from '@com-moon/agent-contracts/office';
import { OFFICE_BREAKDOWN_LIMITS, parseOfficeBreakdownRequest, parseOfficeBreakdownResult } from '@com-moon/agent-contracts/office-harness';
import { assertHubWriteAllowed, readHubWriteJson } from '../hub-write-guard.js';
import { callOfficeBreakdownEngine } from './breakdown-engine-client.js';

const failure = { status: 'error', error: '업무 나누기를 확인하지 못했습니다. 안건을 직접 나눠 담당을 골라 주세요.' };

// Same sizing as the routing BFF: fit any contract-valid agenda, let the contract decide.
export const OFFICE_BREAKDOWN_MAX_BODY_BYTES = OFFICE_BREAKDOWN_LIMITS.agenda * 6 + 1024;

// Recommendation only: nothing is stored, no task or request is created here.
export function createOfficeBreakdownHubHandler({ guard = assertHubWriteAllowed, callEngine = req => callOfficeBreakdownEngine(req, { retries: 1 }) } = {}) {
  return async req => {
    const denied = guard(req);
    if (denied) return denied;
    const body = await readHubWriteJson(req, { maxBytes: OFFICE_BREAKDOWN_MAX_BODY_BYTES });
    if (body.error) return body.error;
    let request;
    try { request = parseOfficeBreakdownRequest(body.data); }
    catch (error) { return Response.json({ status: 'error', error: error instanceof OfficeInputError ? error.message : '안건을 확인해 주세요.' }, { status: 400 }); }
    try {
      const result = await callEngine(request);
      if (result.status === 'recommended') return Response.json({ ...parseOfficeBreakdownResult(result, request), businessWrites: false }, { headers: { 'cache-control': 'no-store' } });
      const status = result.status === 'preview' ? 'preview' : 'error';
      return Response.json({ status, error: typeof result.error === 'string' ? result.error : failure.error }, { status: status === 'preview' ? 202 : 502, headers: { 'cache-control': 'no-store' } });
    } catch {
      return Response.json(failure, { status: 502, headers: { 'cache-control': 'no-store' } });
    }
  };
}

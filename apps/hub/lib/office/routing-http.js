import { OfficeInputError } from '@com-moon/agent-contracts/office';
import { parseOfficeRoutingRequest, parseOfficeRoutingResult } from '@com-moon/agent-contracts/office-routing';
import { assertHubWriteAllowed, readHubWriteJson } from '../hub-write-guard.js';
import { callOfficeRoutingEngine } from './routing-engine-client.js';

const failure = { status: 'error', error: '담당 추천을 확인하지 못했습니다. 담당자를 직접 선택해 주세요.' };

// The routing contract bounds the agenda at 6,000 characters. JSON may spend up to 6 bytes
// per UTF-16 unit (\uXXXX escapes; Korean needs 3), so size the byte guard to fit any
// contract-valid agenda and let the contract's character check decide. Mirrored in the
// Engine's office routing handler.
export const OFFICE_ROUTING_MAX_BODY_BYTES = 6000 * 6 + 1024;

export function createOfficeRoutingHubHandler({ guard = assertHubWriteAllowed, callEngine = callOfficeRoutingEngine } = {}) {
  return async req => {
    const denied = guard(req);
    if (denied) return denied;
    const body = await readHubWriteJson(req, { maxBytes: OFFICE_ROUTING_MAX_BODY_BYTES });
    if (body.error) return body.error;
    let request;
    try { request = parseOfficeRoutingRequest(body.data); }
    catch (error) { return Response.json({ status: 'error', error: error instanceof OfficeInputError ? error.message : '안건을 확인해 주세요.' }, { status: 400 }); }
    try {
      const result = await callEngine(request);
      if (result.status === 'recommended') return Response.json({ ...parseOfficeRoutingResult(result, request), businessWrites: false }, { headers: { 'cache-control': 'no-store' } });
      const status = result.status === 'preview' ? 'preview' : 'error';
      return Response.json({ status, error: typeof result.error === 'string' ? result.error : failure.error }, { status: status === 'preview' ? 202 : 502, headers: { 'cache-control': 'no-store' } });
    } catch {
      return Response.json(failure, { status: 502, headers: { 'cache-control': 'no-store' } });
    }
  };
}

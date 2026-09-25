import { OfficeInputError } from '@com-moon/agent-contracts/office';
import { parseOfficeRoutingRequest, parseOfficeRoutingResult } from '@com-moon/agent-contracts/office-routing';
import { assertHubWriteAllowed, readHubWriteJson } from '../hub-write-guard.js';
import { callOfficeRoutingEngine } from './routing-engine-client.js';

const failure = { status: 'error', error: '담당 추천을 확인하지 못했습니다. 담당자를 직접 선택해 주세요.' };

export function createOfficeRoutingHubHandler({ guard = assertHubWriteAllowed, callEngine = req => callOfficeRoutingEngine(req, { retries: 1 }) } = {}) {
  return async req => {
    const denied = guard(req);
    if (denied) return denied;
    const body = await readHubWriteJson(req, { maxBytes: 24000 });
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

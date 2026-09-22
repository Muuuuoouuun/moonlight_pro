import { OfficeInputError } from '@com-moon/agent-contracts/office';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowContext } from '@com-moon/agent-contracts/office-workflow';
import { generateOfficeWorkflow } from './workflow-service.ts';

export function createOfficeWorkflowEngineHandler(auth: (request: Request) => { ok: boolean }, generate = generateOfficeWorkflow) {
  return async (req: Request) => {
    if (!auth(req).ok) return Response.json({ status: 'error', error: 'Office 인증에 실패했습니다.' }, { status: 401 });
    try {
      const body = await req.text();
      if (Buffer.byteLength(body) > 120000) return Response.json({ status: 'error', error: '요청이 너무 큽니다.' }, { status: 413 });
      const input = JSON.parse(body);
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['request', 'context'].includes(key))) throw new OfficeInputError('요청 봉투가 올바르지 않습니다.');
      const request = parseOfficeWorkflowRequest(input.request);
      const context = parseOfficeWorkflowContext(input.context, request);
      const result = await generate(request, context);
      return Response.json(result, { status: result.status === 'generated' ? 200 : result.status === 'preview' ? 202 : 502 });
    } catch (error) {
      return Response.json({ status: 'error', error: error instanceof OfficeInputError ? error.message : '요청을 처리하지 못했습니다.' }, { status: error instanceof OfficeInputError || error instanceof SyntaxError ? 400 : 502 });
    }
  };
}

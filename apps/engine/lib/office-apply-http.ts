import { applyOfficeTask } from './office-apply.ts';
export function createOfficeApplyHandler(auth: (request: Request) => { ok: boolean }, apply = applyOfficeTask) {
  return async (req: Request) => {
    if (!auth(req).ok) return Response.json({ status: 'error', error: 'Office 인증에 실패했습니다.' }, { status: 401 });
    try {
      const body = await req.text();
      if (Buffer.byteLength(body) > 45000) return Response.json({ status: 'invalid-input', error: '요청이 너무 큽니다.' }, { status: 413 });
      const input = JSON.parse(body);
      if (!input || typeof input !== 'object' || Array.isArray(input) || !input.context || Object.keys(input.context).some(key => !['workspaceId', 'actorId'].includes(key))) return Response.json({ status: 'invalid-input', error: 'invalid-office-context' }, { status: 400 });
      const { context, ...command } = input;
      const result = await apply(command, context);
      const state = typeof result.status === 'string' ? result.status : 'unknown';
      const status = state === 'saved' ? 200 : ['preview', 'unknown'].includes(state) ? 202 : state === 'conflict' ? 409 : state === 'invalid-input' ? 400 : state === 'not-found' ? 404 : state === 'expired' ? 410 : 502;
      return Response.json(result, { status });
    } catch (error) {
      return Response.json({ status: error instanceof SyntaxError ? 'invalid-input' : 'unknown', error: 'Office 업무 연결을 확인하지 못했습니다.', persisted: null }, { status: error instanceof SyntaxError ? 400 : 202 });
    }
  };
}

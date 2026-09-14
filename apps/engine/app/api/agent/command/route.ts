import { NextResponse } from 'next/server.js';
import { authorizeAgentEngineRequest, readAgentCommandJson } from '../../../../lib/agent-command-http.ts';
import { executeAgentCommand } from '../../../../lib/agent-command-service.ts';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const auth = authorizeAgentEngineRequest(req);
  if (!auth.ok) return NextResponse.json(auth.data, { status: auth.httpStatus });
  const body = await readAgentCommandJson(req);
  if (!body) return NextResponse.json({ status: 'error', error: 'request-body-must-be-json-under-256kb', code: 'invalid-input', persisted: false, retryable: false }, { status: 400 });
  const result = await executeAgentCommand(body, auth.context);
  return NextResponse.json(result.data, { status: result.httpStatus });
}

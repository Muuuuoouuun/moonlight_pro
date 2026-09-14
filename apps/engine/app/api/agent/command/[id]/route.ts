import { NextResponse } from 'next/server.js';
import { authorizeAgentEngineRequest } from '../../../../../lib/agent-command-http.ts';
import { getAgentCommandReceipt } from '../../../../../lib/agent-command-service.ts';

export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeAgentEngineRequest(req);
  if (!auth.ok) return NextResponse.json(auth.data, { status: auth.httpStatus });
  const { id } = await params;
  const result = await getAgentCommandReceipt(id, auth.context);
  return NextResponse.json(result.data, { status: result.httpStatus });
}

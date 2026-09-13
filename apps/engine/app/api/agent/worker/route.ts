import { handleWorkerRequest } from '../../../../lib/agent-worker.ts';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handleWorkerRequest(request); }

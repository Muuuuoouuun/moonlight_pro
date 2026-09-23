import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { deleteContentTemplate, listContentTemplates, saveContentTemplate } from '@/lib/repositories/content-templates-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await listContentTemplates());
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const input = parsed.data;
  const action = input && typeof input === 'object' ? input.action : null;
  const run = action === 'save' ? saveContentTemplate : action === 'delete' ? deleteContentTemplate : null;
  if (!run) return NextResponse.json({ status: 'invalid-input', message: '알 수 없는 템플릿 작업입니다.' }, { status: 400 });
  const { httpStatus = 200, ...result } = await run(input);
  return NextResponse.json(result, { status: httpStatus });
}

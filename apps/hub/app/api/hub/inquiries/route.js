import { NextResponse } from 'next/server';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { resolveDefaultWorkspaceId } from '@/lib/server-write';
import { getInquiriesLedger } from '@/lib/repositories/inquiries-ledger';
import { publicInquiryCommand, forwardInquiryCommand } from '@/lib/inquiry-engine-client';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  return NextResponse.json(await getInquiriesLedger({scope:q.get('scope') || 'all',source:q.get('source') || 'all',kind:q.get('kind') || 'all',filter:q.get('filter') || 'active',page:q.get('page') || 1,pageSize:q.get('pageSize') || 25}));
}
export async function POST(req) {
  const guard = assertHubWriteAllowed(req); if (guard) return guard;
  const parsed = await readHubWriteJson(req); if (parsed.error) return parsed.error;
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId) return NextResponse.json({status:'preview',error:'workspace-not-configured'},{status:202});
  const command = publicInquiryCommand(parsed.data, workspaceId);
  if (!command) return NextResponse.json({status:'invalid-input',error:'unsupported-action'},{status:400});
  const result = await forwardInquiryCommand(command);
  return NextResponse.json(result.data,{status:result.httpStatus});
}

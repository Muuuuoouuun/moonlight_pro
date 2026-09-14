import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { runGmailInquirySync } from '@/lib/gmail-inquiry-sync';
import { getInquirySyncStatus } from '@/lib/repositories/inquiries-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Manual scan and scheduled collection share the same durable collector.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const result = await runGmailInquirySync({ maxMessages: parsed.data?.maxMessages });
  const status = result.status === 'saved' ? 200 : result.status === 'busy' ? 409 : result.status === 'error' ? 502 : 202;
  return NextResponse.json(result, { status });
}

// A read never refreshes OAuth tokens, scans Gmail, or changes collection state.
export async function GET() {
  const result = await getInquirySyncStatus();
  return NextResponse.json({ ...result, autoSyncEnabled: process.env.COM_MOON_INQUIRY_AUTO_SYNC === 'true' });
}

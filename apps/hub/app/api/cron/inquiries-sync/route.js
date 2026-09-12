import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { runGmailInquirySync } from '@/lib/gmail-inquiry-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const secret = process.env.CRON_SECRET?.trim();
  const expected = Buffer.from(secret ? `Bearer ${secret}` : '');
  const supplied = Buffer.from(req.headers.get('authorization') || '');
  if (!secret || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ status: 'forbidden', error: 'inquiry-cron-unauthorized' }, { status: 401 });
  }
  if (process.env.COM_MOON_INQUIRY_AUTO_SYNC !== 'true') {
    return NextResponse.json({ status: 'preview', reason: 'inquiry-auto-sync-disabled', enabled: false }, { status: 202 });
  }
  const result = await runGmailInquirySync({ maxMessages: 50 });
  const status = result.status === 'saved' ? 200 : result.status === 'busy' ? 409 : result.status === 'error' ? 502 : 202;
  return NextResponse.json(result, { status });
}

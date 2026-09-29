import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { searchBraveNews } from '@/lib/research-news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function transientResponse(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req, { maxBytes: 1024 });
  if (parsed.error) return parsed.error;
  const input = parsed.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some((key) => !['brand', 'topic', 'freshness'].includes(key)) ||
    typeof input.brand !== 'string' || typeof input.topic !== 'string' ||
    (input.freshness !== undefined && typeof input.freshness !== 'string')) {
    return transientResponse({ status: 'invalid-input', reason: 'invalid-news-topic', calls: 0 }, 400);
  }
  const result = await searchBraveNews({
    brand: input.brand,
    topic: input.topic,
    freshness: input.freshness,
    apiKey: process.env.BRAVE_SEARCH_API_KEY,
  });
  const httpStatus = result.status === 'invalid-input' ? 400 :
    result.reason === 'brave-rate-limited' ? 429 : result.status === 'error' ? 502 : 200;
  return transientResponse(result, httpStatus);
}

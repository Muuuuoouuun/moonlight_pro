import { NextResponse } from 'next/server.js';
import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { generateGeminiText, getGeminiIntegrationStatus } from '../../../../lib/gemini.ts';
import { assistancePrompt } from '../../../../lib/ai-assist.ts';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok || auth.mode === 'open') return NextResponse.json({ status: 'error', error: 'invalid-shared-secret' }, { status: 401 });
  let input;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 40000) return NextResponse.json({ status: 'invalid-input', error: 'body-too-large' }, { status: 413 });
    input = assistancePrompt(JSON.parse(raw));
  } catch { return NextResponse.json({ status: 'invalid-input', error: 'invalid-assistance-context' }, { status: 400 }); }
  if (!getGeminiIntegrationStatus().configured) return NextResponse.json({ status: 'preview', error: 'gemini-not-configured', usage: null }, { status: 202 });
  const result = await generateGeminiText({ ...input, retries: 1 });
  const usageMetadata = result.usageMetadata;
  const usage = usageMetadata ? Object.fromEntries(['promptTokenCount','candidatesTokenCount','totalTokenCount','cachedContentTokenCount','thoughtsTokenCount'].filter(key => Number.isFinite(usageMetadata[key]) && usageMetadata[key] >= 0).map(key => [key, usageMetadata[key]])) : null;
  const valid = result.ok && result.text.trim() && Buffer.byteLength(result.text) <= 24000;
  return NextResponse.json({ status: valid ? 'generated' : result.status == null ? 'unknown' : 'error', output: valid ? result.text : null, model: result.model, provider: 'gemini', usage: usage && Object.keys(usage).length ? usage : null, error: valid ? null : result.reason || 'invalid-output' });
}

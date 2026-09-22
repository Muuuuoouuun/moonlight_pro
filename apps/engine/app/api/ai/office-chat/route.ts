import { NextResponse } from 'next/server.js';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import {
  parseOfficeChatInput,
  OfficeContractError,
  OFFICE_AGENTS,
  OFFICE_MODES,
} from '@com-moon/agent-contracts/office';
import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { getGeminiIntegrationStatus } from '../../../../lib/gemini.ts';
import { executeOfficeChat } from '../../../../lib/office/service.ts';

export async function GET() {
  return NextResponse.json({
    service: 'com-moon-engine',
    endpoint: 'office-chat',
    agents: Object.keys(OFFICE_AGENTS),
    modes: OFFICE_MODES,
    status: getGeminiIntegrationStatus(),
  });
}

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { status: 'unauthorized', error: auth.error || 'Unauthorized shared secret' },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    const text = await req.text();
    rawBody = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { status: 'invalid-json', error: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  let sanitized;
  try {
    sanitized = parseOfficeChatInput(rawBody);
  } catch (err) {
    const code = err instanceof OfficeContractError ? err.code : 'invalid-input';
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', code, error: message },
      { status: 400 }
    );
  }

  try {
    const result = await executeOfficeChat(sanitized);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', error: message },
      { status: 500 }
    );
  }
}

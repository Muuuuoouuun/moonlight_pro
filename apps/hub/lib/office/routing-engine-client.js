import { parseOfficeRoutingResult } from '@com-moon/agent-contracts/office-routing';

const preview = { status: 'preview', error: 'Office Engine 연결이 필요합니다. 담당자를 직접 선택해 주세요.' };
const failure = { status: 'error', error: '담당 추천을 확인하지 못했습니다. 담당자를 직접 선택해 주세요.' };

export async function callOfficeRoutingEngine(request, { fetcher = fetch, engineUrl = process.env.COM_MOON_ENGINE_URL, secret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET, retries = 0 } = {}) {
  if (!engineUrl?.trim() || !secret?.trim()) return preview;
  const attempts = Math.max(0, Math.min(retries, 2));
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(`${engineUrl.trim().replace(/\/$/, '')}/api/ai/office-assignment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': secret.trim() },
        body: JSON.stringify(request),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(55_000),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 202 && body?.status === 'preview') return preview;
      if (!response.ok) {
        if (attempt < attempts && (response.status === 502 || response.status === 503)) {
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        return failure;
      }
      return parseOfficeRoutingResult(body, request);
    } catch {
      if (attempt < attempts) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      return failure;
    }
  }
  return failure;
}

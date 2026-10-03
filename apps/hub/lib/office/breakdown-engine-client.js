import { parseOfficeBreakdownResult } from '@com-moon/agent-contracts/office-harness';

const preview = { status: 'preview', error: 'Office Engine 연결이 필요합니다. 안건을 직접 나눠 담당을 골라 주세요.' };
const failure = { status: 'error', error: '업무 나누기를 확인하지 못했습니다. 안건을 직접 나눠 담당을 골라 주세요.' };

export async function callOfficeBreakdownEngine(request, { fetcher = fetch, engineUrl = process.env.COM_MOON_ENGINE_URL, secret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET, retries = 0 } = {}) {
  if (!engineUrl?.trim() || !secret?.trim()) return preview;
  const attempts = Math.max(0, Math.min(retries, 2));
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(`${engineUrl.trim().replace(/\/$/, '')}/api/ai/office-breakdown`, {
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
      return parseOfficeBreakdownResult(body, request);
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

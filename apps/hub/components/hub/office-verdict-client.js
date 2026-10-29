// 오피스 결과 판정 저장 — POST /api/hub/office/verdict, 결과는 { status:'saved'|'preview'|'error', error? } 봉투로 정규화한다.
export const OFFICE_VERDICT_VALUES = [
  { id: 'kept', label: '그대로' },
  { id: 'edited', label: '고쳐' },
  { id: 'dropped', label: '버림' },
];
export const OFFICE_VERDICT_REASONS = [
  { id: 'context', label: '맥락부족' },
  { id: 'wrong', label: '틀림' },
  { id: 'useless', label: '쓸모없음' },
];

export async function saveOfficeVerdict({ runId, value, reason, signal } = {}) {
  try {
    const response = await fetch('/api/hub/office/verdict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, value, ...(value === 'dropped' ? { reason } : {}) }),
      cache: 'no-store',
      signal,
    });
    const data = await response.json().catch(() => null);
    if (data?.status === 'saved') return { status: 'saved' };
    if (data?.status === 'preview') return { status: 'preview' };
    return { status: 'error', error: typeof data?.error === 'string' ? data.error : `http-${response.status}` };
  } catch (error) {
    return { status: 'error', error: error?.name === 'AbortError' ? 'aborted' : 'network' };
  }
}

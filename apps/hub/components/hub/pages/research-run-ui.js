export function researchContentHref(brief) {
  const id = brief?.promotion?.content_id;
  return id ? `/dashboard/content/studio?item=${encodeURIComponent(id)}` : null;
}
const RUN_REASONS = {
  'invalid-model-evidence': 'AI 근거를 원문에서 확인하지 못해 저장하지 않았어요.',
  'robots-disallowed': '원문 사이트의 접근 정책으로 건너뛰었어요.',
  'daily-quantity-reached': '오늘 준비 수에 도달했습니다. 저장된 원고를 먼저 검토해 주세요.',
  'run-quantity-reached': '이번 실행의 준비 수에 도달했습니다. 저장된 원고를 확인해 주세요.',
  'no-new-source': '새로 준비할 원문이 없습니다. 이미 확보한 자료를 확인해 주세요.',
  'no-readable-source': '본문을 확인할 수 있는 원문이 없어 저장하지 않았어요.',
  'model-outcome-unknown': 'AI 생성 결과를 확인하지 못했습니다. 같은 입력으로 실행 결과를 다시 확인해 주세요.',
  'preparation-outcome-unknown': '준비 결과를 확인하지 못했습니다. 같은 입력으로 실행 결과를 다시 확인해 주세요.',
  'run-save-unconfirmed': '실행 기록의 저장을 확인하지 못했습니다. 같은 입력으로 결과를 다시 확인해 주세요.',
  'invalid-preparation': '준비 요청을 확인하지 못했습니다. 같은 입력으로 다시 확인해 주세요.',
};
export function researchRunSummary(run) {
  return { label: ({ ok: '준비됨', success: '준비됨', completed: '준비됨', partial: '일부 준비됨', error: '준비 실패', failed: '준비 실패', unknown: '결과 확인 필요', running: '준비 중' })[run?.status] || '상태 확인 필요',
    prepared: Number.isFinite(run?.preparedCount) ? run.preparedCount : null,
    cost: Number.isFinite(run?.estimatedCostUsd) ? run.estimatedCostUsd : null, reasonCode: run?.reason || null,
    reason: !run?.reason || run.reason === 'ok' ? null : RUN_REASONS[run.reason] || '준비 상태를 확인해 주세요.' };
}
export function createResearchRunWriter({ fetch: fetcher = globalThis.fetch, uuid = () => globalThis.crypto.randomUUID() } = {}) {
  const pending = new Map();
  return async ({ brand, topic, limit }) => {
    const command = { brand, ...(topic?.trim() ? { topic: topic.trim() } : {}), ...(Number.isInteger(limit) ? { limit } : {}) };
    const key = JSON.stringify(command);
    if (!pending.has(key)) pending.set(key, uuid());
    const response = await fetcher('/api/hub/research/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: pending.get(key), ...command }), cache: 'no-store', signal: AbortSignal.timeout(180000) });
    const result = await response.json().catch(() => ({ status: 'error' }));
    // Running and unknown outcomes retain the key: another click checks the same execution.
    if (response.ok && result?.run?.id && (['ok', 'partial'].includes(result?.status) || (result?.status === 'error' && ['failed', 'error'].includes(result.run.status) && result.run.finishedAt))) pending.delete(key);
    return response.ok ? result : { status: 'error', reason: result?.reason || '준비 응답을 확인하지 못했습니다.' };
  };
}

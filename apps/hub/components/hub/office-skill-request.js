const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function officeSkillScope(agenda, officeScope) {
  if (!agenda?.taskId || !UUID.test(agenda.taskId)) return null;
  const taskScope = agenda.taskWorkspace === 'classin' ? 'classin'
    : agenda.taskWorkspace === 'brand' ? 'personal' : null;
  if (!taskScope) return null;
  return officeScope === 'all' || officeScope === taskScope ? taskScope : null;
}

export function officeSkillRequestDraft({ agenda, officeScope, result } = {}) {
  const scope = officeSkillScope(agenda, officeScope);
  if (!scope) return null;
  const nextAction = typeof result?.nextAction === 'string' ? result.nextAction.trim() : '';
  return {
    taskId: agenda.taskId,
    scope,
    instruction: nextAction === '추가 행동 없음' ? '' : nextAction.slice(0, 4000),
    expectedEvidence: '',
  };
}

export function validateOfficeSkillRequest(input) {
  if (!UUID.test(input?.requestId || '') || !UUID.test(input?.taskId || '')) return '요청 또는 할 일 ID를 확인해 주세요.';
  if (!['classin', 'personal'].includes(input.scope)) return '업무 범위를 확인해 주세요.';
  if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 4000) return '할 일을 4,000자 이내로 적어 주세요.';
  if (typeof input.expectedEvidence !== 'string' || !input.expectedEvidence.trim() || input.expectedEvidence.length > 500) return '완료를 확인할 증거를 500자 이내로 적어 주세요.';
  return null;
}

export function officeSkillRequestText(request) {
  if (!request?.requestId || !request.taskId) return '';
  return [
    'Moonlight 로컬 스킬 요청서',
    `요청 ID: ${request.requestId}`,
    `할 일 ID: ${request.taskId}`,
    `범위: ${request.scope === 'classin' ? '회사' : '개인'}`,
    `수행할 일: ${request.instruction}`,
    `완료 증거: ${request.expectedEvidence}`,
    '실행 전 범위와 파일을 직접 확인하고, 완료 후 같은 요청 ID로 receipt를 기록해 주세요. 요청서 복사는 할 일 완료가 아닙니다.',
  ].join('\n');
}

export async function saveOfficeSkillRequest(input, { fetcher = fetch } = {}) {
  const invalid = validateOfficeSkillRequest(input);
  if (invalid) return { status: 'error', error: invalid, persisted: false };
  try {
    const response = await fetcher('/api/hub/skill-requests', {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({
        requestId: input.requestId, taskId: input.taskId, scope: input.scope,
        instruction: input.instruction.trim(), expectedEvidence: input.expectedEvidence.trim(),
      }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.status === 'ready' && data.persisted === true
      && data.request?.requestId === input.requestId && data.request?.taskId === input.taskId) {
      return { status: 'ready', persisted: true, request: data.request, replayed: data.replayed === true };
    }
    if (data?.status === 'preview') return { status: 'preview', persisted: false, error: '저장 연결이 없어 요청서를 만들지 못했습니다.' };
    return { status: 'error', persisted: false, error: data?.error || '요청서를 저장하지 못했습니다. 다시 확인해 주세요.' };
  } catch {
    return { status: 'error', persisted: false, error: '요청서를 저장하지 못했습니다. 연결을 확인해 주세요.' };
  }
}

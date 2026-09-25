const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function officeSkillScope(agenda, officeScope, selectedScope = null) {
  if (!agenda?.taskId || !UUID.test(agenda.taskId)) return null;
  const taskScope = agenda.taskWorkspace === 'classin' ? 'classin'
    : agenda.taskWorkspace === 'brand' ? 'personal' : null;
  if (!taskScope) return officeScope === 'all' && ['classin', 'personal'].includes(selectedScope) ? selectedScope : null;
  return officeScope === 'all' || officeScope === taskScope ? taskScope : null;
}

export function officeSkillRequestDraft({ agenda, officeScope, result, selectedScope = null } = {}) {
  const scope = officeSkillScope(agenda, officeScope, selectedScope);
  if (!scope && !(officeScope === 'all' && agenda?.taskId && UUID.test(agenda.taskId) && !agenda.taskWorkspace)) return null;
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
    '',
    '처리 방법(Claude Code·Codex, moonlight MCP):',
    '1. get_skill_request로 위 요청 ID를 읽어 서버 원문과 상태를 확인한다. 이미 completed·failed면 다시 실행하지 않는다.',
    '2. 수행할 일에 적힌 범위(폴더·파일)만 다룬다. 삭제는 휴지통으로 보내고, 여러 파일을 한꺼번에 옮기거나 지우기 전에는 할 일을 먼저 보여 주고 확인을 받는다.',
    '3. 끝나면 record_skill_receipt로 실제 결과를 기록한다. state는 completed(증거 1개 이상)·failed·unconfirmed, evidence는 path·url·note로 확인 가능한 것만 적는다.',
    '4. 요청서 복사나 채팅의 "완료" 문장은 완료가 아니다. receipt도 할 일을 완료시키지 않는다 — 할 일까지 끝내려면 complete_task를 따로 부르고 그 commandId를 receipt에 넣는다.',
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
    return { status: 'error', persisted: false, error: data?.error === 'task-scope-or-owner-mismatch'
      ? '할 일의 범위가 일치하지 않습니다. 범위를 바꿔 다시 확인해 주세요.'
      : data?.error === 'skill-storage-unavailable'
        ? '요청서 저장소가 아직 준비되지 않았습니다.'
        : data?.error === 'skill-storage-not-configured'
          ? '요청서 저장소 연결이 설정되지 않았습니다.'
          : data?.error || '요청서를 저장하지 못했습니다. 다시 확인해 주세요.' };
  } catch {
    return { status: 'error', persisted: false, error: '요청서를 저장하지 못했습니다. 연결을 확인해 주세요.' };
  }
}

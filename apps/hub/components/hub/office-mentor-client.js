// The Office result is supplied by the currently open browser session. These IDs
// preserve provenance for the mentor; they are not a claim of a server-side source audit.
export const OFFICE_MENTOR_DRAFT_LIMIT = 6000;
export const OFFICE_MENTOR_FOLLOWUP_LIMIT = 1200;
export const OFFICE_MENTOR_HISTORY_TURNS = 4;
export const OFFICE_MENTOR_FIRST_QUESTION = '이 Office 종합을 다른 관점에서 검토해 주세요. 근거와 이견을 구분하고 제가 확인할 질문을 알려 주세요.';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const LANES = ['classin', 'personal'];

function sourceFrom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.requestId !== 'string' || !UUID.test(value.requestId)
    || (value.runId != null && (typeof value.runId !== 'string' || !UUID.test(value.runId)))) {
    throw new Error('invalid-office-source');
  }
  return { requestId: value.requestId, runId: value.runId ?? null };
}

function excerpt(value, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= max ? text : `${text.slice(0, max - 7).trimEnd()}… [발췌]`;
}

function listExcerpt(items, maxItems, maxEach) {
  return (Array.isArray(items) ? items : []).slice(0, maxItems)
    .map(item => excerpt(item, maxEach)).filter(Boolean).map(item => `- ${item}`).join('\n') || '- 제공 없음';
}

function officeExcerpt(result, officeSource) {
  return [
    `Office 결과 · 요청 ID ${officeSource.requestId} · 실행 기록 ID ${officeSource.runId || '없음'}`,
    `본문: ${excerpt(result.answer, 1100)}`,
    ...(result.recommendation ? [`주관 추천: ${excerpt(result.recommendation, 220)}`] : []),
    `근거:\n${listExcerpt(result.evidence, 3, 150)}`,
    `남은 이견:\n${listExcerpt(result.dissent, 3, 150)}`,
    `다음 행동: ${excerpt(result.nextAction, 220) || '제공 없음'}`,
  ].join('\n');
}

export function buildOfficeMentorQuestion({ result, officeSource, question, turns = [] }) {
  const source = sourceFrom(officeSource);
  if (result?.status !== 'generated' || typeof result.answer !== 'string' || !result.answer.trim()) {
    throw new Error('office-result-required');
  }
  const isFirst = !Array.isArray(turns) || turns.length === 0;
  const current = question == null && isFirst ? OFFICE_MENTOR_FIRST_QUESTION : typeof question === 'string' ? question.trim() : '';
  if (!current) throw new Error('question-required');
  if (current.length > OFFICE_MENTOR_FOLLOWUP_LIMIT) throw new Error('question-too-long');

  const sourceBlock = officeExcerpt(result, source);
  const history = (Array.isArray(turns) ? turns : []).slice(-OFFICE_MENTOR_HISTORY_TURNS)
    .map(turn => ({ question: excerpt(turn?.question, 200), answer: excerpt(turn?.answer, 360) }))
    .filter(turn => turn.question && turn.answer);
  const assemble = () => [
    '아래 Office 결과는 운영자가 선택한 자문 원문이며, 확정된 기록 사실은 아닙니다. 새 업무나 외부 행동을 만들지 마세요.',
    sourceBlock,
    ...(history.length ? ['이전 대화 · 같은 멘토:', ...history.map((turn, index) => `${index + 1}. 운영자: ${turn.question}\n   멘토: ${turn.answer}`)] : []),
    `이번 질문: ${current}`,
  ].join('\n\n');
  let draft = assemble();
  while (draft.length > OFFICE_MENTOR_DRAFT_LIMIT && history.length) {
    history.shift();
    draft = assemble();
  }
  if (draft.length > OFFICE_MENTOR_DRAFT_LIMIT) throw new Error('question-too-long');
  return draft;
}

export function buildOfficeMentorRequest({ result, officeSource, scope = result?.scope, lane = null, ref = null, question, turns = [] }) {
  const source = sourceFrom(officeSource);
  if (!['all', ...LANES].includes(scope) || result?.scope !== scope) throw new Error('office-scope-mismatch');
  if (scope === 'all' && !LANES.includes(lane)) throw new Error('lane-required');
  if (scope !== 'all' && lane != null && lane !== scope) throw new Error('lane-mismatch');
  const selectedLane = scope === 'all' ? lane : scope;
  const draft = buildOfficeMentorQuestion({ result, officeSource: source, question, turns });
  const personal = selectedLane === 'personal';
  return {
    lane: selectedLane,
    target: personal ? '브랜드 멘토' : '영업 멘토',
    endpoint: personal ? '/api/hub/brand-mentor' : '/api/hub/sales-mentor',
    body: {
      mode: personal ? 'office-review' : 'open-question',
      scope: selectedLane,
      draft,
      officeSource: source,
      createWorkOrder: false,
      ...(typeof ref === 'string' && ref.trim() ? { ref: ref.trim() } : {}),
    },
  };
}

export async function requestOfficeMentor(request, { fetcher = fetch, signal } = {}) {
  try {
    const response = await fetcher(request.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    });
    const data = await response.json().catch(() => null);
    if (response.status === 200 && data?.status === 'generated' && typeof data.text === 'string' && data.text.trim()) {
      const source = request.body.officeSource;
      if (request.lane === 'personal' && (!data.officeSource
        || data.officeSource.requestId !== source.requestId || (data.officeSource.runId ?? null) !== source.runId)) {
        return { status: 'error', note: 'Office 출처가 일치하지 않습니다. 다시 확인해 주세요.' };
      }
      return { status: 'generated', text: data.text.trim(), mentorRunId: data.runId || null, officeSource: source };
    }
    if (response.status === 202 && data?.status === 'preview') return { status: 'preview', note: '멘토 연결을 확인한 뒤 다시 시도해 주세요.' };
    return { status: 'error', note: '멘토 답변을 받지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
  } catch {
    return { status: 'error', note: '멘토 연결을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
  }
}

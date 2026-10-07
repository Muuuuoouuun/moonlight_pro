import { officeRemainingDissent } from './office-deliberation-client.js';

// The Office result is supplied by the currently open browser session. These IDs
// preserve provenance for the mentor; they are not a claim of a server-side source audit.
//
// 2026-09-25 운영자 확정 "기존 원문 내용들 과도하게 압축되지 않기": the Office result travels
// verbatim. The draft limit covers the largest answer the Office contract allows (answer
// 10,000 + recommendation 2,000 + evidence and dissent 5 × 1,000 each + next action 1,000)
// plus labels and a full follow-up question. The Hub and Engine mentor routes accept the
// same limit for Office escalations on both lanes.
export const OFFICE_MENTOR_DRAFT_LIMIT = 25000;
export const OFFICE_MENTOR_FOLLOWUP_LIMIT = 1200;
export const OFFICE_MENTOR_HISTORY_TURNS = 4;
export const OFFICE_MENTOR_HISTORY_ANSWER_LIMIT = 4000;
export const OFFICE_MENTOR_FIRST_QUESTION = '이 오피스 종합을 다른 관점에서 검토해 주세요. 근거와 이견을 구분하고 제가 확인할 질문을 알려 주세요.';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const LANES = ['classin', 'personal'];
// Room for the marker a cut field gains, so one cut usually lands under the limit.
const MARKER_ROOM = 40;

function sourceFrom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.requestId !== 'string' || !UUID.test(value.requestId)
    || (value.runId != null && (typeof value.runId !== 'string' || !UUID.test(value.runId)))) {
    throw new Error('invalid-office-source');
  }
  return { requestId: value.requestId, runId: value.runId ?? null };
}

const clean = value => (typeof value === 'string' ? value.trim() : '');
const count = value => value.toLocaleString('ko-KR');
const cutMarker = (total, sent) => `[원문 ${count(total)}자 중 ${count(sent)}자 전달]`;

// Only a hard-cap overflow cuts text, and every cut says how much of the original was sent.
function excerpt(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  const kept = text.slice(0, Math.max(0, max - MARKER_ROOM)).trimEnd();
  return `${kept} … ${cutMarker(text.length, kept.length)}`;
}

function sourceFields(result) {
  const answer = clean(result.answer);
  const recommendation = clean(result.recommendation);
  const items = (value, label) => (Array.isArray(value) ? value : []).map(clean).filter(Boolean)
    .map((text, index) => ({ label: `${label} ${index + 1}`, group: label, text }));
  return [
    { label: '본문', text: answer },
    // The result card hides a recommendation that repeats the answer; sending it twice adds nothing.
    ...(recommendation && recommendation !== answer ? [{ label: '주관 추천', text: recommendation }] : []),
    ...items(result.evidence, '근거'),
    ...items(officeRemainingDissent(result), '남은 이견'),
    { label: '다음 행동', text: clean(result.nextAction) },
  ].map(field => ({ ...field, sent: field.text }));
}

const fieldText = field => (field.sent.length === field.text.length ? field.text
  : `${field.sent} … ${cutMarker(field.text.length, field.sent.length)}`);

function renderSource(fields, officeSource) {
  const single = label => fields.find(field => field.label === label);
  const list = group => fields.filter(field => field.group === group).map(field => `- ${fieldText(field)}`).join('\n') || '- 제공 없음';
  const recommendation = single('주관 추천');
  const next = single('다음 행동');
  return [
    `오피스 결과 · 요청 ID ${officeSource.requestId} · 실행 기록 ID ${officeSource.runId || '없음'}`,
    `본문:\n${fieldText(single('본문'))}`,
    ...(recommendation ? [`주관 추천:\n${fieldText(recommendation)}`] : []),
    `근거:\n${list('근거')}`,
    `남은 이견:\n${list('남은 이견')}`,
    `다음 행동:\n${next.text ? fieldText(next) : '제공 없음'}`,
  ].join('\n\n');
}

// Cut the longest field first, never below the next-longest one in a single step,
// so an overflow is absorbed by the field that can best afford it.
function shrinkLongest(fields, excess) {
  const ranked = fields.filter(field => field.sent.length > 0).sort((a, b) => b.sent.length - a.sent.length);
  const target = ranked[0];
  if (!target) return false;
  const wanted = Math.max(0, target.sent.length - excess - MARKER_ROOM);
  let keep = Math.max(wanted, ranked[1]?.sent.length ?? 0);
  if (keep >= target.sent.length) keep = wanted;
  target.sent = target.text.slice(0, keep).trimEnd();
  return true;
}

// Returns the mentor draft plus which Office fields (if any) had to be cut, so the
// drawer can say that the mentor saw a partial source. Order of sacrifice: older
// conversation turns first, then the longest Office field, each cut marked in the text.
export function buildOfficeMentorDraft({ result, officeSource, question, turns = [] }) {
  const source = sourceFrom(officeSource);
  if (result?.status !== 'generated' || typeof result.answer !== 'string' || !result.answer.trim()) {
    throw new Error('office-result-required');
  }
  const isFirst = !Array.isArray(turns) || turns.length === 0;
  const current = question == null && isFirst ? OFFICE_MENTOR_FIRST_QUESTION : typeof question === 'string' ? question.trim() : '';
  if (!current) throw new Error('question-required');
  if (current.length > OFFICE_MENTOR_FOLLOWUP_LIMIT) throw new Error('question-too-long');

  const fields = sourceFields(result);
  const history = (Array.isArray(turns) ? turns : []).slice(-OFFICE_MENTOR_HISTORY_TURNS)
    .map(turn => ({ question: excerpt(turn?.question, OFFICE_MENTOR_FOLLOWUP_LIMIT), answer: excerpt(turn?.answer, OFFICE_MENTOR_HISTORY_ANSWER_LIMIT) }))
    .filter(turn => turn.question && turn.answer);
  const assemble = () => [
    '아래 오피스 결과는 운영자가 선택한 자문 원문이며, 확정된 기록 사실은 아닙니다. 새 업무나 외부 행동을 만들지 마세요.',
    renderSource(fields, source),
    ...(history.length ? ['이전 대화 · 같은 멘토:', ...history.map((turn, index) => `${index + 1}. 운영자: ${turn.question}\n   멘토: ${turn.answer}`)] : []),
    `이번 질문: ${current}`,
  ].join('\n\n');
  let draft = assemble();
  while (draft.length > OFFICE_MENTOR_DRAFT_LIMIT && history.length) {
    history.shift();
    draft = assemble();
  }
  while (draft.length > OFFICE_MENTOR_DRAFT_LIMIT && shrinkLongest(fields, draft.length - OFFICE_MENTOR_DRAFT_LIMIT)) {
    draft = assemble();
  }
  if (draft.length > OFFICE_MENTOR_DRAFT_LIMIT) throw new Error('question-too-long');
  const cut = fields.filter(field => field.sent.length < field.text.length)
    .map(field => ({ label: field.label, total: field.text.length, sent: field.sent.length }));
  return { draft, sourceTruncation: cut.length ? cut : null };
}

export function buildOfficeMentorQuestion(input) {
  return buildOfficeMentorDraft(input).draft;
}

// One line for the drawer: which Office fields the mentor saw only in part.
export function officeMentorPartialNote(sourceTruncation) {
  if (!Array.isArray(sourceTruncation) || !sourceTruncation.length) return null;
  const parts = sourceTruncation.map(field => `${field.label} ${count(field.total)}자 중 ${count(field.sent)}자`);
  return `멘토는 오피스 원문 일부만 받았습니다 · ${parts.join(' · ')}. 전체 원문은 오피스 결과 카드에 있습니다.`;
}

export function buildOfficeMentorRequest({ result, officeSource, scope = result?.scope, lane = null, ref = null, question, turns = [] }) {
  const source = sourceFrom(officeSource);
  if (!['all', ...LANES].includes(scope) || result?.scope !== scope) throw new Error('office-scope-mismatch');
  if (scope === 'all' && !LANES.includes(lane)) throw new Error('lane-required');
  if (scope !== 'all' && lane != null && lane !== scope) throw new Error('lane-mismatch');
  const selectedLane = scope === 'all' ? lane : scope;
  const { draft, sourceTruncation } = buildOfficeMentorDraft({ result, officeSource: source, question, turns });
  const personal = selectedLane === 'personal';
  return {
    lane: selectedLane,
    target: personal ? '브랜드 멘토' : '영업 멘토',
    endpoint: personal ? '/api/hub/brand-mentor' : '/api/hub/sales-mentor',
    sourceTruncation,
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
      // Both lanes must echo the Office source the server recorded with the mentor run.
      const source = request.body.officeSource;
      if (!data.officeSource || data.officeSource.requestId !== source.requestId || (data.officeSource.runId ?? null) !== source.runId) {
        return { status: 'error', note: '오피스 출처가 일치하지 않습니다. 다시 확인해 주세요.' };
      }
      return { status: 'generated', text: data.text.trim(), mentorRunId: data.runId || null, officeSource: source };
    }
    if (response.status === 202 && data?.status === 'preview') return { status: 'preview', note: '멘토 연결을 확인한 뒤 다시 시도해 주세요.' };
    return { status: 'error', note: '멘토 답변을 받지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
  } catch {
    return { status: 'error', note: '멘토 연결을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
  }
}

'use client';

import { OFFICE_ROSTER } from '@com-moon/agent-contracts/office';

const personName = id => OFFICE_ROSTER.find(person => person.id === id)?.name || id;
const FIELD_LABELS = { position: '첫 의견', objection: '반론', revisionCondition: '판단을 바꿀 조건' };
const ASSESSMENT_LABELS = { supports: '동의', challenges: '반론', needs_evidence: '근거 필요' };
const RESOLUTION_LABELS = { addressed: '종합에 반영', open: '남은 쟁점', not_applicable: '이번 판단에서 제외' };

// These rows live inside the existing speech details on both Office surfaces.
export function OfficeSpeechEvidence({ speech }) {
  return <>
    {speech.sourceCounts ? <div><dt>출처 연결</dt><dd>선택 <span className="mono">{speech.sourceCounts.selected}</span> · 원문 일치 <span className="mono">{speech.sourceCounts.traced}</span> · 연결 안 됨 <span className="mono">{speech.sourceCounts.untraced}</span>
      {speech.sourceCheck === 'none' ? ' · 선택한 출처 없음' : null}</dd></div> : null}
    {speech.peerReviews?.map(review => <div key={review.ownerId}><dt>{personName(review.ownerId)}의 {FIELD_LABELS[review.field]}에 {ASSESSMENT_LABELS[review.assessment]}</dt>
      <dd><q>{review.quote}</q><p>{review.reason}</p></dd></div>)}
  </>;
}

export function OfficeCollaborationSummary({ evaluation }) {
  if (!evaluation) return null;
  if (evaluation.source.selected === null) return <p>이전 기록 · 발언 인용과 출처 연결, 반론 처리 내역을 기록하기 전 회의입니다.</p>;
  return <p>{evaluation.reviewRequired
    ? <>검토받은 관점 <span className="mono">{evaluation.reviewedRoleIds.length}/{evaluation.participants}</span> · 연결된 상호 검토 <span className="mono">{evaluation.peerReviews}</span>건</>
    : '설정에 따라 첫 의견만 검토'}
    {' · '}남은 반론 <span className="mono">{evaluation.objections.open}</span>건
    {' · '}연결 안 된 출처 <span className="mono">{evaluation.source.untraced}</span>건.
    {' '}기록 연결을 점검한 수치이며 답변의 정확성이나 독립 검증을 뜻하지 않습니다.</p>;
}

export function OfficeObjectionResolutions({ discussion }) {
  if (!discussion?.resolutions?.length) return null;
  return <><strong>반론 처리 기록</strong><dl>{discussion.resolutions.map(resolution => {
    const speech = discussion.turns.find(turn => turn.turnRef === resolution.turnRef);
    return <div key={resolution.turnRef}><dt>{personName(speech.ownerId)} · {speech.round === 'position' ? '첫 의견' : '상호 검토'} · {RESOLUTION_LABELS[resolution.disposition]}</dt>
      <dd><q>{speech.objection}</q><p>{resolution.rationale}</p></dd></div>;
  })}</dl></>;
}

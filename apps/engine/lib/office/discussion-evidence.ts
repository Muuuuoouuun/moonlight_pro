import { officeDiscussionReviewTargets, parseOfficeDiscussionResolutions, type OfficeDiscussionTurn, type OfficeId } from '@com-moon/agent-contracts/office';

type PeerExcerpt = { index: number; ownerId: string; field: 'position'|'objection'|'revisionCondition'; quote: string };
type PeerCatalog = readonly PeerExcerpt[];
const fields = ['position', 'objection', 'revisionCondition'] as const;
const assessments = ['supports', 'challenges', 'needs_evidence'];
const check: (ok: unknown) => asserts ok = ok => { if (!ok) throw new Error('invalid-discussion-evidence'); };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// The provider chooses an excerpt; only the server copies its attribution and
// verbatim text. This guarantees traceability, never relevance or truth.
export function buildOfficePeerCatalog(positions: readonly Pick<OfficeDiscussionTurn, 'ownerId'|'position'|'objection'|'revisionCondition'>[], ownerId: string): PeerCatalog {
  const catalog: PeerExcerpt[] = [];
  for (const position of positions.filter(turn => turn.ownerId !== ownerId)) {
    for (const field of fields) {
      let chunk = '';
      const add = () => { if (chunk.trim()) catalog.push({ index: catalog.length, ownerId: position.ownerId, field, quote: chunk }); };
      for (const unit of position[field]) {
        if (chunk.length + unit.length > 400) { add(); chunk = ''; }
        chunk += unit;
      }
      add();
    }
  }
  return catalog;
}

function peerOrder(participants: OfficeId[], ownerId: OfficeId) {
  const target = officeDiscussionReviewTargets(participants)[ownerId];
  check(target);
  return [target, ...participants.filter(id => id !== ownerId && id !== target)];
}

export function officePeerReviewSchema(participants: OfficeId[], ownerId: OfficeId, catalog: PeerCatalog) {
  const order = peerOrder(participants, ownerId);
  const properties = Object.fromEntries(order.map((id, index) => {
    const review = { type: 'object', additionalProperties: false, properties: {
      quoteIndex: { type: 'integer', enum: catalog.filter(item => item.ownerId === id).map(item => item.index), description: 'peerReviewCatalog에서 검토할 쟁점의 index를 고른다. 원문·역할·필드는 서버가 붙인다.' },
      assessment: { type: 'string', enum: assessments },
      reason: { type: 'string', minLength: 1, maxLength: 400, description: '선택한 쟁점의 근거·영향에 답한다. 인용 일치는 독립 검증이 아니다.' },
    }, required: ['quoteIndex', 'assessment', 'reason'] };
    return [id, index === 0 ? review : { anyOf: [{ type: 'null' }, review], description: '추가 검토가 불필요하면 null.' }];
  }));
  return { type: 'object', additionalProperties: false, properties, required: order };
}

export function readOfficePeerReviews(raw: Record<string, unknown>, participants: OfficeId[], ownerId: OfficeId, catalog: PeerCatalog) {
  const order = peerOrder(participants, ownerId);
  check(!Object.hasOwn(raw, 'peerReviews') && !Object.hasOwn(raw, 'replyTo'));
  const { peerReviewsByOwner, ...content } = raw;
  check(exactKeys(peerReviewsByOwner, order));
  const peerReviews = order.flatMap((id, index) => {
    const review = peerReviewsByOwner[id];
    if (index > 0 && review === null) return [];
    check(exactKeys(review, ['quoteIndex', 'assessment', 'reason']));
    check(Number.isSafeInteger(review.quoteIndex));
    const excerpt = catalog[review.quoteIndex as number];
    check(excerpt && excerpt.index === review.quoteIndex && excerpt.ownerId === id);
    check(typeof review.assessment === 'string' && assessments.includes(review.assessment));
    check(typeof review.reason === 'string' && review.reason.trim() && review.reason.length <= 400 && !review.reason.includes('\0'));
    return [{ ownerId: id, field: excerpt.field, quote: excerpt.quote, assessment: review.assessment, reason: review.reason }];
  });
  return { ...content, peerReviews, replyTo: peerReviews.map(review => review.ownerId) };
}

export function officeResolutionSchema(turns: readonly OfficeDiscussionTurn[]) {
  const refs = turns.filter(turn => turn.objection).map(turn => turn.turnRef!);
  const decision = { type: 'object', additionalProperties: false, properties: {
    disposition: { type: 'string', enum: ['addressed', 'open', 'not_applicable'] },
    rationale: { type: 'string', minLength: 1, maxLength: 400 },
  }, required: ['disposition', 'rationale'] };
  return { type: 'object', additionalProperties: false, description: '각 반론에 한 번씩 답한다. 근거가 없으면 open. addressed는 추천에 반영했다는 뜻이며 사실 검증이나 실행 완료가 아니다.', properties: Object.fromEntries(refs.map(ref => [ref, decision])), required: refs };
}

export function readOfficeResolutions(value: unknown, turns: OfficeDiscussionTurn[]) {
  const refs = turns.filter(turn => turn.objection).map(turn => turn.turnRef!);
  check(exactKeys(value, refs));
  const resolutions = refs.map(turnRef => {
    const decision = value[turnRef];
    check(exactKeys(decision, ['disposition', 'rationale']));
    return { turnRef, ...decision };
  });
  return parseOfficeDiscussionResolutions(resolutions, turns);
}

// 회의 리뷰에서 수락한 결정을 결정 일지에 모은다(확인할 것 스펙 §6, Q-CF4 승인 2026-10-01).
//
// 복제가 아니라 참조다 — 원문(회의 메모의 제안)은 그 자리에 두고, 결정 행이 `meta.sourceRef:
// { type: "meeting", id: <메모 id> }`로 가리킨다. 결정 id는 제안 id 그대로라 같은 수락을 다시 보내도
// Engine 멱등 경로가 duplicate로 받는다. 수락 뒤 문구를 고쳐 다시 수락하면 같은 결정을 고친다.
// 모으기에 실패해도 회의 리뷰 저장은 성공이다 — 응답에 `decisionLog`로 따로 알린다.

const OK = new Set(['saved', 'duplicate']);

export function acceptedDecisionProposal(input, result) {
  if (input?.action !== 'review' || input?.decision !== 'accepted') return null;
  if (!OK.has(String(result?.status || ''))) return null;
  const proposal = (Array.isArray(result?.proposals) ? result.proposals : []).find((item) => item?.id === input.proposalId);
  if (!proposal || proposal.kind !== 'decision' || proposal.review?.status !== 'accepted') return null;
  const title = String(proposal.review?.text || proposal.text || '').trim();
  if (!title) return null;
  return { id: proposal.id, entryId: result.entryId || input.entryId, title: title.slice(0, 300), decidedAt: proposal.review?.reviewedAt || null };
}

export async function collectAcceptedDecision(input, result, { forward, workspaceId }) {
  const decision = acceptedDecisionProposal(input, result);
  if (!decision) return null;
  const create = await forward({
    action: 'create_decision',
    id: decision.id,
    title: decision.title,
    ...(decision.decidedAt ? { decidedAt: decision.decidedAt } : {}),
    source: 'meeting-review',
    sourceRef: { type: 'meeting', id: decision.entryId },
    workspaceId,
  });
  const status = String(create?.data?.status || 'error');
  if (OK.has(status)) return { status, decisionId: decision.id };
  if (status === 'conflict' && create?.data?.error === 'id-reuse-payload-mismatch') {
    const update = await forward({ action: 'update_decision', id: decision.id, title: decision.title, ...(decision.decidedAt ? { decidedAt: decision.decidedAt } : {}), workspaceId });
    const updated = String(update?.data?.status || 'error');
    return { status: OK.has(updated) ? 'saved' : updated, decisionId: decision.id };
  }
  return { status, decisionId: decision.id };
}

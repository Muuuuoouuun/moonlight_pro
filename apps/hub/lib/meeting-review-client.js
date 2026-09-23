import { isCanonicalUuid } from './uuid.js';
import { selectedNoteExcerpt } from './journal-client.js';

const DURABLE = new Set(['saved', 'duplicate']);

export function readMeetingReviewEnvelope(response, data) {
  if (response?.ok && data?.status === 'live' && Array.isArray(data.proposals)) return data;
  if (data?.status === 'preview') return { status: 'preview', proposals: [], run: null, usage: { status: 'unknown' } };
  return { status: 'error', proposals: [], run: null, usage: { status: 'unknown' }, error: data?.message || '회의 정리 결과를 불러오지 못했어요.' };
}

export function meetingReviewWriteSucceeded(response, data) {
  return Boolean(response?.ok && DURABLE.has(data?.status));
}

export function buildMeetingTaskCommand(entry, proposal) {
  const title = proposal?.review?.text?.trim();
  const source = proposal?.source;
  if (!isCanonicalUuid(entry?.id) || !isCanonicalUuid(proposal?.id)
    || !Number.isSafeInteger(entry?.revision) || entry.revision < 1
    || proposal.kind !== 'action' || proposal.review?.status !== 'accepted'
    || proposal.application?.status === 'saved'
    || typeof title !== 'string' || !title || title.length > 200
    || typeof source?.quote !== 'string' || !source.quote.trim()
    || !Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.end)
    || typeof entry.body !== 'string' || entry.body.slice(source.start, source.end) !== source.quote) return null;
  const selection = selectedNoteExcerpt(entry.body, source.start, source.end);
  if (!selection || selection.text !== source.quote) return null;
  return {
    action: 'create_task',
    requestId: proposal.id,
    entryId: entry.id,
    expectedRevision: entry.revision,
    selection,
    target: { title, dueAt: null, projectId: null },
  };
}

export function meetingTaskWriteSucceeded(response, data, command) {
  return Boolean(response?.ok && DURABLE.has(data?.status)
    && data?.entry?.id === command?.entryId
    && data?.target?.type === 'task' && isCanonicalUuid(data.target.id)
    && data.target.href === `/dashboard/work/my?task=${data.target.id}`
    && data?.link?.targetType === 'task' && data.link.targetId === data.target.id
    && data.link.sourceRevision === command.expectedRevision
    && data.link.excerpt === command.selection?.text);
}

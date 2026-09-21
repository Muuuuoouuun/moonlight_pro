import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeAssistanceCommand } from './ai-assistance.js';

const hash = text => createHash('sha256').update(JSON.stringify(text)).digest('hex');
const candidate = { id: randomUUID(), revision: 3, review: { outcome: 'accepted', baselineMinutes: 30, reviewMinutes: 0, actualMinutes: null, note: '기록한 메모' } };

test('quick review saves only the decision while preserving recorded details and unknown time', async () => {
  const { candidateReviewInput } = await import('./ai-review-client.js');
  const input = candidateReviewInput(candidate, 'rejected');
  assert.deepEqual(input, { candidateId: candidate.id, expectedRevision: 3, outcome: 'rejected', baselineMinutes: 30, reviewMinutes: 0, actualMinutes: null, note: '기록한 메모' });
  assert.deepEqual(normalizeAssistanceCommand({ commandId: randomUUID(), action: 'review_candidate', input }).input, input);
  const first = candidateReviewInput({ id: candidate.id, revision: 1 }, 'accepted');
  assert.equal(first.baselineMinutes, null); assert.equal(first.reviewMinutes, null); assert.equal(first.actualMinutes, null);
});

test('quick-save refresh preserves unsaved detail inputs, while unrelated revisions retain stale CAS', async () => {
  const { candidateReviewDraft, candidateReviewInput } = await import('./ai-review-client.js');
  const draft = { ...candidateReviewDraft(candidate), dirty: true, note: '아직 저장하지 않은 메모', reviewMinutes: '6' };
  const updated = { ...candidate, revision: 4, review: { ...candidate.review, outcome: 'edited' } };
  assert.deepEqual(candidateReviewDraft(updated, draft), draft);
  assert.equal(candidateReviewInput(updated, draft.outcome, draft).expectedRevision, 3);
  const own = candidateReviewDraft(updated, draft, true);
  assert.equal(own.revision, 4); assert.equal(own.note, draft.note); assert.equal(own.reviewMinutes, '6');
  assert.equal(own.dirty, true);
  assert.equal(own.outcome, 'edited', 'a decision must not be reverted when saving a draft note later');
  assert.equal(candidateReviewInput(updated, own.outcome, own).reviewMinutes, 6);
  assert.equal(candidateReviewDraft(updated, { ...draft, outcomeDirty: true, outcome: 'rejected' }, true).outcome, 'rejected', 'an explicitly edited decision remains part of the draft');
});

test('copy reads every page of the same candidate and verifies the complete output before clipboard success', async () => {
  const { copyCandidateOutput } = await import('./ai-review-client.js');
  const output = '앞부분\n뒷부분', outputHash = hash(output), writes = [];
  const result = await copyCandidateOutput({ id: candidate.id, output: '앞부분\n', nextOffset: 4, outputHash }, {
    fetchImpl: async url => { assert.match(url, /offset=4/); return { ok: true, json: async () => ({ status: 'live', offset: 4, nextOffset: null, outputHash, candidate: { id: candidate.id, output: '뒷부분' } }) }; },
    writeText: async value => { writes.push(value); },
  });
  assert.equal(result, output); assert.deepEqual(writes, [output]);
  await assert.rejects(copyCandidateOutput({ id: candidate.id, output, nextOffset: null, outputHash }, { writeText: async () => { throw new Error('clipboard denied'); } }), /clipboard denied/);
});

test('changed or corrupt candidate output cannot be copied as a successful complete result', async () => {
  const { copyCandidateOutput } = await import('./ai-review-client.js');
  let writes = 0;
  const full = { id: candidate.id, output: '내용', nextOffset: null, outputHash: hash('다른 내용') };
  await assert.rejects(copyCandidateOutput(full, { writeText: async () => { writes++; } }));
  const partial = { ...full, output: '앞', nextOffset: 1, outputHash: hash('앞뒤') };
  await assert.rejects(copyCandidateOutput(partial, { fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'live', offset: 1, nextOffset: null, outputHash: hash('변경'), candidate: { id: candidate.id, output: '뒤' } }) }), writeText: async () => { writes++; } }));
  assert.equal(writes, 0);
});

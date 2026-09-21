const minuteFields = ['baselineMinutes', 'reviewMinutes', 'actualMinutes'];

export function candidateReviewDraft(candidate, previous, ownDecisionSave = false) {
  if (previous?.dirty) return ownDecisionSave
    ? { ...previous, revision: candidate.revision, outcome: previous.outcomeDirty ? previous.outcome : candidate.review?.outcome || '' }
    : previous;
  return {
    revision: candidate.revision, dirty: false, outcomeDirty: false, outcome: candidate.review?.outcome || '',
    ...Object.fromEntries(minuteFields.map(key => [key, candidate.review?.[key] == null ? '' : String(candidate.review[key])])),
    note: candidate.review?.note || '',
  };
}

export function candidateReviewInput(candidate, outcome, draft) {
  const source = draft || candidate.review || {};
  const input = { candidateId: candidate.id, expectedRevision: draft?.revision ?? candidate.revision, outcome };
  if (!['accepted', 'edited', 'rejected'].includes(outcome)) throw new Error('검토 결과를 선택해주세요.');
  for (const key of minuteFields) {
    const value = source[key];
    const number = value == null || String(value).trim() === '' ? null : Number(value);
    if (number !== null && (!Number.isFinite(number) || number < 0 || number > 10080)) throw new Error('시간은 0–10080분으로 입력하거나 비워두세요.');
    input[key] = number;
  }
  input.note = source.note || '';
  if (new TextEncoder().encode(input.note).length > 2000) throw new Error('검토 메모를 조금 줄여주세요.');
  return input;
}

// The server hashes JSON strings. Matching every page and the final text keeps
// a changed or incomplete candidate out of the clipboard.
export async function readCompleteCandidate(candidate, { fetchImpl = fetch, onPage = () => {} } = {}) {
  let output = candidate.output || '', offset = candidate.nextOffset ?? null;
  if (typeof candidate.outputHash !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.outputHash)) throw new Error('candidate-hash-unavailable');
  while (offset !== null) {
    const response = await fetchImpl(`/api/hub/ai-assistance?${new URLSearchParams({ candidateId: candidate.id, offset: String(offset), outputHash: candidate.outputHash })}`, { cache: 'no-store' });
    const page = await response.json();
    if (!response.ok || page.status !== 'live' || page.outputHash !== candidate.outputHash || page.offset !== offset || page.candidate?.id !== candidate.id || typeof page.candidate?.output !== 'string'
      || page.nextOffset !== null && (!Number.isInteger(page.nextOffset) || page.nextOffset !== offset + page.candidate.output.length || page.nextOffset <= offset)) throw new Error('candidate-page-changed');
    output += page.candidate.output;
    if (output.length > 24000) throw new Error('candidate-too-large');
    offset = page.nextOffset;
    onPage({ output, nextOffset: offset });
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(output)));
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== candidate.outputHash) throw new Error('candidate-output-changed');
  return output;
}

export async function copyCandidateOutput(candidate, { writeText = text => navigator.clipboard.writeText(text), ...readOptions } = {}) {
  const output = await readCompleteCandidate(candidate, readOptions);
  await writeText(output);
  return output;
}

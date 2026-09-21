import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateJournalInput, isJournalTimestamp, journalNoteHref, journalContextHref } from './journal.js';
const ID = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const save = (extra = {}) => ({ action: 'save', requestId: REQUEST, entryId: ID, expectedRevision: 0, body: '  줄 하나\n\n둘째 🌓  ', title: '', occurredAt: '2026-09-13T12:45:00+09:00', noteMeta: { kind: 'note', enhancement: '' }, contexts: [], ...extra });
const reuse = (extra = {}) => ({ action: 'create_task', requestId: REQUEST, entryId: ID, expectedRevision: 1, selection: { prefix: '앞 🌓 반복 ', text: '반복', suffix: ' 뒤' }, target: { title: '후속 연락', dueAt: null, projectId: null }, ...extra });

test('save preserves whitespace and normalizes only allowlisted command fields', () => {
  const input = save({ workspaceId: 'foreign', source: 'import', noteMeta: { kind: 'idea', enhancement: '  질문의 답\n' }, contexts: [{ type: 'project', id: ID, label: 'untrusted', href: 'https://foreign' }] });
  const result = validateJournalInput(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.body, input.body);
  assert.equal(result.value.occurredAt, input.occurredAt);
  assert.deepEqual(result.value.noteMeta, input.noteMeta);
  assert.deepEqual(result.value.contexts, [{ type: 'project', id: ID }]);
  assert.equal('workspaceId' in result.value, false);
  assert.equal('source' in result.value, false);
});

test('save rejects incomplete, incorrectly typed, blank and oversized values', () => {
  for (const extra of [{ body: '' }, { body: ' \n\t' }, { body: 2 }, { body: 'x'.repeat(20001) }, { title: 'x'.repeat(201) }, { occurredAt: '2026-02-30T00:00:00Z' }, { occurredAt: '2026-09-13' }, { expectedRevision: -1 }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { expectedRevision: '1' }, { requestId: 'invalid' }, { entryId: '' }, { noteMeta: { kind: 'daily_review', enhancement: '' } }, { noteMeta: { kind: 'note', enhancement: 'x'.repeat(4001) } }, { contexts: [{ type: 'task', id: ID }] }, { contexts: [{ type: 'lead', id: 'invalid' }] }, { contexts: Array.from({ length: 21 }, () => ({ type: 'lead', id: ID })) }]) {
    assert.equal(validateJournalInput(save(extra)).ok, false, JSON.stringify(extra).slice(0, 180));
  }
  for (const key of ['body', 'title', 'occurredAt', 'noteMeta', 'contexts', 'requestId', 'entryId', 'expectedRevision']) {
    const input = save(); delete input[key]; assert.equal(validateJournalInput(input).ok, false, key);
  }
});

test('kind and context enums accept the fixed note bundle only', () => {
  for (const kind of ['note', 'conversation', 'idea', 'learning', 'blocked', 'decision']) assert.equal(validateJournalInput(save({ noteMeta: { kind, enhancement: '' } })).ok, true);
  for (const type of ['project', 'lead', 'account', 'brand']) assert.equal(validateJournalInput(save({ contexts: [{ type, id: ID }] })).ok, true);
  assert.equal(validateJournalInput(save({ contexts: [{ type: 'lead', id: ID }, { type: 'lead', id: ID }] })).ok, false);
});

test('reuse preserves exact repeated text and Unicode boundaries and removes supplied metadata', () => {
  const input = reuse();
  const result = validateJournalInput({ ...input, workspaceId: ID, target: { ...input.target, ownerId: ID, meta: { source: 'fake' } } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, input);
  for (const selection of [{ prefix: '', text: '', suffix: '' }, { prefix: '', text: ' \n', suffix: '' }, { prefix: '', text: 'x'.repeat(3501), suffix: '' }, { prefix: '', text: 'x', suffix: null }, { prefix: 'x'.repeat(20000), text: 'x', suffix: '' }]) assert.equal(validateJournalInput(reuse({ selection })).ok, false);
});

test('reuse validates revision, required title, optional dates, project, brand and supported channels', () => {
  for (const extra of [{ expectedRevision: 0 }, { target: { title: '' } }, { target: { title: 'x', dueAt: '2026-09-13' } }, { target: { title: 'x', projectId: 'foreign' } }, { action: 'create_content', target: { title: 'x', brandId: ID, channel: 'email' } }]) {
    assert.equal(validateJournalInput(reuse(extra)).ok, extra.action === 'create_content');
  }
  for (const channel of ['threads', 'x', 'blog', 'instagram', 'reels', 'youtube_shorts', 'email']) {
    assert.equal(validateJournalInput(reuse({ action: 'create_content', target: { title: 'x', brandId: null, channel } })).ok, true);
  }
  assert.equal(validateJournalInput(reuse({ action: 'create_content', target: { title: 'x', channel: 'tiktok' } })).ok, false);
  assert.deepEqual(validateJournalInput(reuse({ action: 'create_content', target: { title: 'x' } })).value.target, { title: 'x', brandId: null, channel: 'threads' });
});

test('timestamps require real ISO dates with timezone and generated links are internal', () => {
  for (const value of ['2026-09-13T12:00:00Z', '2024-02-29T23:59:59.123456+09:00']) assert.equal(isJournalTimestamp(value), true);
  for (const value of ['2026-09-13T24:00:00Z', '2026-09-13T12:00:00', '2026-09-13T12:00:00+99:00', '0000-01-01T00:00:00Z']) assert.equal(isJournalTimestamp(value), false);
  assert.equal(journalNoteHref(ID), `/dashboard/work/memos?note=${ID}`);
  assert.equal(journalContextHref('project', ID), `/dashboard/work/projects?project=${ID}`);
  assert.equal(journalContextHref('lead', 'invalid'), null);
});


test('optional tags normalize Unicode, whitespace and duplicate names without changing note text', () => {
  const input = save({ noteMeta: { kind: 'idea', enhancement: '  보강  ', tags: [' #학습 ', '학습', ' follow   up ', 'FOLLOW UP', 'e\u0301', '', '   '] } });
  const result = validateJournalInput(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.noteMeta, { kind: 'idea', enhancement: '  보강  ', tags: ['학습', 'follow up', 'é'] });
  assert.equal(result.value.body, input.body);
  assert.equal(Object.hasOwn(validateJournalInput(save()).value.noteMeta, 'tags'), false);
  assert.deepEqual(validateJournalInput(save({ noteMeta: { kind: 'note', enhancement: '', tags: [] } })).value.noteMeta.tags, []);
});

test('tags reject invalid types and excessive counts or lengths without truncating', () => {
  for (const tags of [null, 'one', {}, [1], ['x'.repeat(33)], Array.from({ length: 9 }, (_, i) => `tag ${i}`)]) {
    assert.equal(validateJournalInput(save({ noteMeta: { kind: 'note', enhancement: '', tags } })).ok, false, JSON.stringify(tags));
  }
  assert.equal(validateJournalInput(save({ noteMeta: { kind: 'note', enhancement: '', tags: ['🌓'.repeat(32)] } })).ok, true);
});

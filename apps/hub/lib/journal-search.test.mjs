import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeJournalSearch } from './journal-search.js';
const id = 'ABCDEFAB-1234-4234-8234-ABCDEFABCDEF';
test('search normalizes literal text, canonical context and bounded limits', () => {
  const result = normalizeJournalSearch({ q: '  a%_\\*(한글 🌓)  ', contextType: 'project', contextId: id, limit: '3' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.filters, { q: 'a%_\\*(한글 🌓)', dateFrom: '', dateTo: '', kind: '', contextType: 'project', contextId: id.toLowerCase(), used: 'all' });
  assert.equal(result.value.limit, 3);
  assert.equal(normalizeJournalSearch().value.limit, 40);
  assert.equal(normalizeJournalSearch({ q: ` ${'a'.repeat(200)} ` }).ok, true);
});
test('dates use inclusive KST calendar days and next-day exclusive end', () => {
  const { value } = normalizeJournalSearch({ dateFrom: '2026-09-13', dateTo: '2026-09-13' });
  assert.equal(value.dateFromAt, '2026-09-12T15:00:00.000Z');
  assert.equal(value.dateToAt, '2026-09-13T15:00:00.000Z');
  assert.equal(normalizeJournalSearch({ dateFrom: '2024-02-29' }).ok, true);
});
test('invalid filters are explicit errors instead of an unfiltered search', () => {
  for (const input of [null, [], {q: 1}, {q:'x'.repeat(201)}, {dateFrom:'2026-02-30'}, {dateTo:'2026-9-13'}, {dateTo:'0000-01-01'}, {dateFrom:'2026-09-14',dateTo:'2026-09-13'}, {kind:'daily_review'}, {contextType:'project'}, {contextId:id}, {contextType:'task',contextId:id}, {contextType:'project',contextId:'bad'}, {used:'none'}, {limit:4}, {limit:'3x'}, {cursor:42}, {cursor:'a'.repeat(2049)}]) {
    assert.equal(normalizeJournalSearch(input).ok, false, JSON.stringify(input));
  }
});

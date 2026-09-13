import test from 'node:test';
import assert from 'node:assert/strict';
import { filtersFromParams, memoSearchParams, memoListHref, memoDocumentHref, memoPeriod, memoMatchSegments } from './journal-search-client.js';

test('closing and opening documents preserve search but remove document-only state', () => {
  const params = new URLSearchParams('q=첫주&kind=conversation&note=old&from=preview');
  assert.equal(memoListHref(params), '/dashboard/work/memos?q=%EC%B2%AB%EC%A3%BC&kind=conversation');
  assert.equal(new URL(memoDocumentHref(params, { note: 'next' }), 'http://local').searchParams.get('q'), '첫주');
  assert.equal(new URL(memoDocumentHref(params, { new: 'note', draft: 'draft' }), 'http://local').searchParams.has('note'), false);
});
test('search params are explicit and exclude document and untrusted scope', () => {
  const filters = filtersFromParams(new URLSearchParams('q=hello&note=id&workspaceId=bad&used=unused'));
  assert.equal(filters.used, 'unused');
  assert.equal(memoSearchParams(filters).toString(), 'q=hello&used=unused');
});
test('period uses inclusive Korean calendar days at UTC rollover', () => {
  assert.deepEqual(memoPeriod(7, new Date('2026-09-12T15:01:00Z')), { dateFrom: '2026-09-07', dateTo: '2026-09-13' });
  assert.deepEqual(memoPeriod(1, new Date('2026-09-12T14:59:00Z')), { dateFrom: '2026-09-12', dateTo: '2026-09-12' });
});
test('highlight is literal, case-insensitive and preserves original safe text', () => {
  assert.deepEqual(memoMatchSegments('a%_<script>A%_', 'a%_'), [
    { text: 'a%_', match: true }, { text: '<script>', match: false }, { text: 'A%_', match: true },
  ]);
  assert.deepEqual(memoMatchSegments('hello', ''), [{ text: 'hello', match: false }]);
});

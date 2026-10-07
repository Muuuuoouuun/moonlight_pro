import assert from 'node:assert/strict';
import test from 'node:test';
import { researchBriefReadHref, selectedResearchBrief } from './research-inbox-navigation.js';
import { journalMemosFromLegacyHref } from './memo-workspace-links.js';

test('an explicit source ID is retained and never replaced by the first available item', () => {
  const rows = [{ id: 'latest' }, { id: 'old' }];
  assert.equal(selectedResearchBrief(rows, 'missing', null), null);
  assert.equal(selectedResearchBrief(rows, '', null), null);
  assert.equal(selectedResearchBrief(rows, 'old', 'latest'), rows[1]);
  assert.equal(selectedResearchBrief([], 'old', 'latest'), null);
  assert.equal(selectedResearchBrief(rows, null, 'missing'), null);
  assert.equal(selectedResearchBrief(rows, null, null), rows[0]);
  const url = new URL(researchBriefReadHref('old', 'brand-id'), 'https://local.test');
  assert.equal(url.searchParams.get('brief'), 'old');
  assert.equal(url.searchParams.get('brand'), 'brand-id');
  assert.equal(researchBriefReadHref(null), '/api/hub/research/briefs');
});

test('legacy journal navigation preserves the exact project filter and rejects invalid references', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const url = new URL(journalMemosFromLegacyHref(id), 'https://local.test');
  assert.equal(url.pathname, '/dashboard/work/memos');
  assert.equal(url.searchParams.get('contextType'), 'project');
  assert.equal(url.searchParams.get('contextId'), id);
  assert.equal(url.searchParams.has('new'), false);
  assert.equal(journalMemosFromLegacyHref('missing-project'), null);
  assert.equal(journalMemosFromLegacyHref(), '/dashboard/work/memos');
});

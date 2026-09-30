import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFollowUpDraft } from './content-follow-up.js';

const item = { id: 'c1', workspace_id: 'w', title: '아침 루틴', brand_id: 'b1', updated_at: 't', source_idea: '', meta: {} };
const variant = (patch) => ({ id: 'v1', content_id: 'c1', variant_type: 'threads_post', channel: 'threads', body: '첫 줄\n\n둘째', updated_at: 't', ...patch });

test('follow-up quotes the published post and keeps the brand', () => {
  const draft = buildFollowUpDraft({ item, variants: [variant()] }, 'v1');
  assert.equal(draft.title, '후속편 · 아침 루틴');
  assert.equal(draft.brandId, 'b1');
  assert.match(draft.sourceIdea, /\[이전 글\]\n첫 줄\n\n둘째/);
  assert.equal(draft.contentId, null);
  assert.equal(draft.variantType, 'threads_post');
});

test('structured bodies are flattened to text and empty sources give null', () => {
  const body = JSON.stringify({ slides: [{ id: 's1', title: '표지', sub: '핵심' }] });
  assert.match(buildFollowUpDraft({ item, variants: [variant({ variant_type: 'card_news', channel: 'instagram', body })] }, 'v1').sourceIdea, /표지 — 핵심/);
  assert.equal(buildFollowUpDraft({ item, variants: [variant({ body: '  ' })] }, 'v1'), null);
});

test('long sources are clipped', () => {
  const draft = buildFollowUpDraft({ item, variants: [variant({ body: '가'.repeat(5000) })] }, 'v1');
  assert.ok(draft.sourceIdea.length < 3300);
});

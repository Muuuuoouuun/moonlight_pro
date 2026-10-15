import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFollowUpDraft, createFollowUpStarter } from './content-follow-up.js';

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

test('quote clipping keeps Unicode whole at the 3000 UTF-16 boundary', () => {
  for (const beforeEmoji of [2998, 2999]) {
    const body = '가'.repeat(beforeEmoji) + '🙂 이어지는 글';
    assert.equal(body.isWellFormed(), true);
    const source = variant({ body });
    const draft = buildFollowUpDraft({ item, variants: [source] }, source.id);
    const quote = draft.sourceIdea.split('[이전 글]\n')[1].split('\n\n[이어 쓸 방향]')[0];
    assert.equal(draft.sourceIdea.isWellFormed(), true);
    assert.equal(quote, '가'.repeat(beforeEmoji) + (beforeEmoji === 2998 ? '🙂' : '') + '…');
    assert.ok(quote.length <= 3001, 'the quote prefix remains within 3000 UTF-16 units, plus the ellipsis');
  }
});

test('title clipping keeps Unicode whole at the 200 UTF-16 boundary', () => {
  const prefix = '후속편 · ';
  for (const beforeEmoji of [198 - prefix.length, 199 - prefix.length]) {
    const title = '가'.repeat(beforeEmoji) + '🙂끝';
    assert.equal(title.isWellFormed(), true);
    const source = variant({ body: '발행한 본문' });
    const draft = buildFollowUpDraft({ item: { ...item, title }, variants: [source] }, source.id);
    assert.equal(draft.title.isWellFormed(), true);
    assert.equal(draft.title, prefix + '가'.repeat(beforeEmoji) + (prefix.length + beforeEmoji === 198 ? '🙂' : ''));
    assert.ok(draft.title.length <= 200);
  }
});

test('an explicit missing source variant cannot fall back to a different post', () => {
  assert.throws(() => buildFollowUpDraft({ item, variants: [variant()] }, 'missing-variant'), /선택한 결과물을 찾을 수 없습니다/);
});

test('follow-up creation shares concurrent clicks and retries a lost response with the same request and draft', async () => {
  let reads = 0, ids = 0, saves = 0;
  const commands = [];
  let release;
  const firstSave = new Promise((_, reject) => { release = () => reject(new Error('response-lost')); });
  const start = createFollowUpStarter({
    read: async () => { reads += 1; return { status: 'live', item, variants: [variant()] }; },
    requestId: () => `request-${++ids}`,
    save: async (command) => {
      commands.push(command);
      if (++saves === 1) return firstSave;
      return { status: 'duplicate', item: { id: 'follow-up' }, variant: { id: 'follow-up-variant' } };
    },
  });
  const row = { contentId: item.id, variantId: 'v1' };
  const first = start(row), repeated = start(row);
  assert.equal(first, repeated, 'same-tick clicks share one read and write');
  await Promise.resolve();
  release();
  await assert.rejects(first, /response-lost/);
  const saved = await start(row);
  assert.equal(saved.status, 'duplicate');
  assert.equal(reads, 1, 'retry must not rebuild its source snapshot');
  assert.equal(ids, 1, 'the uncertain save retains its request ID');
  assert.equal(saves, 2);
  assert.deepEqual(commands[1], commands[0]);
  assert.equal(commands[0].contentId, null);
  assert.equal(commands[0].variantId, null);
  assert.equal(commands[0].item.brandId, item.brand_id);
  assert.equal(await start(row), saved, 'a repeat while navigation finishes reopens the created draft');
  assert.equal(saves, 2, 'a confirmed follow-up is not created a second time');
});

test('a follow-up read error envelope or missing variant never creates a draft', async () => {
  for (const detail of [
    { status: 'error', item, variants: [variant()] },
    { status: 'live', item, variants: [variant({ id: 'another-variant' })] },
  ]) {
    let saves = 0;
    const start = createFollowUpStarter({
      read: async () => detail,
      requestId: () => 'request',
      save: async () => { saves += 1; },
    });
    await assert.rejects(start({ contentId: item.id, variantId: 'v1' }));
    assert.equal(saves, 0);
  }
});

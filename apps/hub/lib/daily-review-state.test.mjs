import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankReviewDraft, reviewToDraft, prepareReviewSave, resolveReviewSave,
  reconcileReviewDraft, readReviewDraftCache,
  createReviewDraftStore,
} from './daily-review-state.js';

const date = '2026-09-12';
const review = { id: 'review-1', reviewDate: date, timezone: 'Asia/Seoul', energy: 2, focus: '개요 작성', progress: 0, note: '', revision: 1, updatedAt: '2026-09-12T10:00:00Z' };

test('blank and saved drafts preserve missing answers, zero, and no-target separately', () => {
  assert.equal(blankReviewDraft(date).energy, null);
  assert.equal(reviewToDraft(review).progress, 0);
  assert.equal(reviewToDraft({ ...review, progress: 'not_applicable' }).progress, 'not_applicable');
  assert.equal(reviewToDraft(review).expectedRevision, 1);
});

test('a storage quota failure never makes an older persisted draft replace the newest input', () => {
  let raw = null;
  let blocked = false;
  const store = createReviewDraftStore({
    getItem: () => raw,
    setItem: (_key, value) => { if (blocked) throw new Error('quota'); raw = value; },
    removeItem: () => { if (blocked) throw new Error('blocked'); raw = null; },
  });
  store.write(date, { draft: { ...reviewToDraft(review), note: '이전 입력' }, attempt: null });
  blocked = true;
  store.write(date, { draft: { ...reviewToDraft(review), note: '최신 입력' }, attempt: null });
  assert.equal(store.read(date).draft.note, '최신 입력');
  store.write(date, null);
  assert.equal(store.read(date), null, 'an uncleared storage copy must not resurrect a saved draft');
});

test('every unsaved date retains an unload guard until saved, including successfully cached drafts', () => {
  const pending = [];
  let blocked = true;
  const store = createReviewDraftStore({
    getItem: () => null,
    setItem: () => { if (blocked) throw new Error('quota'); },
    removeItem: () => {},
  }, { onPendingChange: (value) => pending.push(value) });
  store.write(date, { draft: reviewToDraft(review), attempt: null });
  store.write('2026-09-11', null);
  assert.deepEqual(pending, [true, true], 'opening an empty day cannot remove another date’s protection');
  blocked = false;
  store.write(date, { draft: reviewToDraft(review), attempt: null });
  assert.equal(pending.at(-1), true, 'sessionStorage is lost when a tab closes');
  store.write(date, null);
  assert.equal(pending.at(-1), false);
});

test('a fresh app restores unload protection for drafts on dates that are not currently open', () => {
  const pending = [];
  const store = createReviewDraftStore({
    keys: () => ['unrelated', `moonlight:daily-review:v1:${date}`],
    getItem: () => JSON.stringify({ version: 1, draft: reviewToDraft(review), attempt: null }),
    setItem: () => {}, removeItem: () => {},
  }, { onPendingChange: (value) => pending.push(value) });
  store.restore();
  assert.equal(pending.at(-1), true);
  store.write(date, null);
  store.restore();
  assert.equal(pending.at(-1), false, 'a stale storage entry cannot revive a cleared in-tab draft');
});

test('an unchanged failed submission reuses its key; edited intent gets a new key', () => {
  const draft = reviewToDraft(review);
  const first = prepareReviewSave(draft, null, 'first');
  assert.equal(prepareReviewSave(draft, first, 'second').requestId, 'first');
  assert.equal(prepareReviewSave({ ...draft, note: '새 메모' }, first, 'second').requestId, 'second');
  assert.equal(prepareReviewSave({ ...draft, expectedRevision: 2 }, first, 'third').requestId, 'third');
});

test('only a durable acknowledgement for the requested date clears the draft', () => {
  assert.equal(resolveReviewSave({ responseOk: true, data: { status: 'duplicate', review }, date }).state, 'saved');
  assert.equal(resolveReviewSave({ responseOk: true, data: { status: 'preview', review }, date }).state, 'error');
  assert.equal(resolveReviewSave({ responseOk: true, data: { status: 'saved', review: { ...review, revision: 0 } }, date }).state, 'error');
  assert.equal(resolveReviewSave({ responseOk: true, data: { status: 'saved', review: { ...review, reviewDate: '2026-09-11' } }, date }).state, 'error');
  assert.equal(resolveReviewSave({ responseOk: false, data: { status: 'saved', review }, date }).state, 'error');
});

test('a stale save returns the current record for comparison without replacing local input', () => {
  const result = resolveReviewSave({ responseOk: false, data: { status: 'conflict', review }, date });
  assert.equal(result.state, 'conflict');
  assert.deepEqual(result.review, review);
  assert.equal(resolveReviewSave({ responseOk: false, data: { status: 'conflict', review: null }, date }).state, 'error');
});

test('loading another revision preserves a recovered draft and surfaces a conflict', () => {
  const cached = { draft: { ...reviewToDraft(review), note: '내 미저장 메모' }, attempt: null };
  const result = reconcileReviewDraft(date, { ...review, revision: 2, note: '다른 창의 메모' }, cached);
  assert.equal(result.draft.note, '내 미저장 메모');
  assert.equal(result.draft.expectedRevision, 1);
  assert.equal(result.conflict.revision, 2);
  assert.equal(result.recovered, true);
});

test('a lost response followed by reload recognises the already saved content', () => {
  const cached = { draft: { ...reviewToDraft(review), expectedRevision: 0 }, attempt: { requestId: 'original' } };
  const result = reconcileReviewDraft(date, review, cached);
  assert.equal(result.draft.expectedRevision, 1);
  assert.equal(result.recovered, false);
  assert.equal(result.attempt, null);
});

test('draft recovery rejects corrupt, different-day and unknown-version caches', () => {
  const good = JSON.stringify({ version: 1, draft: reviewToDraft(review), attempt: null });
  assert.equal(readReviewDraftCache(good, date).draft.progress, 0);
  assert.equal(readReviewDraftCache('{broken', date), null);
  assert.equal(readReviewDraftCache(good, '2026-09-11'), null);
  assert.equal(readReviewDraftCache(good.replace('"version":1', '"version":2'), date), null);
  assert.equal(readReviewDraftCache(good.replace('"energy":2', '"energy":99'), date), null);
});

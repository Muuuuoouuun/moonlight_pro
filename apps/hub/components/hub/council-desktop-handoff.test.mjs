import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COUNCIL_HANDOFF_PREFIX, COUNCIL_HANDOFF_DRAFT_LIMIT, COUNCIL_HANDOFF_FRAGMENT_LIMIT,
  parseCouncilDesktopHandoff, encodeCouncilDesktopHandoff, consumeCouncilDesktopHandoff,
  isCouncilHandoffLoginTarget, councilHandoffLoginPath, createCouncilDraftState, reduceCouncilDraft,
} from './council-desktop-handoff.js';

const payload = (draft = '검토할 메모\n다음 단계 🌓', kind = 'memo') => ({ version: 1, draft, source: { kind } });
const fragment = value => COUNCIL_HANDOFF_PREFIX + Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

test('UTF-8 handoff preserves the reviewed text and supported source kinds', () => {
  for (const kind of ['memo', 'task', 'text']) {
    const original = payload('  입력한 안건\n😀  ', kind);
    assert.deepEqual(parseCouncilDesktopHandoff(fragment(original)), { ok: true, payload: original });
    assert.equal(encodeCouncilDesktopHandoff(original), fragment(original));
  }
});

test('unknown fragment does not become a desktop request', () => {
  for (const hash of ['', '#section', '#moonlight-council-help', '#other=abc']) assert.equal(parseCouncilDesktopHandoff(hash), null);
});

test('size boundaries use UTF-16 like Swift draft and reject rather than truncate', () => {
  assert.equal(COUNCIL_HANDOFF_DRAFT_LIMIT, 4000);
  assert.equal(COUNCIL_HANDOFF_FRAGMENT_LIMIT, 24000);
  assert.equal(parseCouncilDesktopHandoff(fragment(payload('가'.repeat(4000)))).ok, true);
  assert.equal(parseCouncilDesktopHandoff(fragment(payload('😀'.repeat(2000)))).ok, true);
  for (const draft of ['가'.repeat(4001), '😀'.repeat(2001), '', ' \n\t']) assert.equal(parseCouncilDesktopHandoff(fragment(payload(draft))).ok, false);
  assert.equal(parseCouncilDesktopHandoff(COUNCIL_HANDOFF_PREFIX + 'a'.repeat(24000)).ok, false);
});

test('rejects malformed base64, UTF-8, JSON and unexpected fields', () => {
  for (const hash of [COUNCIL_HANDOFF_PREFIX, '#moonlight-council', COUNCIL_HANDOFF_PREFIX + '%ZZ',
    COUNCIL_HANDOFF_PREFIX + 'A', COUNCIL_HANDOFF_PREFIX + Buffer.from([0xff]).toString('base64url'),
    COUNCIL_HANDOFF_PREFIX + Buffer.from('not json').toString('base64url')]) {
    assert.equal(parseCouncilDesktopHandoff(hash).ok, false);
  }
  for (const value of [null, [], { ...payload(), version: 2 }, { ...payload(), draft: 1 },
    { ...payload(), source: null }, { ...payload(), source: { kind: 'unknown' } },
    { ...payload(), source: { kind: 'memo', id: 'secret' } }, { ...payload(), autoRun: true },
    { ...payload(), draft: '\ud800' }]) assert.equal(parseCouncilDesktopHandoff(fragment(value)).ok, false);
});

test('consumes only own fragment and removes even malformed or oversized payload before parsing', () => {
  for (const hash of [fragment(payload()), COUNCIL_HANDOFF_PREFIX + '%bad', COUNCIL_HANDOFF_PREFIX + 'a'.repeat(24000)]) {
    const browser = { location: { hash, pathname: '/dashboard/agents/council', search: '?view=notes' },
      history: { state: { __NA: true }, replaceState(state, unused, url) {
        assert.deepEqual(state, { __NA: true }); assert.equal(url, '/dashboard/agents/council?view=notes');
        browser.location.hash = '';
      } } };
    assert.notEqual(consumeCouncilDesktopHandoff(browser), null);
    assert.equal(browser.location.hash, '');
    assert.equal(consumeCouncilDesktopHandoff(browser), null); // StrictMode's second setup
  }
  const untouched = { location: { hash: '#section' }, history: { replaceState() { assert.fail('unrelated hash'); } } };
  assert.equal(consumeCouncilDesktopHandoff(untouched), null);
});

test('failed address cleanup does not accept an invisible retained sensitive handoff', () => {
  const result = consumeCouncilDesktopHandoff({ location: { hash: fragment(payload()), pathname: '/', search: '' },
    history: { replaceState() { throw new Error('unavailable'); } } });
  assert.equal(result.ok, false);
  assert.equal(result.payload, undefined);
});

test('new handoff fills an empty draft but never overwrites existing text', () => {
  let state = reduceCouncilDraft(createCouncilDraftState(), { type: 'receive', payload: payload('첫 안건') });
  assert.equal(state.draft, '첫 안건'); assert.deepEqual(state.source, { kind: 'memo' });
  state = reduceCouncilDraft(state, { type: 'edit', draft: '직접 수정한 내용' });
  state = reduceCouncilDraft(state, { type: 'receive', payload: payload('두 번째', 'task') });
  assert.equal(state.draft, '직접 수정한 내용'); assert.equal(state.pending.length, 1);
  state = reduceCouncilDraft(state, { type: 'append' });
  assert.equal(state.draft, '직접 수정한 내용\n\n두 번째'); assert.equal(state.pending.length, 0);
});

test('multiple hashchanges queue independently and duplicate setup does not reset the draft', () => {
  let state = reduceCouncilDraft(createCouncilDraftState(), { type: 'receive', payload: payload('첫 안건') });
  state = reduceCouncilDraft(state, { type: 'receive', payload: payload('두 번째') });
  state = reduceCouncilDraft(state, { type: 'receive', payload: payload('세 번째') });
  state = reduceCouncilDraft(state, { type: 'receive', payload: payload('두 번째') });
  assert.deepEqual(state.pending.map(x => x.draft), ['두 번째', '세 번째']);
  state = reduceCouncilDraft(state, { type: 'dismiss' });
  assert.equal(state.draft, '첫 안건'); assert.deepEqual(state.pending.map(x => x.draft), ['세 번째']);
});

test('append overflow retains both drafts and works after explicit editing', () => {
  let state = reduceCouncilDraft(createCouncilDraftState(), { type: 'edit', draft: '가'.repeat(4000) });
  state = reduceCouncilDraft(state, { type: 'receive', payload: payload('나') });
  state = reduceCouncilDraft(state, { type: 'append' });
  assert.equal(state.draft.length, 4000); assert.equal(state.pending[0].draft, '나'); assert.ok(state.error);
  state = reduceCouncilDraft(state, { type: 'edit', draft: '' });
  state = reduceCouncilDraft(state, { type: 'append' });
  assert.equal(state.draft, '나'); assert.equal(state.pending.length, 0);
});

test('login bridge permits only same-origin exact Council destination with no extra query or hash', () => {
  const origin = 'https://hub.example.test';
  for (const next of ['/dashboard/agents/council', origin + '/dashboard/agents/council']) {
    assert.equal(isCouncilHandoffLoginTarget(next, origin), true);
    assert.equal(councilHandoffLoginPath(next, origin, payload()), '/dashboard/agents/council' + fragment(payload()));
  }
  for (const next of ['https://other.example.test/dashboard/agents/council', '/dashboard/agents/chat?prompt=council',
    '/dashboard/agents/council?mode=sparring', '/dashboard/agents/council#old', '/dashboard',
    'javascript:alert(1)', 'https://user:password@hub.example.test/dashboard/agents/council']) {
    assert.equal(isCouncilHandoffLoginTarget(next, origin), false);
    assert.equal(councilHandoffLoginPath(next, origin, payload()), null);
  }
  assert.equal(councilHandoffLoginPath('/dashboard/agents/council', origin, null), null);
});

test('login bridge rejects encoded overflow even when the draft fits the UTF-16 limit', () => {
  // JSON escapes these code units; the encoded URL can exceed the limit before 4,000 characters.
  const original = payload('\u0000'.repeat(COUNCIL_HANDOFF_DRAFT_LIMIT));
  assert.ok(fragment(original).length > COUNCIL_HANDOFF_FRAGMENT_LIMIT);
  assert.throws(() => encodeCouncilDesktopHandoff(original), RangeError);
  assert.equal(councilHandoffLoginPath('/dashboard/agents/council', 'https://hub.example.test', original), null);
  let state = reduceCouncilDraft(createCouncilDraftState(), { type: 'receive', payload: original });
  state = reduceCouncilDraft(state, { type: 'error', error: '안건을 줄여 주세요.' });
  assert.equal(state.draft, original.draft);
  state = reduceCouncilDraft(state, { type: 'edit', draft: '수정한 안건' });
  assert.equal(councilHandoffLoginPath('/dashboard/agents/council', 'https://hub.example.test',
    { version: 1, draft: state.draft, source: state.source }), '/dashboard/agents/council' + fragment(payload('수정한 안건')));
});

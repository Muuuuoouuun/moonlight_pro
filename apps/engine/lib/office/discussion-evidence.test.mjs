import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOfficePeerCatalog, officePeerReviewSchema, readOfficePeerReviews, officeResolutionSchema, readOfficeResolutions } from './discussion-evidence.ts';

const participants = ['flareon', 'umbreon', 'sylveon'];
const positions = participants.map(ownerId => ({ ownerId, round: 'position', position: `${ownerId}: 원문에서 확인한 내용입니다.`, objection: '제공 범위는 미확인입니다.', revisionCondition: '공식 안내가 바뀌면 다시 봅니다.' }));
const review = index => ({ quoteIndex: index, assessment: 'needs_evidence', reason: '제공 범위의 근거가 필요합니다.' });
const refs = [{ turnRef: 'position:flareon', objection: '원문과 비교해야 합니다.' }, { turnRef: 'response:flareon', objection: '같은 수치를 확인해야 합니다.' }];

test('a peer selects an exact source excerpt without retyping or inventing attribution', () => {
  const catalog = buildOfficePeerCatalog(positions, 'sylveon');
  const entry = catalog.find(item => item.ownerId === 'flareon' && item.field === 'position');
  const result = readOfficePeerReviews({ position: '본인 의견', peerReviewsByOwner: { flareon: review(entry.index), umbreon: null } }, participants, 'sylveon', catalog);
  assert.deepEqual(result, { position: '본인 의견', peerReviews: [{ ownerId: 'flareon', field: 'position', quote: positions[0].position, assessment: 'needs_evidence', reason: '제공 범위의 근거가 필요합니다.' }], replyTo: ['flareon'] });
  const schema = officePeerReviewSchema(participants, 'sylveon', catalog);
  assert.deepEqual(schema.required, ['flareon', 'umbreon']);
  assert.deepEqual(schema.properties.flareon.properties.quoteIndex.enum, catalog.filter(item => item.ownerId === 'flareon').map(item => item.index));
});

test('required reviewer, source owner and server attribution cannot be bypassed', () => {
  const catalog = buildOfficePeerCatalog(positions, 'sylveon');
  const f = catalog.find(item => item.ownerId === 'flareon').index;
  const u = catalog.find(item => item.ownerId === 'umbreon').index;
  for (const input of [
    { peerReviewsByOwner: { flareon: null, umbreon: review(u) } },
    { peerReviewsByOwner: { flareon: review(u), umbreon: null } },
    { peerReviewsByOwner: { flareon: review(-1), umbreon: null } },
    { peerReviewsByOwner: { flareon: review(999), umbreon: null } },
    { peerReviewsByOwner: { flareon: { ...review(f), quote: '새로 쓴 문장' }, umbreon: null } },
    { peerReviewsByOwner: { flareon: review(f) } },
    { peerReviewsByOwner: { flareon: review(f), umbreon: null, sylveon: null } },
    { peerReviewsByOwner: { flareon: review(f), umbreon: null }, peerReviews: [] },
    { peerReviewsByOwner: { flareon: review(f), umbreon: null }, replyTo: ['umbreon'] },
  ]) assert.throws(() => readOfficePeerReviews(input, participants, 'sylveon', catalog));
});

test('optional second peer is preserved after the mandatory peer in server order', () => {
  const catalog = buildOfficePeerCatalog(positions, 'flareon');
  const f = owner => catalog.find(item => item.ownerId === owner).index;
  const result = readOfficePeerReviews({ peerReviewsByOwner: { sylveon: review(f('sylveon')), umbreon: review(f('umbreon')) } }, participants, 'flareon', catalog);
  assert.deepEqual(result.replyTo, ['umbreon', 'sylveon']);
  assert.equal(result.peerReviews.length, 2);
});

test('long Korean and astral excerpts remain exact, bounded and unnormalized', () => {
  const text = '가'.repeat(399) + '😀' + '나'.repeat(199);
  const catalog = buildOfficePeerCatalog([{ ...positions[0], position: text, objection: '', revisionCondition: '유지' }], 'sylveon');
  const pieces = catalog.filter(item => item.field === 'position').map(item => item.quote);
  assert.equal(pieces.join(''), text);
  assert.ok(pieces.every(piece => piece.length <= 400 && text.includes(piece) && piece.isWellFormed()));
  assert.ok(catalog.every(item => item.quote.trim()));
});

test('each objection is a required keyed decision, materialized once in server order', () => {
  const schema = officeResolutionSchema(refs);
  assert.deepEqual(schema.required, refs.map(turn => turn.turnRef));
  const value = { 'response:flareon': { disposition: 'open', rationale: '아직 미확인입니다.' }, 'position:flareon': { disposition: 'addressed', rationale: '표현을 삭제했습니다.' } };
  assert.deepEqual(readOfficeResolutions(value, refs), refs.map(turn => ({ turnRef: turn.turnRef, ...value[turn.turnRef] })));
  for (const bad of [[], { 'position:flareon': value['position:flareon'] }, { ...value, 'position:eevee': value['position:flareon'] }, { ...value, 'response:flareon': { ...value['response:flareon'], turnRef: 'position:flareon' } }]) assert.throws(() => readOfficeResolutions(bad, refs));
  assert.deepEqual(readOfficeResolutions({}, []), []);
});

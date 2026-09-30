import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResearchCommand } from './research-inbox-contract.js';

const uuid = '11111111-1111-4111-8111-111111111111';
const brief = {
  brandId: uuid,
  title: '새 발표의 적용 범위',
  change: '공식 발표에서 적용 대상이 좁혀졌다.',
  whyBrand: '독자의 의사결정과 직접 관련된다.',
  facts: ['공식 문서에 대상과 시점이 명시됐다.'],
  interpretation: '대상 밖의 기관에는 바로 적용되지 않는다.',
  unknown: '추가 시행 안내',
  draft: '발표된 범위와 아직 확인할 조건을 나눠 봅니다.',
  sources: [{ url: 'https://example.org/notice?utm_source=test', title: '공식 안내', accessLevel: 'full-text' }],
};

test('create accepts a bounded source-backed operator brief and strips tracking parameters', () => {
  const result = normalizeResearchCommand({ action: 'create', requestId: uuid, brief });
  assert.equal(result.action, 'create');
  assert.equal(result.brief.sources[0].url, 'https://example.org/notice');
  assert.match(result.brief.eventKey, /^[a-f0-9]{40}$/);
  assert.equal(result.brief.facts.length, 1);
});

test('create rejects snippet-only evidence and private source URLs', () => {
  assert.equal(normalizeResearchCommand({ action: 'create', requestId: uuid, brief: { ...brief, sources: [{ url: 'http://127.0.0.1/private', title: 'local', accessLevel: 'full-text' }] } }), null);
  assert.equal(normalizeResearchCommand({ action: 'create', requestId: uuid, brief: { ...brief, sources: [{ url: 'https://example.org/notice', title: '검색 발췌', accessLevel: 'snippet' }] } }), null);
});

test('review commands require an exact brief revision and stable request ID', () => {
  assert.deepEqual(normalizeResearchCommand({ action: 'promote-draft', requestId: uuid, briefId: uuid, expectedRevision: 2, expectedStateVersion: 3 }), {
    action: 'promote-draft', requestId: uuid, briefId: uuid, expectedRevision: 2, expectedStateVersion: 3,
  });
  assert.equal(normalizeResearchCommand({ action: 'promote-draft', requestId: uuid, briefId: uuid, expectedRevision: 0 }), null);
  assert.equal(normalizeResearchCommand({ action: 'defer', requestId: uuid, briefId: uuid, expectedRevision: 1 }), null);
  assert.equal(normalizeResearchCommand({ action: 'discard', requestId: 'bad', briefId: uuid, expectedRevision: 1 }), null);
});

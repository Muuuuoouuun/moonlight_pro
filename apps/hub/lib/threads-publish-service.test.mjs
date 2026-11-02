import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThreadsPublishCommand, publicThreadsJob, runThreadsPublish, sha256 } from './threads-publish-service.js';
import { verifiedThreadsPost } from './threads-text-adapter.js';

const ws = '00000000-0000-4000-8000-000000000001';
const ids = { requestId: '10000000-0000-4000-8000-000000000001', variantId: '20000000-0000-4000-8000-000000000001',
  contentId: '30000000-0000-4000-8000-000000000001', brandId: '40000000-0000-4000-8000-000000000001' };
const BODY = '첫 글\n\n둘째 글';
const command = (extra = {}) => ({ action: 'publish', ...ids, bodyHash: sha256(BODY), confirmPublish: true, ...extra });
const source = (body = BODY, extra = {}) => async () => ({ ok: true, variant: { id: ids.variantId, body, status: 'draft', ...extra },
  item: { id: ids.contentId, brand_id: ids.brandId }, brand: { id: ids.brandId, slug: 'classmoon', status: 'active' } });
const credential = async () => ({ ok: true, accessToken: 'token', accountId: '123', appKey: 'classmoon', username: 'moon.classin' });

// RPC 상태기계의 요지만 흉내 낸다 — 실제 전이 규칙은 0073 SQL이 소유한다.
function fakeRepo() {
  const calls = [];
  let job = null;
  const out = () => ({ ...job });
  return {
    calls, get job() { return job; },
    async command(action, input) {
      calls.push([action, input.state || input.reason || null]);
      if (action === 'prepare') { job = { id: '50000000-0000-4000-8000-000000000001', state: 'prepared', version: 1, step: 0, postIds: [], accountId: input.accountId, posts: input.posts }; return { status: 'saved', job: out() }; }
      if (action === 'claim') { job = { ...job, state: 'claimed', version: job.version + 1 }; return { status: 'claimed', job: out(), leaseToken: 'lease', leaseRemainingMs: 90000 }; }
      if (action === 'abandon') { job = { ...job, state: 'abandoned', abandonReason: input.reason, version: job.version + 1 }; return { status: 'saved', job: out() }; }
      if (action === 'advance') {
        if (input.expectedVersion !== job.version) return { status: 'conflict', job: out() };
        const next = { ...job, state: input.state, version: job.version + 1 };
        if (job.state === 'post_recorded' && input.state === 'creating') next.step += 1;
        if (input.postId) next.postIds = [...job.postIds, input.postId];
        if (input.permalink) next.permalink = input.permalink;
        job = next; return { status: 'saved', job: out() };
      }
      throw Error('unexpected');
    },
  };
}
function fakeAdapter({ failPublishAt = null, failContainerAt = null, text = null } = {}) {
  const log = [];
  let containers = 0, published = 0;
  return {
    log,
    factory: () => ({
      async profile() { return { id: '123', username: 'moon.classin' }; },
      async createContainer(body, { replyToId, beforeSend }) { beforeSend(); log.push(['container', body, replyToId]); containers += 1; return String(700 + containers); },
      async container(id) { return { id, status: failContainerAt === containers ? 'ERROR' : 'FINISHED' }; },
      async publish(id, { beforeSend }) {
        beforeSend(); published += 1; log.push(['publish', id]);
        if (failPublishAt === published) throw Error('provider-effect-unconfirmed');
        return String(900 + published);
      },
      async post(id) { return { id, username: 'moon.classin', ownerId: '123', body: text ?? '첫 글', permalink: 'https://www.threads.net/@moon.classin/post/AbC_1?x=1' }; },
    }),
  };
}
const run = (repo, adapter, extra = {}) => runThreadsPublish(command(extra.command), { workspaceId: ws, enabled: true, repo, readSource: extra.readSource || source(),
  readCredential: extra.readCredential || credential, adapterFactory: adapter.factory, sleep: async () => {} });

test('a connected brand posts the thread chain in order, replying to the previous post, then verifies', async () => {
  const repo = fakeRepo(), adapter = fakeAdapter();
  const result = await run(repo, adapter);
  assert.equal(result.status, 'verified');
  assert.deepEqual(adapter.log.filter(([kind]) => kind === 'container').map(([, body, reply]) => [body, reply]), [['첫 글', null], ['둘째 글', '901']]);
  assert.deepEqual(repo.calls.map(([action, state]) => state || action), ['prepare', 'claim', 'creating', 'container_ready', 'publish_requested',
    'post_recorded', 'creating', 'container_ready', 'publish_requested', 'post_recorded', 'verified']);
  assert.equal(repo.job.permalink, 'https://www.threads.net/@moon.classin/post/AbC_1');
  assert.equal(result.job.accountId, undefined, 'account ID stays on the server');
});

test('a lost publish response is never retried — the job stops at 확인 필요', async () => {
  const repo = fakeRepo(), adapter = fakeAdapter({ failPublishAt: 1 });
  const result = await run(repo, adapter);
  assert.equal(result.status, 'ambiguous'); assert.equal(repo.job.state, 'ambiguous');
  assert.equal(adapter.log.filter(([kind]) => kind === 'publish').length, 1);
});

test('a failure before the first publish request leaves nothing public and frees the result for another try', async () => {
  const repo = fakeRepo(), adapter = fakeAdapter({ failContainerAt: 1 });
  const result = await run(repo, adapter);
  assert.equal(result.status, 'failed'); assert.equal(repo.job.state, 'abandoned'); assert.equal(repo.job.abandonReason, 'not-posted');
  assert.equal(adapter.log.filter(([kind]) => kind === 'publish').length, 0);
});

test('a later post failing keeps the earlier posts on record as a partial 확인 필요', async () => {
  const repo = fakeRepo(), adapter = fakeAdapter({ failPublishAt: 2 });
  const result = await run(repo, adapter);
  assert.equal(result.status, 'ambiguous'); assert.equal(result.reason, 'partial'); assert.equal(result.postedCount, 1);
  assert.equal(repo.job.state, 'ambiguous');
});

test('checks before sending create no job: stale body, over-limit, account mismatch, missing connection, switch off', async () => {
  const cases = [
    [{ readSource: source('고친 본문') }, 'stale-body'],
    [{ readSource: source('가'.repeat(501)), command: { bodyHash: sha256('가'.repeat(501)) } }, 'over-limit'],
    [{ readSource: source(BODY, { status: 'published' }) }, 'already-published'],
    [{ readCredential: async () => ({ ok: false, reason: 'not-connected' }) }, 'not-connected'],
  ];
  for (const [extra, reason] of cases) {
    const repo = fakeRepo();
    const result = await run(repo, fakeAdapter(), extra);
    assert.equal(result.status, 'blocked'); assert.equal(result.reason, reason); assert.equal(repo.calls.length, 0, reason);
  }
  const repo = fakeRepo(), adapter = fakeAdapter();
  const wrong = { ...adapter, factory: () => ({ ...adapter.factory(), profile: async () => ({ id: '999', username: 'someone' }) }) };
  assert.equal((await run(repo, wrong)).reason, 'account-mismatch'); assert.equal(repo.calls.length, 0);
  const off = await runThreadsPublish(command(), { workspaceId: ws, enabled: false, repo: fakeRepo() });
  assert.equal(off.status, 'disabled');
});

test('verification fails closed when the provider shows another account or text', async () => {
  const repo = fakeRepo();
  const result = await run(repo, fakeAdapter({ text: '다른 글' }));
  assert.equal(result.status, 'ambiguous'); assert.equal(result.reason, 'verification-unconfirmed');
  assert.equal(verifiedThreadsPost({ id: '1', username: 'moon.classin', ownerId: '123', body: 'x', permalink: 'https://evil.com/@moon.classin/post/a' },
    { postId: '1', accountId: '123', username: 'moon.classin', text: 'x' }), null);
});

test('commands accept only the confirmed publish shape and the two operator resolutions', () => {
  assert.ok(normalizeThreadsPublishCommand(command()));
  assert.equal(normalizeThreadsPublishCommand(command({ confirmPublish: false })), null);
  assert.equal(normalizeThreadsPublishCommand({ ...command(), posts: ['x'] }), null, 'the server reads the body itself');
  assert.ok(normalizeThreadsPublishCommand({ action: 'abandon', jobId: ids.requestId, reason: 'posted-manually' }));
  assert.equal(normalizeThreadsPublishCommand({ action: 'abandon', jobId: ids.requestId, reason: 'cancelled-before-send' }), null);
  assert.deepEqual(Object.keys(publicThreadsJob({ id: 'x', accountId: '1', containerId: '2', leaseToken: '3' })).filter((key) => ['accountId', 'containerId', 'leaseToken'].includes(key)), []);
});

test('a job left at prepared by an earlier attempt is cleared before sending, then prepared again', async () => {
  const repo = fakeRepo();
  const original = repo.command.bind(repo);
  let first = true;
  repo.command = async (action, input) => {
    if (action === 'prepare' && first) { first = false; repo.calls.push(['prepare', null]); return { status: 'busy', job: { id: 'stale', state: 'prepared' } }; }
    if (action === 'abandon' && input.jobId === 'stale') { repo.calls.push(['abandon', input.reason]); return { status: 'saved', job: { id: 'stale', state: 'abandoned' } }; }
    return original(action, input);
  };
  const result = await run(repo, fakeAdapter());
  assert.equal(result.status, 'verified');
  assert.deepEqual(repo.calls.slice(0, 3), [['prepare', null], ['abandon', 'cancelled-before-send'], ['prepare', null]]);
});

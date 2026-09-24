import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeetingReviewWatchlistService } from './meeting-review-watchlist.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const proposalId = '33333333-3333-4333-8333-333333333333';
const item = { proposalId, entryId, title: '고객 검토 결과 확인', checkAt: '2026-09-30',
  method: '고객에게 진행 상태를 묻기', stepCount: 2,
  href: `/dashboard/work/memos?note=${entryId}`, reviewedAt: '2026-09-23T11:20:30.123456+00:00' };
const configured = { configured: () => true, workspaceId: () => workspaceId };

test('watchlist reads only the server workspace at a fixed 20-item bound and whitelists output', async () => {
  const calls = [];
  const get = createMeetingReviewWatchlistService({ ...configured, rpc: async (name, args) => {
    calls.push([name, args]);
    return { ok: true, data: { status: 'live', items: [{ ...item, sourceBody: 'private transcript', requestPayload: 'private' }], hasMore: true } };
  } });
  const result = await get({ workspaceId: '99999999-9999-4999-8999-999999999999', limit: 999 });
  assert.deepEqual(calls, [['meeting_review_watchlist_v1', { p_workspace_id: workspaceId, p_limit: 20 }]]);
  assert.deepEqual(result, { status: 'live', items: [item], hasMore: true });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('watchlist preview makes no unscoped request', async () => {
  let calls = 0;
  const rpc = async () => { calls++; throw Error('must not call'); };
  assert.deepEqual(await createMeetingReviewWatchlistService({ ...configured, configured: () => false, rpc })(),
    { status: 'preview', items: [], hasMore: false });
  assert.deepEqual(await createMeetingReviewWatchlistService({ ...configured, workspaceId: () => null, rpc })(),
    { status: 'preview', items: [], hasMore: false });
  assert.equal(calls, 0);
});

test('watchlist rejects malformed, duplicate, oversized or unsafe RPC results with an error envelope', async () => {
  const cases = [
    null,
    { status: 'error', items: [], hasMore: false },
    { items: [], hasMore: 'false' },
    { status: 'live', items: [], hasMore: 'false' },
    { status: 'live', items: Array.from({ length: 21 }, () => item), hasMore: true },
    { status: 'live', items: [item, item], hasMore: false },
    { status: 'live', items: [{ ...item, proposalId: 'foreign' }], hasMore: false },
    { status: 'live', items: [{ ...item, checkAt: '2026-02-30' }], hasMore: false },
    { status: 'live', items: [{ ...item, stepCount: 51 }], hasMore: false },
    { status: 'live', items: [{ ...item, reviewedAt: 'yesterday' }], hasMore: false },
    { status: 'live', items: [{ ...item, href: 'https://foreign.invalid' }], hasMore: false },
    { status: 'live', items: [{ ...item, title: '' }], hasMore: false },
  ];
  for (const data of cases) {
    const result = await createMeetingReviewWatchlistService({ ...configured, rpc: async () => ({ ok: true, data }) })();
    assert.equal(result.status, 'error');
    assert.deepEqual(result.items, []);
    assert.equal(result.hasMore, false);
  }
  for (const rpc of [async () => ({ ok: false, data: { error: 'private secret' } }), async () => { throw Error('private secret'); }]) {
    const result = await createMeetingReviewWatchlistService({ ...configured, rpc })();
    assert.equal(result.status, 'error');
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

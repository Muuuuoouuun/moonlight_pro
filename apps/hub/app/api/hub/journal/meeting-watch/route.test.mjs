import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

const stub = `export async function getMeetingReviewWatchlist() {
  const state = globalThis.__meetingWatchRoute;
  state.calls++;
  if (state.fail) throw Error('private secret');
  return state.result;
}`;
registerHooks({ resolve(specifier, context, next) {
  return specifier === '@/lib/meeting-review-watchlist'
    ? { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true }
    : next(specifier, context);
} });
const route = await import('./route.js');
let state;
beforeEach(() => { state = globalThis.__meetingWatchRoute = {
  calls: 0, fail: false, result: { status: 'live', items: [], hasMore: false },
}; });
after(() => { delete globalThis.__meetingWatchRoute; });

test('meeting watch GET keeps HTTP 200 live, preview and error read envelopes', async () => {
  assert.equal(route.runtime, 'nodejs');
  assert.equal(route.dynamic, 'force-dynamic');
  for (const status of ['live', 'preview', 'error']) {
    state.result = { status, items: [], hasMore: false };
    const response = await route.GET(new Request('http://localhost/api/hub/journal/meeting-watch?workspaceId=foreign&limit=100'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), state.result);
  }
  assert.equal(state.calls, 3);
});

test('meeting watch GET contains unexpected errors without exposing internals', async () => {
  state.fail = true;
  const response = await route.GET(new Request('http://localhost/api/hub/journal/meeting-watch'));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, 'error');
  assert.deepEqual(result.items, []);
  assert.equal(result.hasMore, false);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

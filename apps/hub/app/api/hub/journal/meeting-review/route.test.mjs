import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

const stub = `
export const meetingReviewService = {
  async get(entryId) { const state=globalThis.__meetingRoute; state.reads.push(entryId); return state.readResult; },
  async analyze(input) { const state=globalThis.__meetingRoute; state.analyzes.push(input); return state.writeResult; },
  async review(input) { const state=globalThis.__meetingRoute; state.reviews.push(input); return state.writeResult; },
};`;
registerHooks({ resolve(specifier, context, next) {
  return specifier === '@/lib/meeting-review-service'
    ? { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true }
    : next(specifier, context);
} });
const route = await import('./route.js');
const endpoint = 'http://localhost:3000/api/hub/journal/meeting-review';
const keys = ['NODE_ENV', 'VERCEL_ENV', 'COM_MOON_HUB_WRITE_SECRET', 'COM_MOON_HUB_URL', 'NEXT_PUBLIC_APP_URL'];
const environment = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
let state;
beforeEach(() => {
  keys.forEach((key) => delete process.env[key]);
  process.env.NODE_ENV = 'test';
  state = globalThis.__meetingRoute = {
    reads: [], analyzes: [], reviews: [],
    readResult: { status: 'error', error: 'read-failed', proposals: [] },
    writeResult: { status: 'saved', entryId: 'entry', proposals: [], httpStatus: 200 },
  };
});
after(() => {
  delete globalThis.__meetingRoute;
  for (const key of keys) {
    if (environment[key] === undefined) delete process.env[key]; else process.env[key] = environment[key];
  }
});
const post = (input, headers = {}) => new Request(endpoint, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
  body: typeof input === 'string' ? input : JSON.stringify(input),
});

test('meeting review GET preserves HTTP 200 status:error read envelope', async () => {
  const response = await route.GET(new Request(`${endpoint}?entryId=note-1&workspaceId=foreign`));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'error');
  assert.deepEqual(state.reads, ['note-1']);
});

test('meeting review POST enforces write guard and structured actions', async () => {
  assert.equal((await route.POST(post({ action: 'analyze' }, { origin: 'https://foreign.invalid' }))).status, 403);
  assert.equal((await route.POST(post('{'))).status, 400);
  assert.equal((await route.POST(post({ action: 'other' }))).status, 400);
  assert.equal(state.analyzes.length, 0);
  assert.equal(state.reviews.length, 0);
  const analyze = await route.POST(post({ action: 'analyze', entryId: 'note' }));
  assert.equal(analyze.status, 200);
  assert.equal((await analyze.json()).status, 'saved');
  assert.equal(state.analyzes[0].entryId, 'note');
  state.writeResult = { status: 'conflict', error: 'stale-revision', httpStatus: 409 };
  const review = await route.POST(post({ action: 'review', proposalId: 'proposal' }));
  assert.equal(review.status, 409);
  assert.equal((await review.json()).status, 'conflict');
  assert.equal(state.reviews[0].proposalId, 'proposal');
});

test('meeting review accepts the full UTF-8 checklist contract while bounding other actions', async () => {
  const checklist = Array.from({ length: 50 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title: '가'.repeat(200), done: false, note: '나'.repeat(500),
  }));
  const review = { action: 'review', execution: { actionScope: 'mine', dueAt: null, method: null, checklist } };
  const reviewBytes = Buffer.byteLength(JSON.stringify(review), 'utf8');
  assert.ok(reviewBytes > 16 * 1024 && reviewBytes < 128 * 1024);
  assert.equal((await route.POST(post(review))).status, 200);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].execution.checklist.length, 50);

  assert.equal((await route.POST(post({ action: 'analyze', padding: '가'.repeat(6000) }))).status, 413);
  assert.equal((await route.POST(post(`{ "action": "analyze", "padding": "ok"${' '.repeat(17_000)} }`))).status, 413);
  assert.equal(state.analyzes.length, 0);
  assert.equal((await route.POST(post({ ...review, padding: '가'.repeat(50_000) }))).status, 413);
  assert.equal(state.reviews.length, 1);
});

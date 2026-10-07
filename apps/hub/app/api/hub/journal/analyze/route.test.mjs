import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route.js";
import * as analysisRoute from "./route.js";

test("journal analysis BFF allows the 45-second upstream read within its 60-second budget", () => {
  assert.equal(analysisRoute.maxDuration, 60);
});

test("POST /api/hub/journal/analyze write guard blocks cross-origin requests", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const req = new Request("https://moonlight.example/api/hub/journal/analyze", {
      method: "POST",
      headers: {
        origin: "https://evil.attacker.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({ requestId: "11111111-1111-4111-8111-111111111111", range: "7d" }),
    });
    const res = await POST(req);
    assert.equal(res.status, 403);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
  }
});

test("POST /api/hub/journal/analyze validates requestId and noteIds/range", async () => {
  const req = new Request("http://localhost:3000/api/hub/journal/analyze", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ noteIds: [] }),
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.status, "invalid-input");
});

test("POST /api/hub/journal/analyze accepts range 7d and returns preview when DB unconfigured", async () => {
  const origUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  try {
    const req = new Request("http://localhost:3000/api/hub/journal/analyze", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: "33333333-3333-4333-8333-333333333333",
        goal: "weekly_synthesis",
        range: "7d",
      }),
    });
    const res = await POST(req);
    assert.equal(res.status, 202);
    const data = await res.json();
    assert.equal(data.status, "preview");
  } finally {
    if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
    else delete process.env.SUPABASE_URL;
  }
});

const W = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-10-05T05:00:00Z');
const post = (body) => new Request('https://hub.test/api/hub/journal/analyze', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-com-moon-hub-write-secret': 'synthetic-secret' },
  body: JSON.stringify({ requestId: W, ...body }),
});
const note = (extra = {}) => ({ id: N, workspace_id: W, entry_kind: 'note', title: 'Synthetic note', body: 'Synthetic text',
  occurred_at: '2026-10-04T09:00:00Z', note_meta: { kind: 'note', enhancement: '', scope: 'company' }, ...extra });
async function configured(run) {
  const saved = { ...process.env }, fetchImpl = globalThis.fetch, now = Date.now;
  Object.assign(process.env, { NODE_ENV: 'production', COM_MOON_HUB_WRITE_SECRET: 'synthetic-secret', COM_MOON_DEFAULT_WORKSPACE_ID: W,
    SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-db',
    COM_MOON_ENGINE_URL: 'https://engine.example.test', COM_MOON_SHARED_WEBHOOK_SECRET: 'synthetic-engine' });
  Date.now = () => NOW;
  try { await run(); } finally { process.env = saved; globalThis.fetch = fetchImpl; Date.now = now; }
}
function intercept(rows) {
  const reads = [], forwarded = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'db.example.test') {
      assert.equal(parsed.pathname, '/rest/v1/journal_entries');
      reads.push(parsed.searchParams); return Response.json(typeof rows === 'function' ? rows(parsed.searchParams) : rows);
    }
    assert.equal(parsed.hostname, 'engine.example.test', 'all transports must be synthetic');
    assert.equal(parsed.pathname, '/api/ai/pattern-analyze');
    forwarded.push(JSON.parse(init.body)); return Response.json({ status: 'succeeded', patterns: [] });
  };
  return { reads, forwarded };
}

test('analysis validates scope, UUID sets, range and expected workspace before reading or forwarding', async () => {
  await configured(async () => {
    const calls = intercept([note()]);
    for (const body of [
      { noteIds: [N], scope: 'private' }, { noteIds: [N], scope: null }, { noteIds: ['old-note'] },
      { noteIds: [N, N] }, { noteIds: [N], range: '30d' }, { noteIds: [N], range: '7d' },
      { range: '7d', workspaceId: OTHER }, { range: '7d', requestId: 'old-request' },
    ]) {
      const response = await POST(post(body)); assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal((await response.json()).status, 'invalid-input');
    }
    assert.equal(calls.reads.length, 0); assert.equal(calls.forwarded.length, 0);
  });
});

test('recent seven-day analysis uses Seoul calendar dates, note kind and existing JSON scope filters', async () => {
  await configured(async () => {
    for (const scope of ['', 'personal', 'company', 'unclassified']) {
      const metadata = { kind: 'note', enhancement: '', ...(scope && scope !== 'unclassified' ? { scope } : {}) };
      const calls = intercept([note({ note_meta: metadata })]);
      const response = await POST(post({ goal: 'weekly_synthesis', range: '7d', scope, workspaceId: W }));
      assert.equal(response.status, 200); assert.equal((await response.json()).status, 'succeeded');
      assert.equal(calls.reads.length, 1); const query = calls.reads[0];
      assert.equal(query.get('workspace_id'), `eq.${W}`); assert.equal(query.get('entry_kind'), 'eq.note');
      assert.equal(query.get('note_meta->>scope'), !scope ? null : scope === 'unclassified' ? 'is.null' : `eq.${scope}`);
      assert.deepEqual(query.getAll('occurred_at'), ['gte.2026-09-28T15:00:00.000Z', 'lt.2026-10-05T15:00:00.000Z']);
      assert.deepEqual(calls.forwarded[0].records.map(row => row.id), [N]);
      assert.equal(calls.forwarded[0].workspaceId, W);
    }
  });
});

test('no notes in seven days returns records-not-found without expanding to older or other-scope records', async () => {
  await configured(async () => {
    const calls = intercept(query => query.has('occurred_at') ? [] : [note({ occurred_at: '2026-08-01T00:00:00Z' })]);
    const response = await POST(post({ range: '7d', scope: 'personal' }));
    assert.equal(response.status, 404); assert.equal((await response.json()).error, 'records-not-found');
    assert.equal(calls.reads.length, 1); assert.equal(calls.forwarded.length, 0);
  });
});

test('selected analysis fails closed on missing IDs, foreign workspace/kind/scope and duplicate or substituted rows', async () => {
  await configured(async () => {
    for (const rows of [[], [note({ workspace_id: OTHER })], [note({ entry_kind: 'daily_review' })],
      [note({ note_meta: { kind: 'note', scope: 'personal' } })], [note(), note()], [note({ id: OTHER })],
      [note({ note_meta: { kind: 'note', scope: 'unknown' } })]]) {
      const calls = intercept(rows);
      const response = await POST(post({ noteIds: [N], scope: 'company' }));
      assert.ok(response.status >= 400, JSON.stringify(rows)); assert.equal(calls.forwarded.length, 0);
      assert.equal(calls.reads[0].get('id'), `in.(${N})`);
      assert.equal(calls.reads[0].get('note_meta->>scope'), 'eq.company');
    }
    const calls = intercept([note()]);
    assert.ok((await POST(post({ noteIds: [N, OTHER], scope: 'company' }))).status >= 400);
    assert.equal(calls.forwarded.length, 0, 'a partial selection must not become a smaller analysis');
  });
});

test('weekly rows outside the requested period and malformed metadata never reach the engine', async () => {
  await configured(async () => {
    for (const extra of [{ occurred_at: '2026-09-28T14:59:59Z' }, { occurred_at: '2026-10-05T15:00:00Z' },
      { note_meta: null }, { note_meta: { kind: 'note', scope: null } }, { occurred_at: 'invalid-time' }]) {
      const calls = intercept([note(extra)]);
      assert.ok((await POST(post({ range: '7d' }))).status >= 400, JSON.stringify(extra));
      assert.equal(calls.forwarded.length, 0);
    }
  });
});

test('a complete same-scope selection forwards only the requested verified notes', async () => {
  await configured(async () => {
    for (const scope of ['', 'personal', 'company', 'unclassified']) {
      const metadata = { kind: 'note', enhancement: '', ...(scope && scope !== 'unclassified' ? { scope } : {}) };
      const calls = intercept([note({ note_meta: metadata, title: null })]);
      const response = await POST(post({ noteIds: [N], scope, workspaceId: W, goal: 'sales_insight' }));
      assert.equal(response.status, 200); assert.equal(calls.forwarded.length, 1);
      assert.deepEqual(calls.forwarded[0].records, [{ id: N, title: '', body: 'Synthetic text', occurredAt: '2026-10-04T09:00:00Z', enhancement: '' }]);
    }
  });
});

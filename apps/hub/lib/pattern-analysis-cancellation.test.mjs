import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forwardPatternAnalysis } from './pattern-analysis-client.js';
import { POST as hubPOST } from '../app/api/hub/journal/analyze/route.js';
import { POST as enginePOST } from '../../engine/app/api/ai/pattern-analyze/route.ts';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const NOTE = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const note = { id: NOTE, workspace_id: WORKSPACE, entry_kind: 'note', title: 'Synthetic note',
  body: 'Synthetic source text for cancellation.', occurred_at: '2026-10-19T01:00:00Z', note_meta: { kind: 'note', scope: 'personal' } };
const payload = { workspaceId: WORKSPACE, requestId: REQUEST, goal: 'general',
  records: [{ id: NOTE, title: note.title, body: note.body, occurredAt: note.occurred_at }] };
const clientEnv = { COM_MOON_ENGINE_URL: 'https://engine.test', COM_MOON_SHARED_WEBHOOK_SECRET: 'synthetic-engine' };
const providerBody = () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ candidates: [] }) }] } }],
  usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 } });
const request = (surface, signal) => new Request(`https://${surface}.test/api/${surface === 'hub' ? 'hub/journal/analyze' : 'ai/pattern-analyze'}`, {
  method: 'POST', signal, headers: { 'content-type': 'application/json',
    [surface === 'hub' ? 'x-com-moon-hub-write-secret' : 'x-com-moon-shared-secret']: `synthetic-${surface === 'hub' ? 'hub' : 'engine'}` },
  body: JSON.stringify(surface === 'hub' ? { requestId: REQUEST, noteIds: [NOTE], scope: 'personal' } : payload),
});

async function configured(run) {
  const overrides = { NODE_ENV: 'production', COM_MOON_HUB_WRITE_SECRET: 'synthetic-hub',
    COM_MOON_DEFAULT_WORKSPACE_ID: WORKSPACE, SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-db',
    ...clientEnv, GEMINI_API_BASE_URL: 'https://provider.test/v1beta', GEMINI_API_KEY: 'synthetic-provider' };
  const saved = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  const fetch = globalThis.fetch;
  Object.assign(process.env, overrides);
  try { await run(); } finally {
    globalThis.fetch = fetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

// The real Hub route, forwarding client, Engine route and Gemini helper execute.
// Only HTTP boundaries are synthetic. All assertions live outside application catches.
function intercept(provider) {
  const calls = { reads: 0, engine: [], provider: [], usage: [], unexpected: [] };
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(url);
    if (target.host === 'db.test' && target.pathname === '/rest/v1/journal_entries' && (!init.method || init.method === 'GET')) {
      calls.reads++; return Response.json([note]);
    }
    if (target.host === 'db.test' && target.pathname === '/rest/v1/ai_usage_log' && init.method === 'POST') {
      calls.usage.push(JSON.parse(init.body)); return Response.json([]);
    }
    if (target.host === 'engine.test' && target.pathname === '/api/ai/pattern-analyze') {
      calls.engine.push(init); return enginePOST(new Request(url, init));
    }
    if (target.host === 'provider.test' && target.pathname.endsWith(':generateContent')) {
      calls.provider.push(init); return provider(init);
    }
    calls.unexpected.push(`${init.method || 'GET'} ${target.origin}${target.pathname}`);
    return Response.json({ error: 'unexpected-synthetic-transport' }, { status: 500 });
  };
  return calls;
}

test('pre-aborted pattern forwarding never calls the Engine', async () => {
  const controller = new AbortController(); controller.abort(); let dispatched = 0;
  const result = await forwardPatternAnalysis(payload, { env: clientEnv, signal: controller.signal,
    fetchImpl: async () => { dispatched++; return Response.json({ status: 'succeeded' }); } });
  assert.equal(dispatched, 0);
  assert.equal(result.httpStatus, 502);
  assert.equal(result.data.status, 'failed');
});

test('forwarding discards a late parsed response and proves signal linkage outside transport catches', async () => {
  const controller = new AbortController(); let signal, abortedAfterCaller;
  const result = await forwardPatternAnalysis(payload, { env: clientEnv, signal: controller.signal,
    fetchImpl: async (_url, init) => {
      signal = init.signal;
      return { status: 200, json: async () => {
        controller.abort(); abortedAfterCaller = signal.aborted; return { status: 'succeeded' };
      } };
    } });
  assert.ok(signal instanceof AbortSignal);
  assert.equal(abortedAfterCaller, true);
  assert.equal(result.httpStatus, 502);
  assert.equal(result.data.status, 'failed');
});

test('forwarding keeps its existing deadline with and without a caller signal', async t => {
  let deadline; const requested = [];
  t.mock.method(AbortSignal, 'timeout', ms => { requested.push(ms); return deadline.signal; });
  for (const signal of [undefined, new AbortController().signal]) {
    deadline = new AbortController();
    let observed;
    const result = await forwardPatternAnalysis(payload, { env: clientEnv, signal,
      fetchImpl: async (_url, init) => {
        observed = init.signal; deadline.abort(); return Response.json({ status: 'succeeded' });
      } });
    assert.ok(observed instanceof AbortSignal);
    assert.equal(observed.aborted, true);
    assert.equal(result.data.status, 'failed');
  }
  assert.deepEqual(requested, [45000, 45000]);
});

test('an aborted Engine request never dispatches a provider request', async () => configured(async () => {
  const controller = new AbortController(); controller.abort();
  const calls = intercept(() => Response.json(providerBody()));
  const response = await enginePOST(request('engine', controller.signal));
  assert.equal(calls.provider.length, 0);
  assert.equal((await response.json()).status, 'failed');
  assert.equal(calls.usage.length, 0);
  assert.deepEqual(calls.unexpected, []);
}));

test('Engine passes cancellation to the actual Gemini helper and rejects late success after recording received usage', async () => configured(async () => {
  const controller = new AbortController(); let abortedAfterCaller;
  const calls = intercept(init => ({ ok: true, status: 200, text: async () => {
    controller.abort(); abortedAfterCaller = init.signal.aborted; return JSON.stringify(providerBody());
  } }));
  const response = await enginePOST(request('engine', controller.signal));
  await new Promise(setImmediate);
  assert.equal(abortedAfterCaller, true);
  assert.equal(calls.provider.length, 1);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, 'failed');
  assert.equal(calls.usage.length, 1);
  assert.equal(calls.usage.flat()[0].surface, 'pattern-analysis');
  assert.equal(calls.usage.flat()[0].total_tokens, 5);
  assert.deepEqual(calls.unexpected, []);
}));

test('a cancelled Hub request never starts Engine generation even when its record read completes late', async () => configured(async () => {
  const controller = new AbortController();
  const calls = intercept(() => Response.json(providerBody()));
  const baseFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const result = await baseFetch(url, init);
    if (new URL(url).pathname === '/rest/v1/journal_entries') controller.abort();
    return result;
  };
  const response = await hubPOST(request('hub', controller.signal));
  assert.equal(calls.reads, 1);
  assert.equal(calls.engine.length, 0);
  assert.equal(calls.provider.length, 0);
  assert.equal((await response.json()).status, 'failed');
  assert.deepEqual(calls.unexpected, []);
}));

test('real Hub to Engine to provider pipeline propagates abort without accepting a late body', async () => configured(async () => {
  const controller = new AbortController(); let providerAborted;
  const calls = intercept(init => ({ ok: true, status: 200, text: async () => {
    controller.abort(); providerAborted = init.signal.aborted; return JSON.stringify(providerBody());
  } }));
  const response = await hubPOST(request('hub', controller.signal));
  await new Promise(setImmediate);
  assert.equal(calls.reads, 1);
  assert.equal(calls.engine.length, 1);
  assert.equal(calls.engine[0].signal.aborted, true);
  assert.equal(providerAborted, true);
  assert.equal(calls.provider.length, 1);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, 'failed');
  assert.equal(calls.usage.length, 1);
  assert.equal(calls.usage.flat()[0].total_tokens, 5);
  assert.deepEqual(calls.unexpected, []);
}));

test('ordinary Hub pipeline preserves successful analysis, provider limits and received usage', async () => configured(async () => {
  const calls = intercept(() => Response.json(providerBody()));
  const response = await hubPOST(request('hub', new AbortController().signal));
  await new Promise(setImmediate);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'succeeded');
  assert.equal(body.requestId, REQUEST);
  assert.equal(calls.provider.length, 1);
  const config = JSON.parse(calls.provider[0].body).generationConfig;
  assert.equal(config.maxOutputTokens, 8192);
  assert.equal(config.responseMimeType, 'application/json');
  assert.equal(calls.usage.length, 1);
  assert.equal(calls.usage.flat()[0].surface, 'pattern-analysis');
  assert.deepEqual(calls.unexpected, []);
}));

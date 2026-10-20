import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from './route.js';

const data = {
  title: '메모', summary: '요약', transcription: '원문', actionItems: [],
  keyDecisions: [], suggestedTags: [], detectedEntities: { projects: [], peopleOrCompanies: [] },
};

function setup(t, provider) {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'local-test-key';
  t.mock.method(globalThis, 'fetch', provider);
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });
}

function request(signal, headers = { origin: 'http://127.0.0.1:3000' }) {
  return new Request('http://127.0.0.1:3000/api/hub/intake/multimodal', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ text: '원문' }), signal,
  });
}

test('the existing intake route does not call the provider for an already cancelled request', async t => {
  let calls = 0;
  setup(t, async () => { calls++; throw Error('unexpected provider call'); });
  const caller = new AbortController();
  caller.abort();
  const result = await POST(request(caller.signal));
  assert.equal(calls, 0);
  assert.equal((await result.json()).status, 'error');
});

test('the request signal reaches the real transport and aborts an active provider call', async t => {
  const caller = new AbortController();
  let calls = 0, forwardedSignal, initiallyAborted, abortedAfterCaller;
  setup(t, async (_url, { signal }) => {
    calls++;
    forwardedSignal = signal;
    initiallyAborted = signal.aborted;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      caller.abort();
      abortedAfterCaller = signal.aborted;
      // Avoid a hanging test on broken propagation without relying on an
      // assertion that the real transport would catch as a provider error.
      if (!abortedAfterCaller) reject(Error('Request cancellation was not forwarded'));
    });
  });
  const result = await POST(request(caller.signal));
  assert.equal(calls, 1);
  assert.equal(initiallyAborted, false);
  assert.equal(abortedAfterCaller, true);
  assert.equal(forwardedSignal.aborted, true);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).status, 'error');
});

test('the existing intake route preserves a normal successful response', async t => {
  let calls = 0;
  setup(t, async (_url, { signal }) => {
    calls++;
    assert.equal(signal.aborted, false);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] });
  });
  const result = await POST(request(new AbortController().signal));
  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'ok', data });
});

test('the existing write guard still rejects an untrusted request before extraction', async t => {
  let calls = 0;
  setup(t, async () => { calls++; throw Error('unexpected provider call'); });
  const result = await POST(request(undefined, { origin: 'https://untrusted.invalid' }));
  assert.equal(calls, 0);
  assert.equal(result.status, 403);
  assert.equal((await result.json()).status, 'forbidden');
});

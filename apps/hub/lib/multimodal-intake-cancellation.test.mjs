import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMultimodalIntakeHub, MULTIMODAL_SCHEMA } from './multimodal-intake-core.js';

const data = {
  title: '검토 메모', summary: '확인할 내용', transcription: '보존할 원문',
  actionItems: [], keyDecisions: [], suggestedTags: [],
  detectedEntities: { projects: [], peopleOrCompanies: [] },
};
const payload = () => JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }],
  usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
});

function configured(t) {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'local-test-key';
  t.after(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });
}

function abortableFetch(onStart) {
  return async (_url, { signal }) => {
    signal.throwIfAborted();
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      onStart(signal);
    });
  };
}

test('an already cancelled intake never starts the provider request', async t => {
  configured(t);
  const caller = new AbortController();
  caller.abort();
  let calls = 0;
  const result = await extractMultimodalIntakeHub({
    text: '원문', signal: caller.signal,
    fetchImpl: async () => { calls++; throw Error('unexpected provider call'); },
  });
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
});

test('caller cancellation aborts an active provider request without retry', async t => {
  configured(t);
  const caller = new AbortController();
  let calls = 0, forwardedSignal, initiallyAborted, abortedAfterCaller;
  const result = await extractMultimodalIntakeHub({
    text: '원문', signal: caller.signal,
    fetchImpl: abortableFetch(signal => {
      calls++;
      forwardedSignal = signal;
      initiallyAborted = signal.aborted;
      caller.abort();
      abortedAfterCaller = signal.aborted;
      // Settle a broken implementation too; verify propagation outside the
      // transport's catch so it cannot swallow a test assertion as an error.
      if (!abortedAfterCaller) throw Error('Caller cancellation was not forwarded');
    }),
  });
  assert.equal(calls, 1);
  assert.equal(initiallyAborted, false);
  assert.equal(abortedAfterCaller, true);
  assert.equal(forwardedSignal.aborted, true);
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
});

test('a late cancelled body records received usage but cannot become a successful result', async t => {
  configured(t);
  const caller = new AbortController();
  const usage = [];
  const result = await extractMultimodalIntakeHub({
    text: '원문', signal: caller.signal, recordUsage: row => usage.push(row),
    fetchImpl: async () => ({ ok: true, text: async () => { caller.abort(); return payload(); } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].surface, 'hub-multimodal-intake');
  assert.equal(usage[0].usageMetadata.totalTokenCount, 5);
});

for (const withCaller of [false, true]) {
  test(`the 45 second deadline still aborts ${withCaller ? 'with' : 'without'} a caller signal`, async t => {
    configured(t);
    const deadline = new AbortController();
    const caller = new AbortController();
    let deadlines = 0;
    t.mock.method(AbortSignal, 'timeout', milliseconds => {
      assert.equal(milliseconds, 45_000);
      deadlines++;
      return deadline.signal;
    });
    const result = await extractMultimodalIntakeHub({
      text: '원문', ...(withCaller ? { signal: caller.signal } : {}),
      fetchImpl: abortableFetch(() => deadline.abort(new DOMException('deadline', 'TimeoutError'))),
    });
    assert.equal(deadlines, 1);
    assert.equal(caller.signal.aborted, false);
    assert.equal(result.ok, false);
    assert.equal(result.data, null);
  });
}

test('normal intake preserves its schema, output budget, result and usage reporting', async t => {
  configured(t);
  const caller = new AbortController();
  const usage = [];
  const result = await extractMultimodalIntakeHub({
    text: '원문', signal: caller.signal, recordUsage: row => usage.push(row),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.generationConfig.responseJsonSchema, MULTIMODAL_SCHEMA);
      assert.equal(body.generationConfig.maxOutputTokens, 8192);
      assert.equal(options.signal.aborted, false);
      return new Response(payload());
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, data);
  assert.deepEqual(result.usage, { promptTokens: 2, candidatesTokens: 3, totalTokens: 5 });
  assert.equal(usage.length, 1);
  assert.equal(usage[0].surface, 'hub-multimodal-intake');
});

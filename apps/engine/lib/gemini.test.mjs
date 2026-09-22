import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateGeminiText, getGeminiResponseDiagnostics } from './gemini.ts';

async function withLocalProvider(fetch, check) {
  const before = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = 'local-test-key';
  globalThis.fetch = fetch;
  try { await check(); }
  finally {
    globalThis.fetch = before.fetch;
    if (before.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before.key;
  }
}

test('generation preserves the requested model alias and separately reports the served version', async () => {
  const before = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL };
  process.env.GEMINI_API_KEY = 'local-test-key'; process.env.GEMINI_MODEL = 'default-model';
  try {
    for (const status of [200, 429]) {
      globalThis.fetch = async url => {
        assert.match(url, /models\/selected-model:generateContent$/);
        return new Response(JSON.stringify(status === 200 ? { modelVersion: 'served-model-001', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '결과' }] } }] } : { error: { message: 'quota' } }), { status });
      };
      const result = await generateGeminiText({ prompt: '검토', model: 'selected-model' });
      assert.equal(result.model, 'selected-model');
      assert.equal(result.modelVersion, status === 200 ? 'served-model-001' : null);
      assert.equal(result.ok, status === 200);
      assert.equal(result.failureCategory, status === 200 ? null : 'rate-limit');
    }
  } finally {
    globalThis.fetch = before.fetch;
    for (const [name, value] of [['GEMINI_API_KEY', before.key], ['GEMINI_MODEL', before.model]]) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test('generateGeminiText sends media inlineData parts in payload', async () => {
  const before = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = 'local-test-key';
  try {
    let capturedBody = null;
    globalThis.fetch = async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '분석완료' }] } }] }), { status: 200 });
    };

    const res = await generateGeminiText({
      prompt: '이미지 분석',
      media: [{ mimeType: 'image/jpeg', base64: 'aGVsbG8=' }],
    });

    assert.equal(res.ok, true);
    assert.equal(res.text, '분석완료');
    assert.deepEqual(capturedBody.contents[0].parts, [
      { text: '이미지 분석' },
      { inlineData: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } },
    ]);
  } finally {
    globalThis.fetch = before.fetch;
    if (before.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before.key;
  }
});

test('generateGeminiText captures finishReason and rejects a truncated result', async () => {
  const before = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = 'local-test-key';
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '정상 완료' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    }), { status: 200 });

    const stopRes = await generateGeminiText({ prompt: '테스트' });
    assert.equal(stopRes.ok, true);
    assert.equal(stopRes.reason, 'ok');
    assert.equal(stopRes.finishReason, 'STOP');
    assert.equal(stopRes.usageMetadata?.totalTokenCount, 15);

    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '잘린 텍스트' }] } }],
    }), { status: 200 });

    const maxRes = await generateGeminiText({ prompt: '테스트' });
    assert.equal(maxRes.ok, false);
    assert.equal(maxRes.reason, 'max_tokens');
    assert.equal(maxRes.finishReason, 'MAX_TOKENS');
    assert.equal(maxRes.failureCategory, 'incomplete-output');
    assert.equal(maxRes.text, '');
  } finally {
    globalThis.fetch = before.fetch;
    if (before.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before.key;
  }
});

test('thought parts are excluded while normal completed text remains usable JSON', async () => {
  await withLocalProvider(async () => Response.json({
    modelVersion: 'gemini-3.5-flash-001',
    candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, text: 'private thought, not an answer' },
      { text: '{"answer":' }, { thought: false, text: '"완료"}' },
    ] } }],
  }), async () => {
    const result = await generateGeminiText({ prompt: '테스트' });
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(result.text), { answer: '완료' });
    assert.doesNotMatch(JSON.stringify(result), /private thought/);
  });
});

test('HTTP success alone cannot make blocked, unfinished, or empty output successful', async () => {
  const cases = [
    [{ candidates: [] }, 'empty-output', null],
    [{ candidates: [{ content: { parts: [{ text: 'unconfirmed output' }] } }] }, 'incomplete-output', null],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] }, 'empty-output', 'STOP'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '  ' }, { thought: true, text: 'unconfirmed output' }] } }] }, 'empty-output', 'STOP'],
    [{ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'unconfirmed output' }] } }] }, 'blocked-output', 'SAFETY'],
    [{ candidates: [{ finishReason: 'OTHER', content: { parts: [{ text: 'unconfirmed output' }] } }] }, 'incomplete-output', 'OTHER'],
    [{ promptFeedback: { blockReason: 'PROHIBITED_CONTENT', blockReasonMessage: 'private block explanation' } }, 'blocked-prompt', null],
  ];
  for (const [body, category, finishReason] of cases) {
    await withLocalProvider(async () => Response.json(body), async () => {
      const result = await generateGeminiText({ prompt: '테스트' });
      assert.equal(result.ok, false);
      assert.equal(result.status, 200);
      assert.equal(result.failureCategory, category);
      assert.equal(result.finishReason, finishReason);
      assert.equal(result.text, '');
      if (body.promptFeedback) assert.deepEqual(result.promptFeedback, { blockReason: 'PROHIBITED_CONTENT' });
      assert.doesNotMatch(JSON.stringify(result), /unconfirmed output|private block explanation/);
    });
  }
});

test('diagnostics keep numeric usage and machine metadata without copying provider text', () => {
  assert.deepEqual(getGeminiResponseDiagnostics({
    modelVersion: 'served-model-001', candidates: [{ finishReason: 'STOP', finishMessage: 'private finish explanation' }],
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 7, totalTokenCount: 12, cachedContentTokenCount: 2, thoughtsTokenCount: 5, toolUsePromptTokenCount: 1, cost: 100, privateField: 'private usage text', promptTokensDetails: [{ tokenCount: 9 }] },
    promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: 'private block explanation' },
  }), {
    modelVersion: 'served-model-001', finishReason: 'STOP',
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 7, totalTokenCount: 12, cachedContentTokenCount: 2, thoughtsTokenCount: 5, toolUsePromptTokenCount: 1 },
    promptFeedback: { blockReason: 'SAFETY' },
  });
  assert.equal(getGeminiResponseDiagnostics({ usageMetadata: { promptTokenCount: '7', candidatesTokenCount: -1, totalTokenCount: Infinity, thoughtsTokenCount: NaN } }).usageMetadata, null);
  assert.equal(getGeminiResponseDiagnostics({ usageMetadata: { promptTokenCount: 1.5, candidatesTokenCount: Number.MAX_SAFE_INTEGER + 1 } }).usageMetadata, null);
});

test('HTTP and parse failures preserve status and never expose response messages', async () => {
  for (const [status, body, category] of [
    [503, '<html>private provider response</html>', 'provider-unavailable'],
    [429, JSON.stringify({ error: { message: 'private provider response' } }), 'rate-limit'],
    [401, JSON.stringify({ error: { message: 'private provider response' } }), 'authentication'],
    [400, JSON.stringify({ error: { message: 'private provider response' } }), 'invalid-request'],
    [200, '{private provider response', 'invalid-json'],
  ]) {
    await withLocalProvider(async () => new Response(body, { status }), async () => {
      const result = await generateGeminiText({ prompt: '테스트' });
      assert.equal(result.ok, false);
      assert.equal(result.status, status);
      assert.equal(result.failureCategory, category);
      assert.doesNotMatch(JSON.stringify(result), /private provider response/);
    });
  }
});

test('network and abort failures use bounded categories instead of raw exception messages', async () => {
  for (const [error, category] of [
    [new TypeError('private request URL or key'), 'network-error'],
    [new DOMException('private request URL or key', 'TimeoutError'), 'timeout'],
    [new DOMException('private request URL or key', 'AbortError'), 'aborted'],
    [new TypeError('private request URL or key', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), 'timeout'],
    [new Error('private request URL or key'), 'provider-error'],
  ]) {
    await withLocalProvider(async () => { throw error; }, async () => {
      const result = await generateGeminiText({ prompt: '테스트' });
      assert.equal(result.ok, false);
      assert.equal(result.failureCategory, category);
      assert.equal(result.status, null);
      assert.doesNotMatch(JSON.stringify(result), /private request URL or key/);
    });
  }
  const controller = new AbortController();
  await withLocalProvider(async () => ({ status: 200, ok: true, text: async () => {
    controller.abort(new Error('private abort reason'));
    controller.signal.throwIfAborted();
  } }), async () => {
    const result = await generateGeminiText({ prompt: '테스트', signal: controller.signal });
    assert.equal(result.failureCategory, 'aborted');
    assert.equal(result.status, 200);
    assert.doesNotMatch(JSON.stringify(result), /private abort reason/);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiText } from './gemini.ts';

test('Gemini honors the caller deadline without exposing credentials to the caller result', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-office-test-key';
  const controller = new AbortController();
  try {
    globalThis.fetch = async (_url, options) => {
      controller.abort();
      assert.equal(options.signal.aborted, true);
      options.signal.throwIfAborted();
      assert.fail('aborted request must not finish');
    };
    const result = await generateGeminiText({ prompt: 'test', signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.doesNotMatch(JSON.stringify(result), /fake-office-test-key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('structured output is opt-in and preserves ordinary Gemini callers', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-office-test-key';
  const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] };
  const configs = [];
  try {
    globalThis.fetch = async (_url, options) => {
      configs.push(JSON.parse(options.body).generationConfig);
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"test"}' }] } }] });
    };
    await generateGeminiText({ prompt: 'structured', responseJsonSchema: schema, thinkingLevel: 'high', model: 'gemini-3.5-flash' });
    await generateGeminiText({ prompt: 'ordinary' });
    await generateGeminiText({ prompt: 'older model', thinkingLevel: 'high', model: 'gemini-2.5-flash' });
    assert.deepEqual(configs[0].responseJsonSchema, schema);
    assert.equal(configs[0].responseMimeType, 'application/json');
    assert.equal(configs[1].responseJsonSchema, undefined);
    assert.equal(configs[1].responseMimeType, undefined);
    assert.equal(configs[1].maxOutputTokens, 8192);
    assert.deepEqual(configs[0].thinkingConfig, { thinkingLevel: 'high' });
    assert.equal(configs[1].thinkingConfig, undefined);
    assert.equal(configs[2].thinkingConfig, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

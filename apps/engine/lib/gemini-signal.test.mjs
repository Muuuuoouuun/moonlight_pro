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

// thinkingBudget은 Gemini 2.5 옵션이다. 3 계열에 보내면 요청 자체가 거절돼 초안 크론
// (followup-autopilot·content-flywheel)이 매일 밤 조용히 0건이 된다 — 기본 모델이
// gemini-3.5-flash이고 DRAFT_GENERATION_BOUNDS가 512를 싣기 때문에 실제로 닿는 경로다.
test('thinkingBudget only reaches 2.5-series models and never erases thinkingLevel', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-office-test-key';
  const configs = [];
  try {
    globalThis.fetch = async (_url, options) => {
      configs.push(JSON.parse(options.body).generationConfig);
      return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    };
    await generateGeminiText({ prompt: 'draft', thinkingBudget: 512, model: 'gemini-3.5-flash' });
    await generateGeminiText({ prompt: 'draft', thinkingBudget: 512, model: 'gemini-2.5-flash' });
    await generateGeminiText({ prompt: 'both', thinkingBudget: 512, thinkingLevel: 'low', model: 'gemini-3.5-flash' });
    assert.equal(configs[0].thinkingConfig, undefined, '3 계열에는 thinkingBudget을 싣지 않는다');
    assert.deepEqual(configs[1].thinkingConfig, { thinkingBudget: 512 });
    assert.deepEqual(configs[2].thinkingConfig, { thinkingLevel: 'low' }, 'thinkingLevel이 지워지지 않는다');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

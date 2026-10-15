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

// Gemini 4는 2.5의 thinkingBudget을 폐기했고 temperature·topP·topK를 받지 않는다. 3 계열처럼
// thinkingLevel만 싣고, 기본 모델이 4로 바뀌어도 초안 크론의 thinkingBudget 512가 닿지 않아야 한다.
test('Gemini 4 receives thinkingLevel only and never thinkingBudget or temperature', async () => {
  const originalFetch = globalThis.fetch;
  const before = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, fallback: process.env.AI_DEFAULT_MODEL };
  process.env.GEMINI_API_KEY = 'fake-office-test-key';
  delete process.env.GEMINI_MODEL; delete process.env.AI_DEFAULT_MODEL;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, config: JSON.parse(options.body).generationConfig });
      return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    };
    await generateGeminiText({ prompt: 'default', thinkingBudget: 512, temperature: 0.2 });
    await generateGeminiText({ prompt: 'both', thinkingBudget: 512, thinkingLevel: 'high', temperature: 0.2, model: 'gemini-4-argon' });
    await generateGeminiText({ prompt: 'older', temperature: 0.2, model: 'gemini-3.5-flash' });
    assert.match(calls[0].url, /\/models\/gemini-4-argon:generateContent$/, '기본 모델은 Gemini 4');
    assert.equal(calls[0].config.thinkingConfig, undefined);
    assert.equal(calls[0].config.temperature, undefined);
    assert.deepEqual(calls[1].config.thinkingConfig, { thinkingLevel: 'high' });
    assert.equal(calls[1].config.temperature, undefined);
    assert.equal(calls[2].config.temperature, 0.2, '3 계열은 temperature를 그대로 받는다');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [['GEMINI_API_KEY', before.key], ['GEMINI_MODEL', before.model], ['AI_DEFAULT_MODEL', before.fallback]]) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

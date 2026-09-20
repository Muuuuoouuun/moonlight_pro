import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateGeminiText } from './gemini.ts';

test('generation reports the actual overridden model on success and failure', async () => {
  const before = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL };
  process.env.GEMINI_API_KEY = 'local-test-key'; process.env.GEMINI_MODEL = 'default-model';
  try {
    for (const status of [200, 429]) {
      globalThis.fetch = async url => {
        assert.match(url, /models\/selected-model:generateContent$/);
        return new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text: '결과' }] } }] } : { error: { message: 'quota' } }), { status });
      };
      assert.equal((await generateGeminiText({ prompt: '검토', model: 'selected-model' })).model, 'selected-model');
    }
  } finally {
    globalThis.fetch = before.fetch;
    for (const [name, value] of [['GEMINI_API_KEY', before.key], ['GEMINI_MODEL', before.model]]) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

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

test('generateGeminiText sends media inlineData parts in payload', async () => {
  const before = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = 'local-test-key';
  try {
    let capturedBody = null;
    globalThis.fetch = async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '분석완료' }] } }] }), { status: 200 });
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

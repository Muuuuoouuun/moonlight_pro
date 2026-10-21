import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoogleAuth } from 'google-auth-library';
import { generateGeminiText, getGeminiIntegrationStatus } from './gemini.ts';

test('Engine sends its existing structured payload to Vertex and returns usage diagnostics', async () => {
  const names = ['GEMINI_BACKEND', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GEMINI_API_KEY', 'VERCEL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const before = { fetch: globalThis.fetch, token: GoogleAuth.prototype.getAccessToken };
  Object.assign(process.env, { GEMINI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'moonlight-credit', GOOGLE_CLOUD_LOCATION: 'global', GEMINI_API_KEY: 'stale-key' });
  delete process.env.VERCEL;
  GoogleAuth.prototype.getAccessToken = async () => 'temporary-token';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(url, /aiplatform.googleapis.com\/v1\/projects\/moonlight-credit\//);
    assert.equal(options.headers.Authorization, 'Bearer temporary-token');
    assert.equal(options.headers['x-goog-api-key'], undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.contents[0].parts[0].text, 'Return JSON');
    assert.deepEqual(body.generationConfig.responseJsonSchema, { type: 'object' });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { totalTokenCount: 20 } });
  };
  try {
    assert.equal(getGeminiIntegrationStatus().backend, 'vertex');
    const result = await generateGeminiText({ prompt: 'Return JSON', model: 'gemini-3-flash', responseJsonSchema: { type: 'object' } });
    assert.equal(result.ok, true);
    assert.equal(result.text, '{"ok":true}');
    assert.equal(result.usageMetadata.totalTokenCount, 20);
    GoogleAuth.prototype.getAccessToken = async () => { throw new Error('private credential error'); };
    const denied = await generateGeminiText({ prompt: 'No fallback', model: 'gemini-3-flash' });
    assert.equal(denied.failureCategory, 'authentication');
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(denied), /private credential|stale-key|temporary-token/);
  } finally {
    globalThis.fetch = before.fetch;
    GoogleAuth.prototype.getAccessToken = before.token;
    for (const [name, value] of Object.entries(previous)) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

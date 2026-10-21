import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoogleAuth } from 'google-auth-library';
import { getGenaiStatus, prepareGenaiRequest } from './index.js';

const env = { GEMINI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'moonlight-credit', GOOGLE_CLOUD_LOCATION: 'global', GEMINI_API_KEY: 'legacy-key-must-not-be-used' };

async function withToken(getAccessToken, check) {
  const before = GoogleAuth.prototype.getAccessToken;
  GoogleAuth.prototype.getAccessToken = getAccessToken;
  try { await check(); } finally { GoogleAuth.prototype.getAccessToken = before; }
}

test('Vertex uses the selected project and bearer authentication, ignoring the legacy key and base override', async () => {
  await withToken(async () => 'short-lived-token', async () => {
    const request = await prepareGenaiRequest('gemini-3-flash', { env: { ...env, GEMINI_API_BASE_URL: 'https://untrusted.invalid' } });
    assert.equal(request.url, 'https://aiplatform.googleapis.com/v1/projects/moonlight-credit/locations/global/publishers/google/models/gemini-3-flash:generateContent');
    assert.equal(request.headers.Authorization, 'Bearer short-lived-token');
    assert.equal(request.headers['x-goog-user-project'], 'moonlight-credit');
    assert.equal(request.headers['x-goog-api-key'], undefined);
    const regional = await prepareGenaiRequest('gemini-3-flash', { env: { ...env, GOOGLE_CLOUD_LOCATION: 'us-central1' } });
    assert.match(regional.url, /^https:\/\/us-central1-aiplatform\.googleapis\.com\//);
    assert.doesNotMatch(JSON.stringify(getGenaiStatus(env)), /legacy-key|short-lived-token/);
  });
});

test('missing or invalid Vertex configuration never falls back to an existing API key', async () => {
  for (const change of [ { GOOGLE_CLOUD_PROJECT: '' }, { GOOGLE_CLOUD_LOCATION: 'global.evil.invalid' }, { GEMINI_BACKEND: 'typo' }, { VERCEL: '1' } ]) {
    const invalid = { ...env, ...change };
    assert.equal(getGenaiStatus(invalid).configured, false);
    await assert.rejects(prepareGenaiRequest('gemini-3-flash', { env: invalid }), { code: 'GENAI_CONFIGURATION' });
  }
  await assert.rejects(prepareGenaiRequest('../other-project', { env }), { code: 'GENAI_CONFIGURATION' });
});

test('authentication failures do not expose token responses or use a legacy key', async () => {
  await withToken(async () => { throw new Error('private provider credential failure'); }, async () => {
    await assert.rejects(prepareGenaiRequest('gemini-3-flash', { env }), error => {
      assert.equal(error.code, 'GENAI_AUTHENTICATION');
      assert.doesNotMatch(error.message, /private provider|legacy-key/);
      return true;
    });
  });
});

test('production Vercel requires complete federation configuration, even if ADC is selected', async () => {
  const federation = { ...env, VERCEL: '1', GCP_AUTH_MODE: 'adc', GCP_PROJECT_NUMBER: '123456789', GCP_WORKLOAD_IDENTITY_POOL_ID: 'moonlight-vercel', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel', GCP_SERVICE_ACCOUNT_EMAIL: 'moonlight-vertex@moonlight-credit.iam.gserviceaccount.com' };
  assert.equal(getGenaiStatus(federation).authMode, 'vercel-oidc');
  assert.equal(getGenaiStatus(federation).configured, true);
  await withToken(async function () {
    assert.equal(this.cachedCredential.constructor.name, 'IdentityPoolClient');
    return 'federated-token';
  }, async () => {
    const request = await prepareGenaiRequest('gemini-3-flash', { env: federation });
    assert.equal(request.headers.Authorization, 'Bearer federated-token');
  });
});

test('cancellation stops authentication before any request or token retrieval', async () => {
  let calls = 0;
  await withToken(async () => { calls++; return 'unused'; }, async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    await assert.rejects(prepareGenaiRequest('gemini-3-flash', { env, signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls, 0);
  });
});

test('legacy mode keeps API key authentication for deployments not yet migrated', async () => {
  const request = await prepareGenaiRequest('selected-model', { env: { GEMINI_API_KEY: 'legacy-key' } });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/selected-model:generateContent');
  assert.equal(request.headers['x-goog-api-key'], 'legacy-key');
  assert.equal(request.headers.Authorization, undefined);
});

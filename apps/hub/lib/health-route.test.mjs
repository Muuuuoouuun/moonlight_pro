import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const readiness = `
export const resolveControlPlaneReadiness = async () => ({ engine: { configured: false } });
export const resolveGoogleOAuthProviderReadiness = () => ({ calendar: { configured: false } });
export const resolveSecretReadiness = () => ({ sharedWebhook: {}, oauthState: {}, hubWrite: {} });
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (specifier === '@/lib/integration-readiness') return { url: `data:text/javascript,${encodeURIComponent(readiness)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { GET } = await import('../app/api/health/route.js');

function diagnosticRequest(t) {
  const previous = process.env.COM_MOON_HUB_WRITE_SECRET;
  process.env.COM_MOON_HUB_WRITE_SECRET = 'health-diagnostic-test-secret';
  t.after(() => { if (previous === undefined) delete process.env.COM_MOON_HUB_WRITE_SECRET; else process.env.COM_MOON_HUB_WRITE_SECRET = previous; });
  return new Request('https://health.example/api/health', { headers: { 'x-com-moon-hub-write-secret': 'health-diagnostic-test-secret' } });
}

test('health recognizes Vertex ADC configuration without an API key', async t => {
  const values = { GEMINI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'moonlight-test', GOOGLE_CLOUD_LOCATION: 'global', GCP_AUTH_MODE: 'adc', VERCEL: '', GEMINI_API_KEY: '', GOOGLE_GENERATIVE_AI_API_KEY: '' };
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const body = await (await GET(diagnosticRequest(t))).json();
  assert.equal(body.config.geminiConfigured, true);
});

test('health probe uses a deadline and reports timeout as degraded', async t => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://health.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'health-test-key';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });
  let signal;
  t.mock.method(AbortSignal, 'timeout', ms => {
    assert.equal(ms, 5000);
    return AbortSignal.abort(new DOMException('deadline', 'TimeoutError'));
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options.signal;
    assert.ok(signal instanceof AbortSignal);
    signal.throwIfAborted();
  });
  const response = await GET(diagnosticRequest(t));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, 'degraded');
  assert.equal(body.database.supabase.reason, 'timeout');
  assert.ok(signal.aborted);
});

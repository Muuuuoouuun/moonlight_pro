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
  const response = await GET();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, 'degraded');
  assert.equal(body.database.supabase.reason, 'timeout');
  assert.ok(signal.aborted);
});

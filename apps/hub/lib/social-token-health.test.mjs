import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getMetaTokenStatus, isRefreshGrantExpiringSoon, fetchSocialToken, safeSocialCallbackError } from './social-token-health.js';
import { getYouTubeUploadReadiness } from './social-upload-readiness.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('Meta metadata distinguishes unknown, expired and approaching expiry without provider calls', () => {
  globalThis.fetch = () => { throw new Error('no provider request allowed'); };
  const now = Date.parse('2026-09-30T00:00:00Z');
  assert.equal(getMetaTokenStatus({ hasAccessToken: false }, now), 'reauthorization-required');
  assert.equal(getMetaTokenStatus({ hasAccessToken: true }, now), 'expiry-unknown');
  assert.equal(getMetaTokenStatus({ hasAccessToken: true, expiresAt: '2026-09-29' }, now), 'reauthorization-required');
  assert.equal(getMetaTokenStatus({ hasAccessToken: true, expiresAt: '2026-10-01' }, now), 'refresh-required');
  assert.equal(getMetaTokenStatus({ hasAccessToken: true, expiresAt: '2026-11-23' }, now), 'connected');
  assert.equal(isRefreshGrantExpiringSoon('2026-10-01', now), true);
  assert.equal(isRefreshGrantExpiringSoon('2026-09-29', now), false);
});

test('provider error classification removes private descriptions and response bodies', async () => {
  for (const [status, error, expected] of [[400, 'invalid_grant', 'reauthorization-required'],
    [400, 'invalid_client', 'client-config-error'], [400, 'admin_policy_enforced', 'permission-required'],
    [400, { code: 190, message: 'fake-secret' }, 'reauthorization-required'],
    [403, { code: 200, message: 'fake-secret' }, 'permission-required'],
    [429, 'fake-secret', 'retryable'], [503, 'fake-secret', 'retryable'], [400, 'fake-secret', 'failed']]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error, error_description: 'fake-secret https://private.example/token' }), { status });
    await assert.rejects(fetchSocialToken('https://provider.example', {}, 'threads', 'token-refresh'),
      err => err.message === `threads-token-refresh-${expected}`);
  }
  globalThis.fetch = async () => { throw new Error('https://private.example/?access_token=fake-secret'); };
  await assert.rejects(fetchSocialToken('https://provider.example', {}, 'instagram', 'token-refresh'),
    err => err.message === 'instagram-token-refresh-retryable');
  assert.equal(safeSocialCallbackError(new Error('fake-secret'), 'instagram'), 'instagram-connect-failed');
});

test('upload preflight remains disabled and separates OAuth lifecycle from project upload audit', () => {
  const connected = { channelId: 'UC123', brandKey: 'classmoon', scope: 'https://www.googleapis.com/auth/youtube.upload', tokenStatus: 'connected' };
  const result = getYouTubeUploadReadiness(connected);
  assert.equal(result.enabled, false);
  assert.equal(result.defaultVisibility, 'private');
  assert.ok(result.blockers.includes('durable-upload-idempotency-required'));
  assert.equal(result.projectUploadAudit, 'unverified');
  assert.ok(!result.blockers.includes('brand-mapping-required'));
  assert.ok(getYouTubeUploadReadiness(null).blockers.includes('channel-not-connected'));
});

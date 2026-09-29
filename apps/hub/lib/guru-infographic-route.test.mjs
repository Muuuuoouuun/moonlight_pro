import assert from 'node:assert/strict';
import { test } from 'node:test';
import nextConfig from '../next.config.mjs';
import { resolveRouteAccess } from './route-access.js';

const { GET } = await import('../app/api/hub/guidance-articles/[id]/infographic/route.js');

test('infographic route serves a registered card privately behind Hub auth', async () => {
  const path = '/api/hub/guidance-articles/sales-gap/infographic';
  assert.equal(resolveRouteAccess({ pathname: path, host: 'hub.example', secretConfigured: true, hasSession: false, allowLoopback: false }).action, 'unauthorized');
  assert.deepEqual(nextConfig.outputFileTracingIncludes['/api/hub/guidance-articles/*/infographic'], ['./content/guru/infographics/*.webp']);
  const response = await GET(new Request(`http://hub.test${path}`), { params: Promise.resolve({ id: 'sales-gap' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
});

test('infographic route rejects unknown IDs with a private error envelope', async () => {
  const response = await GET(new Request('http://hub.test/api/hub/guidance-articles/no-such-card/infographic'), { params: Promise.resolve({ id: 'no-such-card' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-type')?.startsWith('application/json'), true);
  assert.deepEqual(await response.json(), { status: 'error', reason: 'unknown-card' });
});

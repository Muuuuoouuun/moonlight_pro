import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/server') return next('next/server.js', context);
  return next(specifier, context);
} });
const { GET } = await import('../app/api/hub/guidance-articles/[id]/route.js');

test('the authenticated Hub reader returns one Markdown post with a private, no-store envelope', async () => {
  const response = await GET(new Request('http://hub.test/api/hub/guidance-articles/sales-gap'), { params: Promise.resolve({ id: 'sales-gap' }) });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(data.status, 'ok');
  assert.equal(data.id, 'sales-gap');
  assert.match(data.markdown, /^# /);
});

test('unknown article IDs keep the read-error envelope and return no file content', async () => {
  const response = await GET(new Request('http://hub.test/api/hub/guidance-articles/no-such-card'), { params: Promise.resolve({ id: 'no-such-card' }) });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'error');
  assert.equal(data.markdown, undefined);
});

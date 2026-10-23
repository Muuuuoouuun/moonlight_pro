import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import compression from 'next/dist/compiled/compression/index.js';
import { NodeNextRequest, NodeNextResponse } from 'next/dist/server/base-http/node.js';
import { sendResponse } from 'next/dist/server/send-response.js';
import nextConfig from '../next.config.mjs';

// Exercise the installed Next response adapter and compression middleware, not
// only the header declaration: array-valued Content-Type silently skips gzip.
async function serve(t, value) {
  const rules = await nextConfig.headers();
  const rule = rules.find(({ source }) => source === '/api/hub/revenue');
  const server = createServer((req, res) => {
    compression()(req, res, () => {
      for (const header of rule?.headers || []) res.setHeader(header.key, header.value);
      void sendResponse(new NodeNextRequest(req), new NodeNextResponse(res), Response.json(value));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (encoding) => new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${server.address().port}/api/hub/revenue`, {
      headers: encoding === undefined ? {} : { 'accept-encoding': encoding },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

for (const status of ['live', 'partial', 'preview', 'error']) {
  test(`revenue ${status} JSON uses negotiated gzip without changing its HTTP 200 envelope`, async (t) => {
    const data = { status, detail: '한글 압축 검증 '.repeat(200) };
    const read = await serve(t, data);
    const response = await read('gzip');
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-encoding'], 'gzip');
    assert.equal(response.headers['content-type'], 'application/json');
    assert.match(response.headers.vary, /\bAccept-Encoding\b/i);
    assert.deepEqual(JSON.parse(gunzipSync(response.body)), data);
    assert.ok(response.body.length < Buffer.byteLength(JSON.stringify(data)));
  });
}

test('revenue compression respects identity, gzip rejection, unsupported and absent encodings', async (t) => {
  const data = { status: 'live', detail: '전송 '.repeat(1000) };
  const read = await serve(t, data);
  for (const encoding of ['identity', 'gzip;q=0, identity', 'br', undefined]) {
    const response = await read(encoding);
    assert.equal(response.headers['content-encoding'], undefined, String(encoding));
    assert.deepEqual(JSON.parse(response.body), data);
  }
});

test('the response override stays on the exact revenue read path', async () => {
  const rules = await nextConfig.headers();
  const jsonRules = rules.filter(({ headers }) => headers.some(({ key }) => key.toLowerCase() === 'content-type'));
  assert.deepEqual(jsonRules.map(({ source }) => source), ['/api/hub/revenue']);
  assert.equal(nextConfig.compress, undefined, 'retain Next compression negotiation and streaming');
});

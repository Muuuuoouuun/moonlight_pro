import assert from 'node:assert/strict';
import { test } from 'node:test';

let http;
try { http = await import('./inquiry-http.ts'); } catch {}
const workspaceId = '11111111-1111-4111-8111-111111111111';
const config = [{ id: 'site-one', token: 'test-source-token', workspaceId, orgScope: 'personal', formIds: ['contact'] }];
const body = { eventId: 'submission-1', eventType: 'inquiry.created', formId: 'contact', submittedAt: '2026-09-12T10:00:00Z', contact: { email: 'buyer@example.com' }, message: '상담 요청합니다.', pageUrl: 'https://example.com/contact' };
const request = (data = body, headers = {}) => new Request('http://engine.local/api/intake/inquiries', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-inquiry-source': 'site-one', authorization: 'Bearer test-source-token', ...headers }, body: JSON.stringify(data),
});

test('webhook scopes intake from source registration and applies HTTP result semantics', async () => {
  assert.ok(http, 'inquiry HTTP boundary exists');
  for (const [status, code] of [['saved', 201], ['duplicate', 200], ['conflict', 409], ['invalid-input', 400], ['error', 502]]) {
    let received;
    const response = await http.handleInquiryIntake(request({ ...body, workspaceId: 'forged', orgScope: 'classin', brandId: 'forged' }), {
      sourceConfig: JSON.stringify(config), execute: async (command, context) => { received = { command, context }; return { status }; },
    });
    assert.equal(response.status, code);
    assert.equal(received.context.workspaceId, workspaceId);
    assert.equal(received.command.orgScope, 'personal');
    assert.equal(received.command.canonicalKey, 'form:site-one:contact:submission-1');
    assert.equal(received.command.sourceAccountKey, 'site-one');
    assert.equal(received.command.subject, '제목 없는 문의');
    assert.equal(received.command.brandId, undefined);
  }
});

test('webhook credentials remain mandatory in local open mode and unknown forms fail closed', async () => {
  assert.ok(http);
  const previous = process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS;
  process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = 'true';
  try {
    for (const [req, sourceConfig, code] of [
      [request(body, { authorization: '' }), JSON.stringify(config), 401],
      [request(body, { authorization: 'Bearer wrong' }), JSON.stringify(config), 401],
      [request(body, { 'x-inquiry-source': 'unknown' }), JSON.stringify(config), 401],
      [request({ ...body, formId: 'private' }), JSON.stringify(config), 403],
      [request(), 'not-json', 503], [request(), JSON.stringify([...config, config[0]]), 503],
    ]) {
      const response = await http.handleInquiryIntake(req, { sourceConfig, execute: async () => assert.fail('unauthorized request reached persistence') });
      assert.equal(response.status, code);
    }
  } finally { if (previous === undefined) delete process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS; else process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = previous; }
});

test('webhook rejects mismatched keys, absent reply channels, bad timestamps and unsafe URLs', async () => {
  assert.ok(http);
  for (const req of [
    request(body, { 'idempotency-key': 'different' }), request({ ...body, contact: { name: 'Name' } }),
    request({ ...body, eventType: 'task.created' }), request({ ...body, submittedAt: '2026-02-31T12:00:00Z' }),
    request({ ...body, pageUrl: 'javascript:alert(1)' }), request({ ...body, message: '' }),
    request({ ...body, contact: { email: ' ', phone: '\t' } }),
    request({ ...body, eventId: 'id:ambiguous' }),
  ]) {
    const response = await http.handleInquiryIntake(req, { sourceConfig: JSON.stringify(config), execute: async () => assert.fail('invalid intake reached persistence') });
    assert.equal(response.status, 400);
  }
});

test('bounded body reader counts UTF-8 bytes, aborts streaming excess and times out stalled bodies', async () => {
  assert.ok(http);
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new TextEncoder().encode('가'.repeat(100))); }, cancel() { cancelled = true; } });
  const tooLarge = await http.readInquiryJson(new Request('http://local', { method: 'POST', body: stream, duplex: 'half' }), { maxBytes: 500, timeoutMs: 100 });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.error, 'body-too-large');
  assert.equal(cancelled, true);
  const stalled = new ReadableStream({ start() {} });
  const timeout = await http.readInquiryJson(new Request('http://local', { method: 'POST', body: stalled, duplex: 'half' }), { maxBytes: 500, timeoutMs: 10 });
  assert.equal(timeout.error, 'body-timeout');
  const invalidUtf8 = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
  const invalid = await http.readInquiryJson(new Request('http://local', { method: 'POST', body: invalidUtf8, duplex: 'half' }));
  assert.equal(invalid.error, 'invalid-json');
});

test('internal command handler requires shared credentials and selects trusted workspace', async () => {
  assert.ok(http);
  let received;
  const options = { sharedSecret: 'internal-only', defaultWorkspaceId: workspaceId, execute: async (command, context) => { received = { command, context }; return { status: 'saved' }; } };
  const command = { action: 'claim_sync', accountKey: 'operator@example.com' };
  const unauth = await http.handleInquiryCommand(request(command), options);
  assert.equal(unauth.status, 401);
  const auth = await http.handleInquiryCommand(request(command, { 'x-com-moon-shared-secret': 'internal-only' }), options);
  assert.equal(auth.status, 200);
  assert.equal(received.context.workspaceId, workspaceId);
  const noConfig = await http.handleInquiryCommand(request(command), { ...options, sharedSecret: '' });
  assert.equal(noConfig.status, 503);
});

test('webhook preserves Korean, emoji and combining characters across UTF-8 stream boundaries', async () => {
  const text = '한글 👩🏽‍💻 🇰🇷 · 가'.normalize('NFD') + ' · cafe\u0301';
  const input = { ...body, subject: text, message: `${text}\n다음 줄`, contact: { name: text, email: 'buyer@example.com' } };
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of Buffer.from(JSON.stringify(input), 'utf8')) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const req = new Request(request().url, { method: 'POST', headers: request().headers, body: stream, duplex: 'half' });
  const response = await http.handleInquiryIntake(req, {
    sourceConfig: JSON.stringify(config), execute: async command => {
      assert.equal(command.subject, input.subject);
      assert.equal(command.body, input.message);
      assert.deepEqual(command.contact, { ...input.contact, phone: '' });
      return { status: 'saved', inquiry: { subject: command.subject, contact_name: command.contact.name } };
    },
  });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).inquiry, { subject: text, contact_name: text });
});

test('escaped lone surrogates are rejected before reaching PostgreSQL', async () => {
  for (const invalid of ['\ud800', '\udfff']) {
    for (const patch of [{ subject: invalid }, { message: invalid }, { contact: { name: invalid, email: 'buyer@example.com' } }]) {
      let persisted = false;
      const response = await http.handleInquiryIntake(request({ ...body, ...patch }), {
        sourceConfig: JSON.stringify(config), execute: async () => { persisted = true; return { status: 'saved' }; },
      });
      assert.equal(response.status, 400);
      assert.equal(persisted, false);
    }
  }
});

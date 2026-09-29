import assert from 'node:assert/strict';
import { test } from 'node:test';

const http = await import('./phone-capture-http.ts');

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-24T05:36:00Z');
const directory = {
  companies: [{ id: 'co-1', name: '해솔수학학원', phone: null }],
  contacts: [{ id: 'ct-1', name: '김해솔', phone: '010-1111-2222', company_id: 'co-1', kakao_names: null }],
  leads: [{ id: 'lead-1', name: '해솔수학학원', phone: null, company_id: 'co-1', contact_id: 'ct-1', status: 'new', kakao_names: null }],
  accounts: [],
};
const request = (body, headers = { 'x-com-moon-phone-secret': 'phone-secret' }) => new Request('http://engine.local/api/intake/phone-events', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

function harness(overrides = {}) {
  const stored = new Map();
  const calls = { store: 0, discard: [], afterStore: 0, directory: 0 };
  const deps = {
    secret: 'phone-secret',
    workspaceId: WORKSPACE,
    now: () => NOW,
    loadDirectory: async () => { calls.directory += 1; return directory; },
    store: async (row) => {
      calls.store += 1;
      if (stored.has(row.providerEventId)) return { status: 'duplicate' };
      stored.set(row.providerEventId, row);
      return { status: 'saved', id: `row-${stored.size}` };
    },
    countDiscard: async (type) => { calls.discard.push(type); },
    afterStore: async () => { calls.afterStore += 1; },
    ...overrides,
  };
  return { deps, stored, calls };
}

const call = { type: 'call', number: '010-1111-2222', direction: 'in', duration: '252', occurredAt: String(Date.parse('2026-09-24T05:32:10Z') / 1000) };

test('the phone secret is mandatory, constant-time compared, and never the open-webhook bypass', async () => {
  const previous = process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS;
  process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = 'true';
  try {
    const { deps, calls } = harness();
    for (const headers of [{}, { 'x-com-moon-phone-secret': 'wrong' }, { authorization: 'Bearer wrong' }, { 'x-com-moon-shared-secret': 'phone-secret' }]) {
      const response = await http.handlePhoneEventIntake(request(call, headers), deps);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { status: 'unauthorized', error: 'invalid-phone-secret', retryable: false });
    }
    assert.equal(calls.directory, 0, 'unauthenticated requests never read customers');
    const bearer = await http.handlePhoneEventIntake(request(call, { authorization: 'Bearer phone-secret' }), deps);
    assert.equal(bearer.status, 201);
    const unconfigured = await http.handlePhoneEventIntake(request(call), harness({ secret: '' }).deps);
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error, 'phone-intake-not-configured');
    const noWorkspace = await http.handlePhoneEventIntake(request(call), harness({ workspaceId: 'not-a-uuid' }).deps);
    assert.equal(noWorkspace.status, 503);
  } finally {
    if (previous === undefined) delete process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS;
    else process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = previous;
  }
});

test('a matched call is stored once as a pending candidate; the retry is a duplicate', async () => {
  const { deps, stored, calls } = harness();
  const first = await http.handlePhoneEventIntake(request(call), deps);
  assert.equal(first.status, 201);
  const body = await first.json();
  assert.equal(body.status, 'saved');
  assert.equal(body.notice, '김해솔 · 해솔수학학원 4분 통화 — 허브에서 기록할까요');
  const [row] = [...stored.values()];
  assert.equal(row.eventType, 'phone.call');
  assert.equal(row.payload.customer.key, 'lead:lead-1');
  assert.equal(row.payload.durationSec, 252);
  assert.equal(row.receivedAt, NOW.toISOString());
  assert.doesNotMatch(JSON.stringify(row), /1111-2222|01011112222/);
  assert.equal(calls.afterStore, 1);

  const retry = await http.handlePhoneEventIntake(request({ ...call, number: '+82 10-1111-2222' }), deps);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { status: 'duplicate' });
  assert.equal(stored.size, 1);
});

test('non-customers are discarded without content and only counted', async () => {
  const { deps, stored, calls } = harness();
  const response = await http.handlePhoneEventIntake(request({ type: 'sms', number: '010-9999-0000', text: '광고 문자' }), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { status: 'ignored', reason: 'not-a-customer' });
  assert.equal(stored.size, 0);
  assert.deepEqual(calls.discard, ['sms']);
  // 개수 저장이 실패해도 응답은 같다.
  const failing = harness({ countDiscard: async () => { throw new Error('down'); } });
  const again = await http.handlePhoneEventIntake(request({ type: 'kakao', title: '모르는 사람', text: 'hi' }), failing.deps);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).reason, 'not-a-customer');
});

test('missed calls are not candidates and never read the directory', async () => {
  const { deps, calls } = harness();
  for (const body of [{ ...call, direction: 'missed' }, { ...call, duration: '0' }]) {
    const response = await http.handlePhoneEventIntake(request(body), deps);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ignored', reason: 'no-conversation' });
  }
  assert.equal(calls.directory, 0);
  assert.deepEqual(calls.discard, []);
});

test('invalid bodies are 400; directory and store failures are honest retryable 502s', async () => {
  const { deps } = harness();
  for (const body of ['not json', { type: 'fax' }, { type: 'kakao' }, { ...call, occurredAt: '2026-09-01 10:00' }]) {
    const response = await http.handlePhoneEventIntake(request(body), deps);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).status, 'invalid-input');
  }
  const unreadable = await http.handlePhoneEventIntake(request(call), harness({ loadDirectory: async () => null }).deps);
  assert.equal(unreadable.status, 502);
  assert.deepEqual(await unreadable.json(), { status: 'error', error: 'customer-directory-read-failed', retryable: true });
  const unsaved = await http.handlePhoneEventIntake(request(call), harness({ store: async () => ({ status: 'failed', reason: 'http-500' }) }).deps);
  assert.equal(unsaved.status, 502);
  assert.equal((await unsaved.json()).status, 'failed');
  const thrown = await http.handlePhoneEventIntake(request(call), harness({ store: async () => { throw new Error('boom'); } }).deps);
  assert.equal(thrown.status, 502);
});

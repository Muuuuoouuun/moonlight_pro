// 라우트 + Supabase 저장 왕복: 폰 사건이 webhook_events 한 행(phone-capture·received)이 되고,
// 재전송은 유니크 위반 → duplicate, 고객이 아닌 사건은 하루 개수 행만 올린다.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

const route = await import('./route.ts');

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID', 'COM_MOON_PHONE_INTAKE_SECRET', 'COM_MOON_SHARED_WEBHOOK_SECRET'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let events, calls;

const tables = {
  leads: [{ id: 'lead-1', name: '해솔수학학원', phone: null, company_id: 'co-1', contact_id: 'ct-1', status: 'new', kakao_names: ['해솔원장'] }],
  customer_accounts: [],
  contacts: [{ id: 'ct-1', name: '김해솔', phone: '010-1111-2222', company_id: 'co-1', kakao_names: null }],
  companies: [{ id: 'co-1', name: '해솔수학학원', phone: null }],
};

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://phone.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WORKSPACE;
  process.env.COM_MOON_PHONE_INTAKE_SECRET = 'phone-secret';
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = 'hub-secret';
  events = []; calls = [];
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    const table = url.pathname.split('/').pop();
    const method = options.method || 'GET';
    calls.push({ table, method, params: Object.fromEntries(url.searchParams) });
    assert.equal(url.searchParams.get('workspace_id') ?? `eq.${WORKSPACE}`, `eq.${WORKSPACE}`, 'every request is workspace-scoped');
    if (table !== 'webhook_events') return Response.json(tables[table] || []);
    const field = (row, key) => (key === 'payload->>v' ? String(row.payload?.v) : row[key]);
    const eq = (row) => [...url.searchParams].every(([key, value]) => {
      if (['select', 'limit', 'order'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(field(row, key)) === value.slice(3);
      if (value.startsWith('lt.')) return String(field(row, key)) < value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(field(row, key)));
      return false;
    });
    if (method === 'POST') {
      const body = JSON.parse(options.body);
      if (events.some((row) => row.source === body.source && row.provider_event_id === body.provider_event_id)) {
        return Response.json({ code: '23505', message: 'duplicate key value violates unique constraint' }, { status: 409 });
      }
      const row = { id: `evt-${events.length + 1}`, ...body };
      events.push(row);
      return Response.json([{ id: row.id }], { status: 201 });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(options.body);
      const hit = events.filter(eq);
      hit.forEach((row) => Object.assign(row, body));
      return new Response(null, { status: 204 });
    }
    return Response.json(events.filter(eq));
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const post = (body, secret = 'phone-secret') => route.POST(new Request('http://engine.local/api/intake/phone-events', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-com-moon-phone-secret': secret },
  body: JSON.stringify(body),
}));

test('the Hub-to-Engine shared secret does not open the phone intake', async () => {
  const response = await post({ type: 'call', number: '010-1111-2222', duration: 60 }, 'hub-secret');
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('a customer kakao message becomes one pending webhook_events row; the retry is duplicate', async () => {
  // 라우트는 실제 시계를 쓴다 — 7일 보존 창 밖으로 밀려나지 않게 시각을 지금 기준으로 만든다.
  const occurredSec = Math.floor(Date.now() / 1000) - 120;
  const body = { type: 'kakao', title: '해솔원장', text: '다음 주 화요일 4시에 체험 수업 가능할까요?', occurredAt: String(occurredSec) };
  const first = await post(body);
  assert.equal(first.status, 201);
  assert.equal((await first.json()).status, 'saved');
  assert.equal(events.length, 1);
  const [row] = events;
  assert.equal(row.workspace_id, WORKSPACE);
  assert.equal(row.source, 'phone-capture');
  assert.equal(row.status, 'received');
  assert.equal(row.event_type, 'phone.kakao');
  assert.match(row.provider_event_id, /^phone:kakao:[0-9a-f]{40}$/);
  assert.equal(row.payload.customer.key, 'lead:lead-1');
  assert.equal(row.payload.matchedOn, 'alias');
  assert.equal(row.payload.occurredAt, new Date(occurredSec * 1000).toISOString());
  // 보존 정리 PATCH가 v=1 행만, 7일보다 오래된 것만 겨눈다.
  const sweep = calls.find((c) => c.method === 'PATCH');
  assert.equal(sweep.params.source, 'eq.phone-capture');
  assert.equal(sweep.params['payload->>v'], 'eq.1');
  assert.match(sweep.params.received_at, /^lt\./);

  const retry = await post(body);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).status, 'duplicate');
  assert.equal(events.filter((e) => e.event_type === 'phone.kakao').length, 1);
});

test('non-customer events leave only a content-free daily count', async () => {
  for (const body of [
    { type: 'sms', number: '010-9999-0000', text: '택배 도착 알림' },
    { type: 'call', number: '010-8888-0000', duration: '01:10' },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reason, 'not-a-customer');
  }
  assert.equal(events.length, 1);
  const [counter] = events;
  assert.equal(counter.event_type, 'phone.discarded');
  assert.equal(counter.status, 'processed');
  assert.match(counter.provider_event_id, /^discarded:\d{4}-\d{2}-\d{2}$/);
  assert.equal(counter.payload.count, 2);
  assert.equal(counter.payload.sms, 1);
  assert.equal(counter.payload.call, 1);
  assert.doesNotMatch(JSON.stringify(events), /택배|9999|8888/);
});

test('a failed customer read refuses to classify instead of discarding', async () => {
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  const response = await post({ type: 'call', number: '010-1111-2222', duration: 60 });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'customer-directory-read-failed');
});

test('unmatched call with captureUnmatched creates an unregistered lead candidate', async () => {
  const response = await post({
    type: 'call',
    number: '010-5555-7777',
    name: '신규 문의자',
    duration: 120,
    captureUnmatched: true,
  });
  assert.equal(response.status, 201);
  const json = await response.json();
  assert.equal(json.status, 'saved');
  const row = events.find((e) => e.event_type === 'phone.call');
  assert.ok(row);
  assert.equal(row.payload.customer.isUnregistered, true);
  assert.equal(row.payload.customer.phone, '010-5555-7777');
  assert.equal(row.payload.customer.name, '신규 문의자');
});

import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
const ledger = await import('./content-templates-ledger.js');
const workspace = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const originalFetch = globalThis.fetch;
const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID'];
const savedEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let rows, fail, dropAck;
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://content-templates.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspace;
  rows = []; fail = false; dropAck = false;
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    const body = options.body ? JSON.parse(options.body) : null;
    if (fail) return new Response('unavailable', { status: 503 });
    const matches = row => [...url.searchParams].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3));
    if (options.method === 'POST') {
      if (rows.some(row => row.id === body.id)) return Response.json({ code: '23505' }, { status: 409 });
      rows.push(body);
      return dropAck ? new Response('lost', { status: 504 }) : Response.json([body], { status: 201 });
    }
    if (options.method === 'PATCH') {
      const selected = rows.filter(matches);
      selected.forEach(row => Object.assign(row, body));
      return Response.json(selected);
    }
    if (options.method === 'DELETE') {
      const selected = rows.filter(matches);
      rows = rows.filter(row => !selected.includes(row));
      return Response.json(selected);
    }
    return Response.json(rows.filter(matches));
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  keys.forEach(key => savedEnv[key] === undefined ? delete process.env[key] : process.env[key] = savedEnv[key]);
});
const input = (patch = {}) => ({ id, name: '후킹 스레드', request: '첫 줄은 질문, 세 문단', skeleton: '훅\n\n공감\n\n사례\n\n한 줄 결론', expectedRevision: 0, ...patch });

test('create, list, update and delete stay inside the server workspace', async () => {
  const created = await ledger.saveContentTemplate(input({ workspaceId: 'untrusted' }));
  assert.equal(created.status, 'saved');
  assert.equal(created.template.revision, 1);
  assert.equal(rows[0].workspace_id, workspace);
  const listed = await ledger.listContentTemplates();
  assert.equal(listed.status, 'live');
  assert.deepEqual(listed.templates.map(t => t.name), ['후킹 스레드']);
  const updated = await ledger.saveContentTemplate(input({ request: '반말로', expectedRevision: 1 }));
  assert.equal(updated.template.request, '반말로');
  assert.equal(updated.template.revision, 2);
  assert.equal((await ledger.deleteContentTemplate({ id })).status, 'deleted');
  assert.equal(rows.length, 0);
  assert.equal((await ledger.deleteContentTemplate({ id })).status, 'deleted', 'repeat delete is idempotent');
});

test('stale updates conflict without overwriting; a lost create acknowledgment becomes duplicate', async () => {
  dropAck = true;
  assert.equal((await ledger.saveContentTemplate(input())).status, 'duplicate');
  dropAck = false;
  assert.equal((await ledger.saveContentTemplate(input({ request: 'stale', expectedRevision: 0 }))).status, 'conflict');
  assert.equal(rows[0].request, '첫 줄은 질문, 세 문단');
  await ledger.saveContentTemplate(input({ request: 'latest', expectedRevision: 1 }));
  const stale = await ledger.saveContentTemplate(input({ request: 'old tab', expectedRevision: 1 }));
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.template.request, 'latest');
});

test('rejects invalid input and reports preview or error honestly', async () => {
  for (const patch of [{ id: 'nope' }, { name: '   ' }, { name: '가'.repeat(61) }, { request: 'a'.repeat(2001) }, { skeleton: 'a'.repeat(4001) }, { request: '', skeleton: '' }, { expectedRevision: -1 }, { request: 'a\u0000' }]) {
    assert.equal((await ledger.saveContentTemplate(input(patch))).status, 'invalid-input', JSON.stringify(patch).slice(0, 40));
  }
  assert.equal(rows.length, 0);
  fail = true;
  assert.equal((await ledger.listContentTemplates()).status, 'error');
  delete process.env.SUPABASE_URL;
  assert.equal((await ledger.listContentTemplates()).status, 'preview');
  assert.equal((await ledger.saveContentTemplate(input())).status, 'error');
});

import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
const ledger = await import('./content-schedules-ledger.js');
const workspace = '11111111-1111-4111-8111-111111111111';
const contentId = '22222222-2222-4222-8222-222222222222';
const v1 = '33333333-3333-4333-8333-333333333331';
const v2 = '33333333-3333-4333-8333-333333333332';
const v3 = '33333333-3333-4333-8333-333333333333';
const kst = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h, min) - 9 * 3600 * 1000;
const iso = (t) => new Date(t).toISOString();
const originalFetch = globalThis.fetch;
const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID'];
const savedEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let tables, missingTable, variantReadFails;
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://content-schedules.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspace;
  tables = { content_schedules: [], content_variants: [{ id: v1, workspace_id: workspace, status: 'draft' }, { id: v2, workspace_id: workspace, status: 'published' }, { id: v3, workspace_id: workspace, status: 'draft' }] };
  missingTable = false; variantReadFails = false;
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    const table = url.pathname.split('/').pop();
    if (missingTable && table === 'content_schedules') return Response.json({ code: 'PGRST205' }, { status: 404 });
    if (variantReadFails && table === 'content_variants') return new Response('down', { status: 503 });
    const body = options.body ? JSON.parse(options.body) : null;
    const matches = (row) => [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'limit'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      if (value.startsWith('lte.')) return Date.parse(row[key]) <= Date.parse(value.slice(4));
      return true;
    });
    const rows = tables[table];
    if (options.method === 'POST') {
      if (rows.some(row => row.workspace_id === body.workspace_id && row.variant_id === body.variant_id)) return Response.json({ code: '23505' }, { status: 409 });
      rows.push({ ...body }); return Response.json([body], { status: 201 });
    }
    if (options.method === 'PATCH') { const hit = rows.filter(matches); hit.forEach(row => Object.assign(row, body)); return Response.json(hit); }
    return Response.json(rows.filter(matches));
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  keys.forEach(key => savedEnv[key] === undefined ? delete process.env[key] : process.env[key] = savedEnv[key]);
});
const now = kst(2026, 9, 29, 12, 0);
const input = (patch = {}) => ({ variantId: v1, contentId, scheduledAt: iso(now + 3600000), title: '복습이 안 되는 진짜 이유', channel: 'threads', expectedRevision: 0, ...patch });

test('set creates a schedule in the server workspace, retimes it with the revision, and reports conflicts', async () => {
  const created = await ledger.setContentSchedule(input({ workspaceId: 'untrusted' }), { now });
  assert.equal(created.status, 'saved');
  assert.equal(created.schedule.state, 'scheduled');
  assert.equal(tables.content_schedules[0].workspace_id, workspace);
  const moved = await ledger.setContentSchedule(input({ scheduledAt: iso(now + 7200000), expectedRevision: 1 }), { now });
  assert.equal(moved.schedule.revision, 2);
  const stale = await ledger.setContentSchedule(input({ scheduledAt: iso(now + 9000000), expectedRevision: 1 }), { now });
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.schedule.scheduledAt, iso(now + 7200000), 'the stale write did not overwrite');
  assert.equal((await ledger.setContentSchedule(input({ expectedRevision: 0 }), { now })).status, 'conflict', 'a second create for the same variant is a conflict');
  assert.equal(tables.content_schedules.length, 1);
});

test('invalid times are rejected with a plain reason and nothing is written', async () => {
  const past = await ledger.setContentSchedule(input({ scheduledAt: iso(now - 3600000) }), { now });
  assert.equal(past.status, 'invalid-input');
  assert.match(past.message, /지난 시각/);
  assert.equal((await ledger.setContentSchedule(input({ variantId: 'nope' }), { now })).status, 'invalid-input');
  assert.equal(tables.content_schedules.length, 0);
});

test('cancel keeps the row as history and is idempotent; reschedule revives it', async () => {
  await ledger.setContentSchedule(input(), { now });
  const cancelled = await ledger.cancelContentSchedule({ variantId: v1, expectedRevision: 1 }, { now });
  assert.equal(cancelled.status, 'saved');
  assert.equal(tables.content_schedules[0].status, 'cancelled');
  assert.equal((await ledger.cancelContentSchedule({ variantId: v1, expectedRevision: 1 }, { now })).status, 'duplicate');
  const revived = await ledger.setContentSchedule(input({ expectedRevision: 2 }), { now });
  assert.equal(revived.schedule.status, 'scheduled');
});

test('list scopes: action shows due and missed only; a published variant never shows as due', async () => {
  const due = iso(kst(2026, 9, 29, 9));
  tables.content_schedules.push(
    { workspace_id: workspace, variant_id: v1, content_id: contentId, title: 'due', channel: 'threads', scheduled_at: due, status: 'scheduled', revision: 1 },
    { workspace_id: workspace, variant_id: v2, content_id: contentId, title: 'already posted', channel: 'threads', scheduled_at: due, status: 'scheduled', revision: 1 },
    { workspace_id: workspace, variant_id: v3, content_id: contentId, title: 'later', channel: 'threads', scheduled_at: iso(now + 6 * 3600000), status: 'scheduled', revision: 1 },
  );
  const action = await ledger.listContentSchedules({ scope: 'action', now });
  assert.deepEqual(action.schedules.map(s => [s.title, s.state]), [['due', 'due']]);
  const upcoming = await ledger.listContentSchedules({ scope: 'upcoming', now });
  assert.deepEqual(upcoming.schedules.map(s => s.title), ['later']);
  const all = await ledger.listContentSchedules({ scope: 'all', now });
  assert.equal(all.schedules.find(s => s.title === 'already posted').state, 'published');
  variantReadFails = true;
  const failed = await ledger.listContentSchedules({ scope: 'action', now });
  assert.equal(failed.status, 'error', 'when publication cannot be verified, do not show a possibly-posted item as due');
});

test('a missing table before the migration reads as preview', async () => {
  missingTable = true;
  assert.equal((await ledger.listContentSchedules({ now })).status, 'preview');
  assert.equal((await ledger.sweepContentSchedules({ now })).status, 'preview');
});

test('nightly sweep marks unposted past-due schedules missed, corrects posted ones, and leaves later ones', async () => {
  const yesterday = iso(kst(2026, 9, 28, 21));
  const laterToday = iso(kst(2026, 9, 29, 23));
  tables.content_schedules.push(
    { workspace_id: workspace, variant_id: v1, content_id: contentId, title: 'missed', channel: 'threads', scheduled_at: yesterday, status: 'scheduled', revision: 1 },
    { workspace_id: workspace, variant_id: v2, content_id: contentId, title: 'posted', channel: 'threads', scheduled_at: yesterday, status: 'scheduled', revision: 1 },
    { workspace_id: workspace, variant_id: v3, content_id: contentId, title: 'not yet', channel: 'threads', scheduled_at: laterToday, status: 'scheduled', revision: 1 },
  );
  // 낮에 불러도 어제 밤 경계까지만 본다 — 오늘 09:00 예약은 낮에는 '놓침'이 아니다.
  tables.content_schedules.push({ workspace_id: workspace, variant_id: '33333333-3333-4333-8333-333333333334', content_id: contentId, title: 'today morning', channel: 'threads', scheduled_at: iso(kst(2026, 9, 29, 9)), status: 'scheduled', revision: 1 });
  tables.content_variants.push({ id: '33333333-3333-4333-8333-333333333334', workspace_id: workspace, status: 'draft' });
  const noon = await ledger.sweepContentSchedules({ now });
  assert.equal(noon.status, 'ok');
  assert.equal(noon.missed, 1);
  assert.equal(noon.published, 1);
  const byTitle = (title) => tables.content_schedules.find(row => row.title === title);
  assert.equal(byTitle('missed').status, 'missed');
  assert.equal(byTitle('posted').status, 'published');
  assert.equal(byTitle('today morning').status, 'scheduled', 'daytime overdue is not missed');
  assert.equal(byTitle('not yet').status, 'scheduled');
  // 밤 정리(22:00 이후)에는 오늘 09:00 예약이 놓침이 된다. 23:00 예약은 아직 아니다.
  const night = await ledger.sweepContentSchedules({ now: kst(2026, 9, 29, 22, 1) });
  assert.equal(night.missed, 1);
  assert.equal(byTitle('today morning').status, 'missed');
  assert.equal(byTitle('not yet').status, 'scheduled');
  assert.equal((await ledger.sweepContentSchedules({ now: kst(2026, 9, 29, 22, 2) })).missed, 0, 'idempotent');
  variantReadFails = true;
  tables.content_schedules.push({ workspace_id: workspace, variant_id: v1, content_id: contentId, title: 'again', channel: 'threads', scheduled_at: yesterday, status: 'scheduled', revision: 5 });
  tables.content_schedules.splice(tables.content_schedules.indexOf(byTitle('missed')), 1);
  assert.equal((await ledger.sweepContentSchedules({ now: kst(2026, 9, 29, 22, 3) })).status, 'error', 'without verification nothing is declared missed');
  assert.equal(byTitle('again').status, 'scheduled');
});

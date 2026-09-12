import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const migration = fileURLToPath(new URL('../../../supabase/migrations/20260913_0028_unified_inquiries.sql', import.meta.url));
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const base = (overrides = {}) => ({
  action: 'ingest', source: 'gmail', sourceAccountKey: 'operator@example.com', externalEventId: randomUUID(), threadId: randomUUID(),
  subject: '상담 문의', body: '도입 상담을 요청합니다.', contact: { email: 'buyer@example.com' },
  kind: 'sales', classification: 'inquiry', reason: 'quote', orgScope: 'unclassified', receivedAt: '2026-09-12T10:00:00Z', historical: false, ...overrides,
});

async function postgresBin() {
  for (const dir of [process.env.INQUIRY_TEST_PG_BIN, ...String(process.env.PATH).split(':'), '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean)) {
    try { await Promise.all(['initdb', 'pg_ctl', 'psql'].map(name => access(join(dir, name), constants.X_OK))); return dir; } catch {}
  }
  return null;
}

test('atomic inquiry PostgreSQL transactions', async t => {
  let source;
  try { source = await readFile(migration, 'utf8'); } catch {}
  assert.ok(source, 'unified inquiry migration exists');
  const bin = await postgresBin();
  if (!bin) { t.skip('Local PostgreSQL binaries unavailable; set INQUIRY_TEST_PG_BIN to run transaction tests'); return; }
  const root = await mkdtemp(join(tmpdir(), 'moon-inquiries-'));
  const data = join(root, 'data');
  let running = false;
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { encoding: 'utf8', input, timeout: 30000 });
    assert.equal(result.status, 0, `${name}: ${result.stderr || result.error || result.stdout}`);
    return result.stdout.trim();
  };
  const args = ['-X', '-A', '-t', '-h', root, '-p', '5432', '-U', userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = text => run('psql', args, text);
  const commandSql = (workspace, command) => `SET ROLE service_role; SELECT public.inquiry_command_v1(${quote(workspace)}::uuid, ${quote(JSON.stringify(command))}::jsonb);`;
  const call = (workspace, command) => JSON.parse(sql(commandSql(workspace, command)).split('\n').at(-1));
  const callAsync = (workspace, command) => new Promise((resolve, reject) => {
    const child = spawn(join(bin, 'psql'), args); let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(JSON.parse(out.trim().split('\n').at(-1))) : reject(new Error(err)));
    child.stdin.end(commandSql(workspace, command));
  });
  const workspace = () => { const id = randomUUID(); sql(`INSERT INTO workspaces(id) VALUES (${quote(id)});`); return id; };
  try {
    run('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-F -h '' -k ${root} -p 5432`, '-w', 'start']); running = true;
    sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE TABLE workspaces(id uuid PRIMARY KEY);
      CREATE TABLE leads(id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id));
      CREATE TABLE deals(id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id));
      CREATE TABLE operation_cases(id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id));`);
    sql(source);

    await t.test('Korean, emoji and decomposed Unicode survive ledger persistence and duplicate checks', () => {
      const w = workspace(), text = '한글 문의 👩🏽‍💻 🇰🇷 · 가'.normalize('NFD') + ' · cafe\u0301';
      const input = base({ subject: text, body: `${text}\n다음 줄`, contact: { name: text, email: 'buyer@example.com' } });
      const saved = call(w, input);
      assert.equal(saved.status, 'saved');
      assert.equal(saved.inquiry.subject, text);
      assert.equal(saved.inquiry.contact_name, text);
      assert.equal(saved.inquiry.unread, true);
      const event = JSON.parse(sql(`SELECT json_build_object('subject', subject, 'body', body, 'contact_name', contact->>'name') FROM inquiry_events WHERE workspace_id=${quote(w)}`));
      assert.deepEqual(event, { subject: text, body: input.body, contact_name: text });
      assert.equal(call(w, input).status, 'duplicate');
    });

    await t.test('same-key races yield one inquiry and changed payload is a conflict', async () => {
      const w = workspace(), input = base();
      const results = await Promise.all(Array.from({ length: 8 }, () => callAsync(w, input)));
      assert.equal(results.filter(r => r.status === 'saved').length, 1);
      assert.equal(results.filter(r => r.status === 'duplicate').length, 7);
      assert.equal(new Set(results.map(r => r.inquiry.id)).size, 1);
      assert.equal(sql(`SELECT count(*) FROM inquiry_events WHERE workspace_id=${quote(w)}`), '1');
      assert.equal(call(w, { ...input, body: 'Changed' }).status, 'conflict');
      assert.equal(sql(`SELECT body FROM inquiry_events WHERE workspace_id=${quote(w)}`), input.body);
    });

    await t.test('canonical mail and webhook deduplicate one logical arrival in either order', async () => {
      for (const reverse of [false, true]) {
        const w = workspace(), canonicalKey = 'form:site:contact:submission';
        const mail = base({ canonicalKey });
        const webhook = base({ canonicalKey, source: 'webhook', sourceAccountKey: 'site', threadId: null, body: 'Form body' });
        const [first, second] = reverse ? [webhook, mail] : [mail, webhook];
        const a = call(w, first), b = call(w, second);
        assert.equal(b.status, 'saved'); assert.equal(a.inquiry.id, b.inquiry.id);
        assert.equal(b.inquiry.last_inbound_seq, 1); assert.equal(b.inquiry.last_read_seq, 0);
        assert.deepEqual(b.inquiry.sources.sort(), ['gmail', 'webhook']);
        assert.equal(sql(`SELECT count(DISTINCT inbound_seq) FROM inquiry_events WHERE workspace_id=${quote(w)}`), '1');
      }
    });

    await t.test('read sequence preserves unseen reply and historical backfill never clears live unread', () => {
      const w = workspace(), input = base(), first = call(w, input);
      let row = call(w, base({ threadId: input.threadId })).inquiry;
      row = call(w, { action: 'mark_read', id: row.id, seenSeq: first.inquiry.last_inbound_seq }).inquiry;
      assert.equal(row.last_read_seq, 1); assert.equal(row.unread, true);
      row = call(w, { action: 'mark_read', id: row.id, seenSeq: 0 }).inquiry;
      assert.equal(row.last_read_seq, 1);
      row = call(w, base({ threadId: input.threadId, historical: true })).inquiry;
      assert.equal(row.last_inbound_seq, 2); assert.equal(row.last_read_seq, 1); assert.equal(row.unread, true);
      row = call(w, { action: 'mark_read', id: row.id, seenSeq: 900 }).inquiry;
      assert.equal(row.last_read_seq, 2); assert.equal(row.unread, false);
      const historical = call(w, base({ historical: true })).inquiry;
      assert.equal(historical.unread, false);
    });

    await t.test('simultaneous cross-source canonical arrivals share one inquiry while account identities stay separate', async () => {
      const w = workspace(), mail = base({ canonicalKey: 'form:site:form:race' });
      const webhook = base({ canonicalKey: mail.canonicalKey, source: 'webhook', sourceAccountKey: 'site', threadId: null });
      const result = await Promise.all([callAsync(w, mail), callAsync(w, webhook)]);
      assert.equal(result[0].inquiry.id, result[1].inquiry.id);
      assert.equal(sql(`SELECT count(*) FROM inquiries WHERE workspace_id=${quote(w)}`), '1');
      const otherAccount = call(w, base({ sourceAccountKey: 'second@example.com', threadId: mail.threadId }));
      assert.notEqual(otherAccount.inquiry.id, result[0].inquiry.id);
      const unrelated = call(w, base());
      assert.notEqual(unrelated.inquiry.id, result[0].inquiry.id);
    });

    await t.test('automatic replies preserve corrected fields and reopen closed/waiting but never ignored', () => {
      const w = workspace(), input = base(); let row = call(w, input).inquiry;
      for (const status of ['closed', 'waiting', 'ignored']) {
        row = call(w, { action: 'update', id: row.id, expectedUpdatedAt: row.updated_at, patch: { status, kind: 'support', contact_name: 'Correct name' } }).inquiry;
        row = call(w, base({ threadId: input.threadId, kind: 'general', contact: { name: 'Automatic', email: 'another@example.com' } })).inquiry;
        assert.equal(row.status, status === 'ignored' ? 'ignored' : 'in_progress');
        assert.equal(row.kind, 'support'); assert.equal(row.contact_name, 'Correct name'); assert.equal(row.contact_email, 'buyer@example.com');
      }
    });

    await t.test('CAS and workspace parent validation reject lost updates without partial writes', () => {
      const w = workspace(), other = workspace(), input = base(), a = call(w, input).inquiry;
      const b = call(w, { action: 'update', id: a.id, expectedUpdatedAt: a.updated_at, patch: { status: 'in_progress' } });
      assert.equal(b.status, 'saved');
      assert.equal(call(w, { action: 'update', id: a.id, expectedUpdatedAt: a.updated_at, patch: { status: 'closed' } }).status, 'conflict');
      const foreign = randomUUID(); sql(`INSERT INTO leads VALUES (${quote(foreign)},${quote(other)})`);
      const rejected = call(w, { action: 'update', id: a.id, expectedUpdatedAt: b.inquiry.updated_at, patch: { status: 'closed', lead_id: foreign } });
      assert.equal(rejected.status, 'invalid-input');
      assert.equal(sql(`SELECT status FROM inquiries WHERE id=${quote(a.id)}`), 'in_progress');
      assert.equal(call(other, { action: 'mark_read', id: a.id, seenSeq: 1 }).status, 'not-found');
      assert.equal(call(randomUUID(), input).status, 'invalid-input');
    });

    await t.test('split is idempotent, moves canonical evidence, and future thread replies follow split', () => {
      const w = workspace(), input = base(), first = call(w, input).inquiry;
      const second = base({ threadId: input.threadId, canonicalKey: 'form:site:form:split-me', receivedAt: '2026-09-12T11:00:00Z' });
      call(w, second); call(w, { ...second, source: 'webhook', sourceAccountKey: 'site', externalEventId: 'submission', threadId: null });
      const eventId = sql(`SELECT id FROM inquiry_events WHERE workspace_id=${quote(w)} AND external_event_id=${quote(second.externalEventId)}`);
      const command = { action: 'split', id: first.id, eventId, idempotencyKey: randomUUID() };
      const split = call(w, command);
      assert.equal(split.status, 'saved'); assert.notEqual(split.inquiry.id, first.id);
      assert.equal(call(w, command).inquiry.id, split.inquiry.id);
      assert.equal(call(w, { ...command, eventId: randomUUID() }).status, 'conflict');
      assert.equal(sql(`SELECT count(*) FROM inquiry_events WHERE inquiry_id=${quote(split.inquiry.id)}`), '2');
      assert.equal(sql(`SELECT received_at = '2026-09-12T10:00:00Z'::timestamptz FROM inquiries WHERE id=${quote(first.id)}`), 't');
      assert.equal(new Date(split.inquiry.received_at).toISOString(), '2026-09-12T11:00:00.000Z');
      assert.equal(call(w, base({ threadId: input.threadId })).inquiry.id, split.inquiry.id);
      assert.equal(call(w, { ...second, source: 'webhook', sourceAccountKey: 'site', externalEventId: 'submission' }).inquiry.id, split.inquiry.id);
      // Keep the high-water mark: an old detail's seenSeq must not read a later reply after splitting.
      assert.equal(sql(`SELECT last_inbound_seq FROM inquiries WHERE id=${quote(first.id)}`), '2');
    });

    await t.test('per-account leases fence stale owners, renew and preserve success/error history', async () => {
      const w = workspace(), accountKey = 'operator@example.com';
      const results = await Promise.all([callAsync(w, { action: 'claim_sync', accountKey }), callAsync(w, { action: 'claim_sync', accountKey })]);
      const claim = results.find(r => r.status === 'saved');
      assert.equal(results.filter(r => r.status === 'busy').length, 1); assert.ok(claim.leaseToken);
      const checkpoint = call(w, { action: 'save_sync', accountKey, leaseToken: claim.leaseToken, state: { cursor: '7', pending: ['8'] } });
      assert.equal(checkpoint.status, 'saved'); assert.equal(checkpoint.sync.last_success_at, null);
      const success = call(w, { action: 'save_sync', accountKey, leaseToken: claim.leaseToken, state: { cursor: '8' }, success: true });
      assert.ok(success.sync.last_success_at);
      const failed = call(w, { action: 'save_sync', accountKey, leaseToken: claim.leaseToken, state: { cursor: '8', pending: ['9'] }, success: false, error: 'gmail-fetch-failed' });
      assert.equal(failed.sync.last_success_at, success.sync.last_success_at);
      assert.equal(failed.sync.last_error, 'gmail-fetch-failed'); assert.deepEqual(failed.state, { cursor: '8', pending: ['9'] });
      sql(`UPDATE inquiry_sync_states SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE workspace_id=${quote(w)}`);
      assert.equal(call(w, { action: 'save_sync', accountKey, leaseToken: claim.leaseToken, state: { cursor: 'bad' } }).status, 'conflict');
      assert.equal(call(w, base({ accountKey, leaseToken: claim.leaseToken })).status, 'conflict');
      const next = call(w, { action: 'claim_sync', accountKey }); assert.notEqual(next.leaseToken, claim.leaseToken);
      assert.equal(call(w, base({ accountKey, leaseToken: next.leaseToken })).status, 'saved');
      assert.equal(call(w, { action: 'release_sync', accountKey, leaseToken: claim.leaseToken }).status, 'conflict');
      assert.deepEqual(next.state, failed.state);
      assert.equal(call(w, { action: 'release_sync', accountKey, leaseToken: next.leaseToken }).status, 'saved');
    });

    await t.test('late canonical evidence cannot undo the latest manual thread split', () => {
      const w = workspace(), original = base({ canonicalKey: 'form:site:contact:old' });
      const old = call(w, original).inquiry;
      const next = base({ threadId: original.threadId }); call(w, next);
      const splitEvent = sql(`SELECT id FROM inquiry_events WHERE workspace_id=${quote(w)} AND external_event_id=${quote(next.externalEventId)}`);
      const split = call(w, { action: 'split', id: old.id, eventId: splitEvent, idempotencyKey: randomUUID() });
      // An out-of-order notification email supplies evidence for an older submission.
      call(w, { ...original, externalEventId: 'late-evidence' });
      const reply = call(w, base({ threadId: original.threadId }));
      assert.equal(reply.inquiry.id, split.inquiry.id);
    });

    await t.test('malformed service-role commands are invalid and public roles cannot execute or read', () => {
      const w = workspace();
      for (const command of [null, [], {}, { action: 'mark_read', id: 'bad', seenSeq: 1 }, base({ contact: { email: [] } }), { action: 'save_sync', accountKey: 'x', leaseToken: 'bad', state: [] }]) {
        assert.equal(call(w, command).status, 'invalid-input');
      }
      assert.equal(sql("SELECT has_function_privilege('anon','public.inquiry_command_v1(uuid,jsonb)','EXECUTE')"), 'f');
      assert.equal(sql("SELECT has_function_privilege('authenticated','public.inquiry_command_v1(uuid,jsonb)','EXECUTE')"), 'f');
      assert.equal(sql("SELECT has_table_privilege('authenticated','public.inquiries','SELECT')"), 'f');
      assert.equal(sql("SELECT count(*) FROM pg_class WHERE relname IN ('inquiries','inquiry_events','inquiry_sync_states') AND relrowsecurity"), '3');
    });
  } finally {
    if (running) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8', timeout: 10000 });
    await rm(root, { recursive: true, force: true });
  }
});

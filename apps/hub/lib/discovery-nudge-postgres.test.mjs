// macOS: LC_ALL 이 없으면 postmaster 가 기동 중 multithreaded 로 판정되어
// `FATAL: postmaster became multithreaded during startup` 으로 죽는다 (2026-09-19).
// DB 로케일은 initdb --no-locale 로 이미 C 이므로 동작은 바뀌지 않는다.
import assert from 'node:assert/strict';
import { execFileSync, execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const discoveryMigration = new URL('../../../supabase/migrations/20260913_0029_opportunity_discovery.sql', import.meta.url);
const migration = new URL('../../../supabase/migrations/20260913_0031_discovery_nudges.sql', import.meta.url);
const available = process.getuid?.() !== 0 && ['initdb', 'pg_ctl', 'psql'].every(bin => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0);
const W = '11111111-1111-4111-8111-111111111111', O = '22222222-2222-4222-8222-222222222222';
const uuid = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const base = { title: '검증 기회', status: 'captured', evidence: '', hypothesis: '', experiment: '', findings: '', reviewDate: null, links: [] };

test('discovery nudge migration is delivered', () => assert.equal(existsSync(migration), true));
test('discovery nudges in real PostgreSQL', { skip: available ? false : 'PostgreSQL binaries and non-root user required' }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'discovery-nudge-pg-')), data = join(directory, 'data');
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', '55497', '-U', 'nudge_test', '-d', 'postgres'];
  const sql = source => execFileSync('psql', args, { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const json = source => JSON.parse(sql(source));
  const readSql = (id = 1, workspace = W) => `select public.read_discovery_nudge_v1('${workspace}', '${uuid(id)}');`;
  const read = (id = 1, workspace = W) => json(readSql(id, workspace));
  const seed = (id, patch = {}, workspace = W) => sql(`insert into public.discovery_records(id,workspace_id,snapshot,revision) values('${uuid(id)}','${workspace}',${lit(JSON.stringify({ ...base, ...patch }))}::jsonb,1);`);
  const update = (id, patch) => sql(`update public.discovery_records set snapshot=snapshot||${lit(JSON.stringify(patch))}::jsonb, revision=revision+1 where id='${uuid(id)}';`);
  const saveSql = payload => `select public.save_discovery_nudge_v1('${W}',${lit(JSON.stringify(payload))}::jsonb);`;
  let request = 1000;
  const input = (id, patch = {}) => {
    const { context } = read(id);
    return { recordId: uuid(id), requestId: uuid(request++), expectedRevision: context.stateRevision, triggerKey: context.candidate?.triggerKey ?? null, action: 'dismiss', until: null, ...patch };
  };
  const save = (id, patch = {}) => json(saveSql(input(id, patch)));
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-U', 'nudge_test', '-A', 'trust', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    execFileSync('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-F -k ${directory} -p 55497 -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } }); started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls; create role stranger;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant execute on functions to service_role;
      create table public.workspaces(id uuid primary key); insert into public.workspaces values('${W}'),('${O}');
      create table public.tasks(id uuid primary key,workspace_id uuid,title text,status text,updated_at timestamptz);
      create table public.projects(id uuid primary key,workspace_id uuid,name text);
      create table public.leads(id uuid primary key,workspace_id uuid,name text);
      create table public.deals(id uuid primary key,workspace_id uuid,title text);
      insert into public.tasks values('${uuid(900)}','${W}','인터뷰','done','2026-09-10T04:00:00Z'),('${uuid(901)}','${O}','외부','done',now()),('${uuid(902)}','${W}','예정','todo',now());`);
    sql(readFileSync(discoveryMigration, 'utf8'));
    assert.equal(existsSync(migration), true, 'nudge RPC migration must exist');
    const source = readFileSync(migration, 'utf8'); sql(source);
    const today = sql("select (now() at time zone 'Asia/Seoul')::date;"), tomorrow = sql("select (now() at time zone 'Asia/Seoul')::date+1;"), maxDate = sql("select (now() at time zone 'Asia/Seoul')::date+365;");
    const taskLinks = [{ type: 'task', id: uuid(900) }];

    await t.test('read follows priority, actual task completion and field resolution without creating state', () => {
      seed(1, { reviewDate: today, experiment: '인터뷰', links: taskLinks });
      const first = read();
      assert.deepEqual(Object.keys(first.context).sort(), ['recordId', 'recordRevision', 'stateRevision', 'today', 'candidate', 'suppression', 'visible'].sort());
      assert.equal(first.status, 'live'); assert.equal(first.context.today, today); assert.equal(first.context.stateRevision, 0);
      assert.equal(first.context.candidate.ruleId, 'review'); assert.equal(first.context.candidate.field, 'reviewDate'); assert.equal(first.context.visible, true);
      update(1, { reviewDate: tomorrow }); assert.equal(read().context.candidate.ruleId, 'result'); assert.equal(read().context.candidate.field, 'findings');
      update(1, { findings: '관찰함' }); assert.equal(read().context.candidate.ruleId, 'evidence');
      update(1, { evidence: '반복 문의' }); assert.equal(read().context.candidate.ruleId, 'hypothesis');
      update(1, { hypothesis: '시간 단축', experiment: '' }); assert.equal(read().context.candidate.ruleId, 'experiment');
      update(1, { experiment: '테스트', reviewDate: null }); assert.equal(read().context.candidate.ruleId, 'decision');
      update(1, { reviewDate: tomorrow }); assert.equal(read().context.candidate, null);
      seed(2, { links: taskLinks }); assert.equal(read(2).context.candidate.ruleId, 'result');
      update(2, { links: [] }); assert.equal(read(2).context.candidate.ruleId, 'evidence');
      update(2, { experiment: '실험', links: [{ type: 'task', id: uuid(901) }, { type: 'task', id: uuid(902) }] }); assert.equal(read(2).context.candidate.ruleId, 'evidence');
      assert.equal(sql('select count(*) from public.discovery_nudge_states;'), '0');
    });
    await t.test('closed has no nudge; paused still allows due review and result only', () => {
      seed(3, { status: 'closed', reviewDate: today, experiment: '인터뷰', links: taskLinks }); assert.equal(read(3).context.candidate, null);
      update(3, { status: 'paused' }); assert.equal(read(3).context.candidate.ruleId, 'review');
      update(3, { reviewDate: null }); assert.equal(read(3).context.candidate.ruleId, 'result');
      update(3, { findings: '결과' }); assert.equal(read(3).context.candidate, null); assert.equal(read(3).context.visible, false);
    });
    await t.test('dismissed top candidate stays hidden through unrelated edits and changes on new trigger', () => {
      seed(4, { reviewDate: today });
      const original = read(4).context;
      const dismissed = save(4); assert.equal(dismissed.status, 'saved'); assert.equal(dismissed.context.stateRevision, 1);
      assert.equal(dismissed.context.candidate.ruleId, 'review'); assert.equal(dismissed.context.visible, false);
      assert.deepEqual(dismissed.context.suppression, { kind: 'dismissed', until: null });
      update(4, { title: '제목 수정', hypothesis: '관련 없는 보강' });
      assert.equal(read(4).context.candidate.triggerKey, original.candidate.triggerKey); assert.equal(read(4).context.visible, false);
      update(4, { reviewDate: '2026-01-01' }); assert.notEqual(read(4).context.candidate.triggerKey, original.candidate.triggerKey); assert.equal(read(4).context.visible, true);
      assert.equal(read(4).context.suppression, null);
      update(4, { reviewDate: tomorrow }); assert.equal(read(4).context.candidate.ruleId, 'evidence'); assert.equal(read(4).context.visible, true);
      assert.equal(sql(`select revision from public.discovery_records where id='${uuid(4)}';`), '4');
    });
    await t.test('result trigger includes experiment and actual completed task updates, ignores title and task order', () => {
      seed(5, { experiment: '인터뷰', links: taskLinks }); const key = read(5).context.candidate.triggerKey;
      save(5); update(5, { title: '제목 변경', links: [{ type: 'task', id: uuid(902) }, ...taskLinks] });
      assert.equal(read(5).context.candidate.triggerKey, key); assert.equal(read(5).context.visible, false);
      sql(`update public.tasks set updated_at=updated_at+interval '1 second' where id='${uuid(900)}';`);
      assert.equal(read(5).context.visible, true); assert.notEqual(read(5).context.candidate.triggerKey, key);
      save(5); update(5, { experiment: '새 실험' }); assert.equal(read(5).context.visible, true);
      update(5, { findings: '결과' }); assert.equal(read(5).context.candidate.ruleId, 'evidence');
    });
    await t.test('snooze covers changing candidates until date and resume clears state', () => {
      seed(6); const result = save(6, { action: 'snooze', until: tomorrow });
      assert.deepEqual(result.context.suppression, { kind: 'snoozed', until: tomorrow }); assert.equal(result.context.visible, false);
      update(6, { reviewDate: today }); assert.equal(read(6).context.candidate.ruleId, 'review'); assert.equal(read(6).context.visible, false);
      const resumed = save(6, { action: 'resume', triggerKey: null }); assert.equal(resumed.status, 'saved'); assert.equal(resumed.context.stateRevision, 2); assert.equal(resumed.context.visible, true); assert.equal(resumed.context.suppression, null);
      assert.equal(save(6, { action: 'snooze', until: maxDate }).status, 'saved');
      sql(`update public.discovery_nudge_states set snoozed_until='${today}' where record_id='${uuid(6)}';`);
      assert.equal(read(6).context.visible, true); assert.equal(read(6).context.suppression, null);
      update(6, { status: 'closed' }); assert.equal(save(6, { action: 'resume', triggerKey: null }).status, 'saved');
    });
    await t.test('duplicates retain immutable receipt while returning current context, even after selected date passes', () => {
      seed(7); const payload = input(7); const first = json(saveSql(payload));
      const receipt = sql(`select response from public.discovery_nudge_receipts where request_id='${payload.requestId}';`);
      save(7, { action: 'resume', triggerKey: null }); update(7, { title: '새 제목' });
      const duplicate = json(saveSql(payload)); assert.equal(duplicate.status, 'duplicate'); assert.equal(duplicate.context.stateRevision, 2); assert.equal(duplicate.context.recordRevision, 2); assert.equal(duplicate.context.visible, true);
      assert.equal(sql(`select response from public.discovery_nudge_receipts where request_id='${payload.requestId}';`), receipt);
      assert.equal(JSON.parse(receipt).context.stateRevision, first.context.stateRevision);
      const reused = json(saveSql({ ...payload, action: 'resume', triggerKey: null })); assert.equal(reused.status, 'conflict'); assert.equal(reused.context.stateRevision, 2);
      const snooze = input(7, { action: 'snooze', until: tomorrow }); assert.equal(json(saveSql(snooze)).status, 'saved');
      // Simulate a request whose chosen date has passed; replay must consult its receipt before future-date validation.
      sql(`update public.discovery_nudge_receipts set request_payload=jsonb_set(request_payload,'{until}',to_jsonb('${today}'::text)) where request_id='${snooze.requestId}';`);
      assert.equal(json(saveSql({ ...snooze, until: today })).status, 'duplicate');
    });
    await t.test('reused request conflicts describe the requested record without foreign context', () => {
      seed(14); seed(15); seed(16, {}, O);
      const payload = input(14); assert.equal(json(saveSql(payload)).status, 'saved');
      save(15); update(15, { evidence: '새 근거' });
      const requested = json(saveSql({ ...payload, recordId: uuid(15) }));
      assert.equal(requested.status, 'conflict'); assert.deepEqual(requested.context, read(15).context);
      for (const id of [16, 999]) assert.deepEqual(json(saveSql({ ...payload, recordId: uuid(id) })), { status: 'invalid-input', context: null });
      assert.equal(sql(`select count(*) from public.discovery_nudge_receipts where request_id='${payload.requestId}';`), '1');
      assert.equal(json(saveSql(payload)).status, 'duplicate');
    });
    await t.test('resume requires a null trigger and invalid trigger characters are rejected', () => {
      seed(17); const payload = input(17);
      assert.deepEqual(json(saveSql({ ...payload, action: 'resume' })), { status: 'invalid-input', context: null });
      for (const triggerKey of ['space key', 'key.with.dot', '한글', 'key\n', '/key', 'key@', 'x'.repeat(129)]) {
        assert.deepEqual(json(saveSql({ ...payload, triggerKey })), { status: 'invalid-input', context: null });
      }
      assert.equal(json(saveSql({ ...payload, triggerKey: 'Az09:_-' })).status, 'conflict');
      assert.equal(json(saveSql({ ...payload, triggerKey: 'x'.repeat(128) })).status, 'conflict');
      assert.equal(read(17).context.stateRevision, 0);
    });
    await t.test('stale revisions and stale candidates conflict without record edits', () => {
      seed(8); const payload = input(8); save(8);
      assert.equal(json(saveSql(payload)).status, 'conflict');
      const stale = input(8); update(8, { evidence: '보강' }); const conflict = json(saveSql(stale));
      assert.equal(conflict.status, 'conflict'); assert.equal(conflict.context.candidate.ruleId, 'hypothesis'); assert.equal(conflict.context.stateRevision, 1);
      assert.equal(sql(`select count(*) from public.discovery_nudge_receipts where record_id='${uuid(8)}';`), '1');
      assert.equal(sql(`select count(*) from public.discovery_revisions where record_id='${uuid(8)}';`), '0');
    });
    await t.test('strict direct RPC JSON, date and integer validation do not mutate', () => {
      seed(9); const payload = input(9);
      const malformed = [null, [], { ...payload, extra: true }, Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'until')),
        ...[{ recordId: null }, { recordId: 'bad' }, { requestId: 'bad' }, { expectedRevision: null }, { expectedRevision: '0' }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: 9007199254740991 }, { expectedRevision: 1e100 }, { triggerKey: null }, { triggerKey: '' }, { triggerKey: 'x'.repeat(129) }, { triggerKey: [] }, { action: null }, { action: 'hide' }, { until: tomorrow }, { action: 'resume', until: tomorrow }, { action: 'snooze', until: null }, { action: 'snooze', until: today }, { action: 'snooze', until: '2026-02-30' }, { action: 'snooze', until: '2027-1-1' }, { action: 'snooze', until: '9999-12-31' }, { action: 'snooze', until: true }].map(patch => ({ ...payload, ...patch }))];
      for (const item of malformed) assert.equal(json(saveSql(item)).status, 'invalid-input', JSON.stringify(item));
      assert.equal(sql(`select count(*) from public.discovery_nudge_states where record_id='${uuid(9)}';`), '0');
      assert.equal(sql(`select count(*) from public.discovery_nudge_receipts where record_id='${uuid(9)}';`), '0');
    });
    await t.test('absent and foreign workspace records disclose no private context', () => {
      seed(10, { title: '다른 업무' }, O);
      for (const id of [10, 999]) {
        assert.deepEqual(read(id), { status: 'error', context: null });
        const result = json(saveSql({ recordId: uuid(id), requestId: uuid(request++), expectedRevision: 0, triggerKey: 'evidence:fake', action: 'dismiss', until: null }));
        assert.equal(result.context, null); assert.equal(result.status, 'invalid-input');
      }
      assert.deepEqual(read(1, O), { status: 'error', context: null });
      assert.deepEqual(json(`select public.read_discovery_nudge_v1(null,'${uuid(1)}');`), { status: 'error', context: null });
    });
    await t.test('concurrent distinct edits serialize, same request replays a single receipt', async () => {
      seed(11); seed(12);
      const run = async payload => JSON.parse((await promisify(execFile)('psql', [...args, '-c', saveSql(payload)])).stdout.trim());
      const results = await Promise.all([run(input(11)), run(input(11))]); assert.deepEqual(results.map(value => value.status).sort(), ['conflict', 'saved']);
      const payload = input(12); const retries = await Promise.all([run(payload), run(payload), run(payload)]);
      assert.deepEqual(retries.map(value => value.status).sort(), ['duplicate', 'duplicate', 'saved']);
      assert.equal(sql(`select revision from public.discovery_nudge_states where record_id='${uuid(12)}';`), '1');
      assert.equal(sql(`select count(*) from public.discovery_nudge_receipts where record_id='${uuid(12)}';`), '1');
    });
    await t.test('receipt failure rolls back suppression and revision atomically', () => {
      seed(13); sql(`create function public.fail_nudge_receipt() returns trigger language plpgsql as $$ begin raise exception 'test'; end $$; create trigger fail before insert on public.discovery_nudge_receipts for each row execute function public.fail_nudge_receipt();`);
      assert.throws(() => save(13)); sql('drop trigger fail on public.discovery_nudge_receipts;');
      assert.equal(read(13).context.stateRevision, 0); assert.equal(read(13).context.visible, true);
    });
    await t.test('RLS and service-only read/RPC privileges survive inherited grants and repeated migration', () => {
      const tables = ['discovery_nudge_states', 'discovery_nudge_receipts'];
      for (const role of ['anon', 'authenticated', 'stranger']) {
        for (const fn of ['read_discovery_nudge_v1(uuid,uuid)', 'save_discovery_nudge_v1(uuid,jsonb)']) assert.equal(sql(`select has_function_privilege('${role}','public.${fn}','EXECUTE');`), 'f');
        for (const table of tables) assert.equal(sql(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE');`), 'f');
        assert.throws(() => sql(`set role ${role};${readSql()}`));
      }
      for (const table of tables) {
        assert.equal(sql(`select has_table_privilege('service_role','public.${table}','SELECT');`), 't');
        assert.equal(sql(`select has_table_privilege('service_role','public.${table}','INSERT,UPDATE,DELETE');`), 'f');
        assert.throws(() => sql(`set role service_role;delete from public.${table};`));
      }
      assert.equal(sql("select bool_and(relrowsecurity) from pg_class where relname in ('discovery_nudge_states','discovery_nudge_receipts');"), 't');
      assert.equal(json(`set role service_role;${readSql()}`).status, 'live');
      assert.equal(json(`set role service_role;${saveSql(input(9))}`).status, 'saved');
      // All non-entrypoint helpers for this feature must be private, including service_role.
      assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%discovery_nudge%' and p.proname not in ('read_discovery_nudge_v1','save_discovery_nudge_v1','fail_nudge_receipt') and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'));"), '0');
      sql(source); assert.equal(read(9).context.stateRevision, 1);
    });
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    rmSync(directory, { recursive: true, force: true });
  }
});

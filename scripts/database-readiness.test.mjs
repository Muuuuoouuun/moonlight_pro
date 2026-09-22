import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DATABASE_FEATURES, featureChecks, readinessSql, summarizeReadiness } from './database-readiness.mjs';

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);
const rowsFor = (features, patch = () => ({})) => features.flatMap(f => featureChecks(f).map(c => ({ migration: f.migration, ...c, present: true, protected: true, ...patch(c) })));
const readyRows = () => rowsFor(DATABASE_FEATURES);
const featureOf = (summary, name) => summary.find(f => f.feature === name);

test('an absent RPC, missing result row or public execute permission prevents readiness', () => {
  const rows = readyRows();
  assert.ok(summarizeReadiness(rows).every(f => f.ready));
  for (const broken of [rows.slice(1), rows.map((r,i) => i === 0 ? { ...r, present: false } : r), rows.map((r,i) => i === rows.length - 1 ? { ...r, protected: false } : r)]) {
    assert.ok(summarizeReadiness(broken).some(f => !f.ready));
  }
  assert.ok(summarizeReadiness([]).every(f => !f.ready));
  assert.throws(() => summarizeReadiness(null));
});

test('rows in the pre-extension shape (no subject/detail) still satisfy table and function checks', () => {
  const legacy = DATABASE_FEATURES.flatMap(f => [
    ...f.tables.map(name => ({ migration: f.migration, kind: 'table', name, present: true, protected: true })),
    ...f.functions.map(name => ({ migration: f.migration, kind: 'function', name, present: true, protected: true })),
  ]);
  for (const feature of summarizeReadiness(legacy)) {
    const versioned = featureChecks(DATABASE_FEATURES.find(f => f.name === feature.feature)).some(c => c.kind !== 'table' && c.kind !== 'function');
    assert.equal(feature.ready, !versioned, feature.feature);
  }
  assert.deepEqual(featureOf(summarizeReadiness(legacy.map(r => r.name === 'office_requests' ? { ...r, protected: false } : r)), 'Office 업무 연결').missingOrUnprotected, ['office_requests']);
});

// One synthetic feature per check kind so each failure mode is isolated.
const SYNTHETIC = [
  { name: '본문 포함', migration: 'a.sql', tables: [], functions: [], bodyIncludes: [['probe_v1(uuid)', 'sha256(convert_to']] },
  { name: '본문 제외', migration: 'b.sql', tables: [], functions: [], bodyExcludes: [['probe_v1(uuid)', 'digest(']] },
  { name: '제약 포함', migration: 'c.sql', tables: [], functions: [], constraintIncludes: [['probe', 'probe_kind_check', "'b'"]] },
  { name: '쓰기 금지', migration: 'd.sql', tables: [], functions: [], tableNoWrite: [['probe', 'service_role']] },
];
const FAILURES = {
  '본문 포함': { absent: 'probe_v1(uuid) 없음', failed: 'probe_v1 본문에 "sha256(convert_to" 없음 (이전 버전)' },
  '본문 제외': { absent: 'probe_v1(uuid) 없음', failed: 'probe_v1 본문에 "digest(" 남음 (이전 버전)' },
  '제약 포함': { absent: 'probe.probe_kind_check 없음', failed: "probe.probe_kind_check에 'b' 없음 (이전 버전)" },
  '쓰기 금지': { absent: 'probe 없음', failed: 'probe: service_role 직접 쓰기 권한 남음' },
};

test('version checks: each kind is ready only when its object exists and its check passes', () => {
  const ready = rowsFor(SYNTHETIC);
  assert.deepEqual(summarizeReadiness(ready, SYNTHETIC).map(f => [f.feature, f.ready, f.missingOrUnprotected]), SYNTHETIC.map(f => [f.name, true, []]));
  for (const feature of SYNTHETIC) {
    const own = row => row.migration === feature.migration;
    const cases = {
      absent: ready.map(r => own(r) ? { ...r, present: false, protected: false } : r),
      failed: ready.map(r => own(r) ? { ...r, protected: false } : r),
      noRow: ready.filter(r => !own(r)),
    };
    for (const [mode, rows] of Object.entries(cases)) {
      const summary = summarizeReadiness(rows, SYNTHETIC);
      assert.deepEqual(summary.filter(f => !f.ready).map(f => f.feature), [feature.name], `${feature.name} · ${mode}`);
      assert.deepEqual(featureOf(summary, feature.name).missingOrUnprotected, [FAILURES[feature.name][mode === 'noRow' ? 'absent' : mode]], `${feature.name} · ${mode}`);
    }
    // A row for another marker, constraint or role of the same object does not stand in for this check.
    for (const field of ['subject', 'detail'].filter(key => featureChecks(feature)[0][key])) {
      const retargeted = ready.map(r => own(r) ? { ...r, [field]: r[field] + 'x' } : r);
      assert.equal(featureOf(summarizeReadiness(retargeted, SYNTHETIC), feature.name).ready, false, `${feature.name} · other ${field}`);
    }
  }
  // bodyExcludes never passes vacuously: a missing function is not "free of" the old marker.
  assert.equal(featureOf(summarizeReadiness(ready.map(r => ({ ...r, present: false })), SYNTHETIC), '본문 제외').ready, false);
});

test('readinessSql emits one quoted row per check and stays a single SELECT', () => {
  const sql = readinessSql();
  const total = DATABASE_FEATURES.reduce((n, f) => n + featureChecks(f).length, 0);
  assert.equal([...sql.matchAll(/\('20\d{6}_\d{4}_[a-z0-9_]+\.sql','/g)].length, total);
  assert.ok(sql.includes(`'body_includes','content_workflow_v1(uuid,uuid,text,jsonb)','','v_variant.meta ? ''performance'''`), 'markers are quoted');
  const code = sql.replace(/'(?:[^']|'')*'/g, "''");
  assert.match(code, /^with /); assert.doesNotMatch(code, /;|\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|set)\b/i);
});

// A migration's copy of a function body (last definition in the file) and of a named constraint statement.
const bodyOf = (sql, signature) => [...sql.matchAll(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${signature.split('(')[0]}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi'))].at(-1)?.[1];
const constraintOf = (sql, name) => [...sql.matchAll(new RegExp(`alter\\s+table[^;]*?add\\s+constraint\\s+${name}\\b[^;]*;`, 'gi'))].at(-1)?.[0];

test('every version marker is in its migration, absent from the version it replaces, and holds after all migrations', async () => {
  const files = (await readdir(MIGRATIONS)).filter(n => n.endsWith('.sql')).sort();
  const text = new Map(await Promise.all(files.map(async n => [n, await readFile(new URL(n, MIGRATIONS), 'utf8')])));
  const order = DATABASE_FEATURES.map(f => f.migration);
  assert.deepEqual(order, [...order].sort(), 'features stay in filename (apply) order');
  for (const migration of order) assert.ok(text.has(migration), `${migration} exists`);
  const last = (names, read) => names.map(n => read(text.get(n))).filter(Boolean).at(-1);
  const before = migration => files.filter(n => n < migration);
  for (const f of DATABASE_FEATURES) {
    const own = text.get(f.migration);
    for (const [kind, [signature, marker]] of [...(f.bodyIncludes ?? []).map(c => ['includes', c]), ...(f.bodyExcludes ?? []).map(c => ['excludes', c])]) {
      const body = bodyOf(own, signature), previous = last(before(f.migration), s => bodyOf(s, signature)), final = last(files, s => bodyOf(s, signature));
      assert.ok(body && previous, `${f.migration} redefines ${signature}`);
      const has = kind === 'includes';
      assert.equal(body.includes(marker), has, `${f.migration}: ${marker}`);
      assert.equal(previous.includes(marker), !has, `${f.migration}: the replaced version must differ on ${marker}`);
      assert.equal(final.includes(marker), has, `${signature}: a later migration undoes ${f.migration}`);
    }
    for (const [table, name, marker] of f.constraintIncludes ?? []) {
      const statement = constraintOf(own, name), previous = last(before(f.migration), s => constraintOf(s, name)), final = last(files, s => constraintOf(s, name));
      assert.ok(statement?.includes(table) && statement.includes(marker), `${f.migration} adds ${name} with ${marker}`);
      assert.ok(previous && !previous.includes(marker), `${name}: the replaced version must lack ${marker}`);
      assert.ok(final.includes(marker), `${name}: a later migration undoes ${f.migration}`);
    }
    for (const [table, role] of f.tableNoWrite ?? []) {
      assert.match(own, new RegExp(`revoke\\s+all\\s+on\\s+[^;]*public\\.${table}\\b[^;]*\\bfrom\\b[^;]*\\b${role}\\b`, 'i'), `${f.migration} revokes ${table} from ${role}`);
      const writes = files.filter(n => n >= f.migration).flatMap(n => [...text.get(n).matchAll(/grant\s+([^;]*?)\s+on\s+([^;]*?)\s+to\s+([^;]*);/gi)]
        .filter(([, privileges, target, grantees]) => new RegExp(`public\\.${table}\\b`).test(target) && new RegExp(`\\b${role}\\b`).test(grantees)
          && /\b(all|insert|update|delete|truncate)\b/i.test(privileges)).map(m => `${n}: ${m[0]}`));
      assert.deepEqual(writes, [], `${table}: no write grant to ${role} from ${f.migration} on`);
    }
  }
  const kinds = f => ['bodyIncludes', 'bodyExcludes', 'constraintIncludes', 'tableNoWrite'].filter(k => f[k]?.length);
  const byMigration = Object.fromEntries(DATABASE_FEATURES.map(f => [f.migration, kinds(f)]));
  assert.deepEqual({
    '20260914_0001_content_threads_post.sql': byMigration['20260914_0001_content_threads_post.sql'],
    '20260915_0034_threads_studio_compat.sql': byMigration['20260915_0034_threads_studio_compat.sql'],
    '20260920_0035_journal_tags_search.sql': byMigration['20260920_0035_journal_tags_search.sql'],
    '20260922_0037_content_performance_restore.sql': byMigration['20260922_0037_content_performance_restore.sql'],
    '20260922_0039_operating_goal_hash_fix.sql': byMigration['20260922_0039_operating_goal_hash_fix.sql'],
    '20260922_0040_office_apply_transient_retry.sql': byMigration['20260922_0040_office_apply_transient_retry.sql'],
    '20260922_0041_ai_assistance_hardening.sql': byMigration['20260922_0041_ai_assistance_hardening.sql'],
  }, {
    '20260914_0001_content_threads_post.sql': ['constraintIncludes'],
    '20260915_0034_threads_studio_compat.sql': ['bodyIncludes'],
    '20260920_0035_journal_tags_search.sql': ['bodyIncludes'],
    '20260922_0037_content_performance_restore.sql': ['bodyIncludes'],
    '20260922_0039_operating_goal_hash_fix.sql': ['bodyIncludes', 'bodyExcludes'],
    '20260922_0040_office_apply_transient_retry.sql': ['bodyIncludes'],
    '20260922_0041_ai_assistance_hardening.sql': ['bodyIncludes', 'tableNoWrite'],
  });
  const goalFix = DATABASE_FEATURES.find(f => f.migration === '20260922_0039_operating_goal_hash_fix.sql');
  assert.ok(goalFix.bodyIncludes.some(([, m]) => m === 'sha256(convert_to') && goalFix.bodyExcludes.some(([, m]) => m === 'digest('));
  assert.deepEqual(DATABASE_FEATURES.find(f => f.migration === '20260922_0041_ai_assistance_hardening.sql').tableNoWrite,
    [['operating_ai_candidates', 'service_role'], ['operating_ai_receipts', 'service_role']]);
});

test('readinessSql runs read-only on PostgreSQL and tells old and new versions apart', async t => {
  let bin;
  for (const path of [process.env.AGENT_COMMAND_TEST_PG_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/opt/homebrew/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean)) {
    try { await access(join(path, 'initdb'), constants.X_OK); bin = path; break; } catch {}
  }
  if (!bin) return t.skip('PostgreSQL binaries unavailable');
  // Private socket directory, no TCP listener, random port number: parallel clusters never share state.
  const root = await mkdtemp(join(tmpdir(), 'moon-readiness-')); const port = String(20000 + Math.floor(Math.random() * 20000)); let running = false;
  const env = { ...process.env, LC_ALL: 'C' };
  const run = (name, args) => { const r = spawnSync(join(bin, name), args, { encoding: 'utf8', timeout: 30000, env }); assert.equal(r.status, 0, r.stderr || r.error); };
  const sql = input => { const r = spawnSync(join(bin, 'psql'), ['-XAtq', '-h', root, '-p', port, '-U', userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', timeout: 30000, env }); assert.equal(r.status, 0, r.stderr || r.error); return r.stdout.trim(); };
  const migration = name => readFile(new URL(name, MIGRATIONS), 'utf8');
  // Exactly what db:check sends, inside a read-only transaction: any write would fail the statement.
  const check = features => summarizeReadiness(JSON.parse(sql(`begin transaction read only;\nselect coalesce(json_agg(r),'[]') from (${readinessSql(features)}) r;\nrollback;`)), features);
  try {
    run('initdb', ['-D', join(root, 'data'), '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', join(root, 'data'), '-l', join(root, 'postgres.log'), '-o', `-F -h '' -k ${root} -p ${port}`, '-w', 'start']); running = true;
    // Supabase roles and default privileges: new public tables are writable by service_role until revoked.
    sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      create table public.content_variants(id bigint generated always as identity primary key, variant_type text not null, channel text);
      create table public.probe(kind text constraint probe_kind_check check (kind in ('a')));
      create function public.probe_v1(p uuid) returns text language plpgsql as $$ begin return encode(public.digest(p::text,'sha256'),'hex'); end $$;`);
    // The versions production had before 20260914_0001 and 20260915_0034.
    const files = (await readdir(MIGRATIONS)).filter(n => n.endsWith('.sql')).sort();
    const priorConstraint = (await Promise.all(files.filter(n => n < '20260914_0001').map(migration))).map(s => constraintOf(s, 'content_variants_variant_type_check')).filter(Boolean).at(-1);
    const channel = (await migration('20260912_0026_content_workflow.sql')).match(/create or replace function public\.content_workflow_channel_v1[\s\S]*?\$\$[\s\S]*?\$\$;/)[0];
    sql(priorConstraint + '\n' + channel);

    const before = check(DATABASE_FEATURES);
    assert.equal(before.length, DATABASE_FEATURES.length);
    assert.deepEqual(before.filter(f => f.ready), [], 'nothing is ready on a bare database');
    assert.deepEqual(featureOf(before, 'Threads 변형 유형').missingOrUnprotected, ["content_variants.content_variants_variant_type_check에 'threads_post' 없음 (이전 버전)"]);
    assert.deepEqual(featureOf(before, 'Threads 스튜디오 채널').missingOrUnprotected, [`content_workflow_channel_v1 본문에 "p_type = 'threads_post'" 없음 (이전 버전)`]);
    assert.deepEqual(featureOf(before, '목표 명령 해시 수정').missingOrUnprotected, [
      'operating_goal_command_v1(uuid,text,jsonb) 없음', 'operating_goal_command_v1(uuid,text,jsonb) 없음', 'operating_goal_command_v1(uuid,text,jsonb) 없음']);
    assert.deepEqual(featureOf(before, 'AI 어시스트 보강').missingOrUnprotected.slice(-2), ['operating_ai_candidates 없음', 'operating_ai_receipts 없음']);

    sql(await migration('20260914_0001_content_threads_post.sql'));
    sql(await migration('20260915_0034_threads_studio_compat.sql'));
    const after = check(DATABASE_FEATURES);
    assert.deepEqual(after.filter(f => f.ready).map(f => f.feature), ['Threads 변형 유형', 'Threads 스튜디오 채널']);

    assert.deepEqual(check(SYNTHETIC).map(f => [f.feature, f.missingOrUnprotected]), [
      ['본문 포함', [FAILURES['본문 포함'].failed]], ['본문 제외', [FAILURES['본문 제외'].failed]],
      ['제약 포함', [FAILURES['제약 포함'].failed]], ['쓰기 금지', [FAILURES['쓰기 금지'].failed]]]);
    sql(`create or replace function public.probe_v1(p uuid) returns text language plpgsql as $$ begin return encode(sha256(convert_to(p::text,'UTF8')),'hex'); end $$;
      alter table public.probe drop constraint probe_kind_check;
      alter table public.probe add constraint probe_kind_check check (kind in ('a','b'));
      revoke insert, update, delete on public.probe from service_role;`);
    // TRUNCATE is a write too: revoking only INSERT/UPDATE/DELETE is not enough.
    assert.deepEqual(check(SYNTHETIC).map(f => [f.feature, f.ready]), [['본문 포함', true], ['본문 제외', true], ['제약 포함', true], ['쓰기 금지', false]]);
    sql('revoke truncate on public.probe from service_role;');
    assert.deepEqual(check(SYNTHETIC).map(f => [f.feature, f.ready, f.missingOrUnprotected]), SYNTHETIC.map(f => [f.name, true, []]));
    // SELECT alone is not a write, and a dropped constraint reads as missing rather than outdated.
    assert.equal(sql("select has_table_privilege('service_role','public.probe','SELECT')"), 't');
    sql('alter table public.probe drop constraint probe_kind_check;');
    assert.deepEqual(featureOf(check(SYNTHETIC), '제약 포함').missingOrUnprotected, [FAILURES['제약 포함'].absent]);
  } finally {
    if (running) spawnSync(join(bin, 'pg_ctl'), ['-D', join(root, 'data'), '-m', 'fast', '-w', 'stop'], { encoding: 'utf8', timeout: 30000, env });
    await rm(root, { recursive: true, force: true });
  }
});

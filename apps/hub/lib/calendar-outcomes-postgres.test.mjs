import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
const available = process.getuid?.() !== 0 && ['initdb', 'pg_ctl', 'psql'].every(bin => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0);
test('calendar outcomes migration enforces unique identity, CAS and private access', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'calendar-outcomes-pg-'));
  const data = join(directory, 'data');
  const options = { stdio: 'pipe', env: { ...process.env, LC_ALL: 'C' } };
  const sql = input => execFileSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', '55506', '-U', 'calendar_test', '-d', 'postgres'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-U', 'calendar_test', '-A', 'trust', '--no-locale', '--encoding=UTF8'], options);
    execFileSync('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-F -k ${directory} -p 55506 -c listen_addresses=''`, '-w', 'start'], options);
    started = true;
    sql("create role anon; create role authenticated; create role service_role bypassrls; create table public.workspaces (id uuid primary key); insert into public.workspaces values ('11111111-1111-4111-8111-111111111111');");
    const migration = readFileSync(new URL('../../../supabase/migrations/20260922_0036_calendar_event_outcomes.sql', import.meta.url), 'utf8');
    sql(migration); sql(migration);
    assert.equal(sql("select relrowsecurity from pg_class where oid='public.calendar_event_outcomes'::regclass"), 't');
    for (const role of ['anon', 'authenticated']) {
      assert.equal(sql(`select has_table_privilege('${role}', 'public.calendar_event_outcomes', 'SELECT,INSERT,UPDATE,DELETE')`), 'f');
    }
    const insert = "insert into public.calendar_event_outcomes(workspace_id,event_key,revision) values ('11111111-1111-4111-8111-111111111111',repeat('a',64),1)";
    sql(`set role service_role; ${insert}`);
    assert.throws(() => sql(insert), /duplicate key/);
    assert.throws(() => sql("update public.calendar_event_outcomes set note=repeat('x',4001)"), /check constraint/);
    sql("set role service_role; update public.calendar_event_outcomes set done=true,note='완료 기록',revision=2 where event_key=repeat('a',64) and revision=1; update public.calendar_event_outcomes set note='stale' where event_key=repeat('a',64) and revision=1;");
    assert.equal(sql('select note from public.calendar_event_outcomes'), '완료 기록');
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], options);
    rmSync(directory, { recursive: true, force: true });
  }
});

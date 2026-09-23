import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const migration = new URL('../../../supabase/migrations/20260922_0037_content_performance_restore.sql', import.meta.url);
async function postgresBin() {
  for (const dir of [process.env.CONTENT_PERFORMANCE_TEST_PG_BIN, ...String(process.env.PATH).split(':'), '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean)) {
    try { await Promise.all(['initdb', 'pg_ctl', 'psql'].map(name => access(join(dir, name), constants.X_OK))); return dir; } catch {}
  }
  return null;
}

test('revision restore preserves current performance in real PostgreSQL', async t => {
  const bin = await postgresBin();
  if (!bin) { t.skip('Local PostgreSQL binaries unavailable; set CONTENT_PERFORMANCE_TEST_PG_BIN'); return; }
  const root = await mkdtemp(join(tmpdir(), 'moon-performance-restore-'));
  const data = join(root, 'data'); let running = false;
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { encoding: 'utf8', input, timeout: 30000, env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    assert.equal(result.status, 0, `${name}: ${result.stderr || result.error || result.stdout}`);
    return result.stdout.trim();
  };
  const sql = input => run('psql', ['-X', '-A', '-t', '-q', '-h', root, '-p', '5432', '-U', userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
  try {
    run('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-F -h '' -k ${root} -p 5432`, '-w', 'start']); running = true;
    sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;');
    for (const path of ['setup/00_live_schema.sql', 'migrations/20260617_0007_content_idea_cadence.sql', 'migrations/20260912_0026_content_workflow.sql']) {
      sql(await readFile(new URL(`../../../supabase/${path}`, import.meta.url), 'utf8'));
    }
    let source;
    try { source = await readFile(migration, 'utf8'); } catch {}
    if (source) { sql(source); sql(source); }
    await t.test('older and absent snapshot metrics cannot erase, rewind or resurrect current metrics', () => {
      sql(`begin;
      do $$
      declare
        w uuid := gen_random_uuid(); r jsonb; checkpoint jsonb; current_variant jsonb; c jsonb; restored jsonb;
        revision_id uuid; request_token uuid; mode integer;
        measured jsonb := '{"views":120,"shares":0,"replies":null,"capturedAt":"2026-09-22T00:00:00Z","source":"manual"}'::jsonb;
      begin
        insert into workspaces(id,name,slug) values(w,'Restore contract','restore-' || w);
        for mode in 1..3 loop
          r := content_workflow_v1(w,gen_random_uuid(),'create-' || mode,
            '{"action":"save","variant":{"body":"historical body","variantType":"x_thread","channel":"x"}}'::jsonb);
          assert r->>'status'='saved',r::text;
          update content_variants set status='published',published_at='2026-01-01T00:00:00Z',
            meta=jsonb_build_object('editor_note','historical') || case when mode=1 then '{}'::jsonb else jsonb_build_object('performance',measured || '{"views":1}'::jsonb) end
            where id=(r->>'variantId')::uuid returning to_jsonb(content_variants.*) into current_variant;
          c := jsonb_build_object('action','save','checkpoint',true,'contentId',r->>'contentId','variantId',r->>'variantId',
            'expectedItemUpdatedAt',r#>>'{item,updated_at}','expectedVariantUpdatedAt',current_variant->>'updated_at',
            'item','{}'::jsonb,'variant','{}'::jsonb);
          checkpoint := content_workflow_v1(w,gen_random_uuid(),'checkpoint-' || mode,c);
          assert checkpoint->>'status'='saved',checkpoint::text;
          revision_id := (checkpoint->>'revisionId')::uuid;
          update content_variants set body='current body',published_at='2026-02-01T00:00:00Z',
            meta=jsonb_build_object('editor_note','current') || case when mode=3 then '{}'::jsonb else jsonb_build_object('performance',measured) end
            where id=(r->>'variantId')::uuid returning to_jsonb(content_variants.*) into current_variant;
          c := jsonb_build_object('action','restore_revision','contentId',r->>'contentId','variantId',r->>'variantId',
            'expectedItemUpdatedAt',checkpoint#>>'{item,updated_at}','expectedVariantUpdatedAt',current_variant->>'updated_at','revisionId',revision_id);
          request_token := gen_random_uuid();
          restored := content_workflow_v1(w,request_token,'restore-' || mode,c);
          assert restored->>'status'='saved',restored::text;
          assert restored#>'{variant,meta,performance}' is not distinct from current_variant#>'{meta,performance}',
            'restore must preserve current performance, including an absent value';
          assert restored#>>'{variant,body}'='historical body';
          assert restored#>>'{variant,meta,editor_note}'='historical';
          assert restored#>'{variant,published_at}'=checkpoint#>'{variant,published_at}', 'publication restore behavior must stay unchanged';
          assert (select meta->'performance' from content_variants where id=(r->>'variantId')::uuid) is not distinct from current_variant#>'{meta,performance}';
          assert (select snapshot#>'{meta,performance}' from content_revisions where id=(restored->>'revisionId')::uuid) is not distinct from current_variant#>'{meta,performance}';
          assert (select response#>'{variant,meta,performance}' from content_workflow_receipts where workspace_id=w and request_id=request_token) is not distinct from current_variant#>'{meta,performance}';
          r := content_workflow_v1(w,request_token,'restore-' || mode,c);
          assert r->>'status'='duplicate' and r->'variant'=restored->'variant';
        end loop;
      end $$;
      rollback;`);
    });
    await t.test('existing workflow state, revision and source contracts still hold', async () => {
      sql(await readFile(new URL('./content-workflow.test.sql', import.meta.url), 'utf8'));
    });
    await t.test('function remains restricted to service role after repeatable migration', () => {
      const grants = JSON.parse(sql(`select jsonb_build_object('anon',has_function_privilege('anon','public.content_workflow_v1(uuid,uuid,text,jsonb)','execute'), 'authenticated',has_function_privilege('authenticated','public.content_workflow_v1(uuid,uuid,text,jsonb)','execute'), 'service',has_function_privilege('service_role','public.content_workflow_v1(uuid,uuid,text,jsonb)','execute'))`));
      assert.deepEqual(grants, { anon: false, authenticated: false, service: true });
    });
  } finally {
    if (running) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    await rm(root, { recursive: true, force: true });
  }
});

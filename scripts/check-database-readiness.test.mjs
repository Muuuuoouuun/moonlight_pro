import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CHECK = fileURLToPath(new URL('./check-database-readiness.mjs', import.meta.url));
const REF_A = 'aaaaaaaaaaaaaaaaaaaa';
const REF_B = 'bbbbbbbbbbbbbbbbbbbb';
const url = ref => `https://${ref}.supabase.co`;

function runCheck(root, local, hub) {
  writeFileSync(join(root, '.env.local'), `SUPABASE_ACCESS_TOKEN=test-token\n${local}\n`);
  writeFileSync(join(root, 'apps/hub/.env.local'), `${hub}\n`);
  const env = { ...process.env };
  for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN']) delete env[key];
  return spawnSync(process.execPath, ['--import', join(root, 'no-network.mjs'), CHECK], {
    cwd: root, env, encoding: 'utf8', timeout: 5000,
  });
}

test('db:check rejects conflicting Supabase refs from any env source before a network query', () => {
  const root = mkdtempSync(join(tmpdir(), 'moonlight-db-check-ref-'));
  try {
    mkdirSync(join(root, 'apps/hub'), { recursive: true });
    writeFileSync(join(root, 'no-network.mjs'), "globalThis.fetch = () => { throw Error('network query reached'); };\n");
    for (const [local, hub] of [
      [`SUPABASE_PROJECT_REF=${REF_A}`, `SUPABASE_URL=${url(REF_B)}`],
      [`SUPABASE_URL=${url(REF_A)}`, `NEXT_PUBLIC_SUPABASE_URL=${url(REF_B)}`],
      [`NEXT_PUBLIC_SUPABASE_URL=${url(REF_A)}`, `SUPABASE_PROJECT_REF=${REF_B}`],
    ]) {
      const result = runCheck(root, local, hub);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /points to .*; expected /);
      assert.doesNotMatch(result.stderr, /network query reached/);
    }
    const matching = runCheck(root, `SUPABASE_PROJECT_REF=${REF_A}`, `SUPABASE_URL=${url(REF_A)}`);
    assert.match(matching.stderr, /network query reached/, 'matching refs should reach the query');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

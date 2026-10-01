import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DATABASE_FEATURES, featureChecks, summarizeReadiness } from './database-readiness.mjs';

// Model only the existing readiness query's strpos(prosrc, marker) predicate.
// This does not execute PostgreSQL or establish RPC/role correctness.
test('Threads readiness rejects a pre-P2 RPC that cannot return the private lease budget', async () => {
  const feature = DATABASE_FEATURES.find(f => f.migration === '20261001_0064_gore_threads_text_test_job.sql');
  assert.ok(feature);
  const source = await readFile(new URL('../supabase/migrations/20261001_0064_gore_threads_text_test_job.sql', import.meta.url), 'utf8');
  const body = source.split('create or replace function public.gore_threads_test_job_v1')[1].split('$$;')[0];
  const summarize = sqlBody => summarizeReadiness(featureChecks(feature).map(check => ({
    migration: feature.migration, ...check, present: true,
    protected: check.kind !== 'body_includes' || sqlBody.includes(check.detail),
  })), [feature])[0];
  assert.equal(summarize(body).ready, true);
  for (const field of ['leaseExpiresAt', 'leaseRemainingMs']) {
    const oldBody = body.replaceAll(`'${field}'`, `'obsolete-${field}'`);
    const result = summarize(oldBody);
    assert.equal(result.ready, false, `missing ${field} must block readiness before execute`);
    assert.ok(result.missingOrUnprotected.some(reason => reason.includes(field)));
  }
});

import { bootstrapReadinessSql, loadEnv, deriveProjectRef, runSql } from './apply-migrations.mjs';
import { readinessSql, summarizeReadiness } from './database-readiness.mjs';
const env = loadEnv(), ref = deriveProjectRef(env), token = (env.SUPABASE_ACCESS_TOKEN || '').trim();
if (!ref || !token) throw Error('SUPABASE_ACCESS_TOKEN and the configured Supabase project are required');
const response = await runSql(ref, token, readinessSql());
if (!response.ok) throw Error('Database readiness request failed: HTTP ' + response.status);
const features = summarizeReadiness(JSON.parse(response.body));
for (const feature of features) console.log(`[${feature.ready ? 'PASS' : 'FAIL'}] ${feature.feature} · ${feature.migration}${feature.ready ? '' : ' · ' + feature.missingOrUnprotected.join(', ')}`);
if (features.some(feature => !feature.ready)) process.exitCode = 1;
const historyResponse = await runSql(ref, token, bootstrapReadinessSql());
if (!historyResponse.ok) throw Error('Migration bootstrap readiness request failed: HTTP ' + historyResponse.status);
const history = JSON.parse(historyResponse.body)?.[0];
const historyReady = ['history', 'executor', 'rls', 'implementation', 'private']
  .every(key => history?.[key] === true);
console.log(`[${historyReady ? 'PASS' : 'FAIL'}] 마이그레이션 이력 · 20260923_0044_migration_history.sql`);
if (!historyReady) process.exitCode = 1;

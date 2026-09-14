import { loadEnv, deriveProjectRef, runSql } from './apply-migrations.mjs';
import { readinessSql, summarizeReadiness } from './database-readiness.mjs';
const env = loadEnv(), ref = deriveProjectRef(env), token = (env.SUPABASE_ACCESS_TOKEN || '').trim();
if (!ref || !token) throw Error('SUPABASE_ACCESS_TOKEN and the configured Supabase project are required');
const response = await runSql(ref, token, readinessSql());
if (!response.ok) throw Error('Database readiness request failed: HTTP ' + response.status);
const features = summarizeReadiness(JSON.parse(response.body));
for (const feature of features) console.log(`[${feature.ready ? 'PASS' : 'FAIL'}] ${feature.feature} · ${feature.migration}${feature.ready ? '' : ' · ' + feature.missingOrUnprotected.join(', ')}`);
if (features.some(feature => !feature.ready)) process.exitCode = 1;

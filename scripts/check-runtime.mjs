#!/usr/bin/env node
// Read-only local configuration/connection check. Never prints credentials.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export function inspectRuntime(environments) {
  const issues = [];
  const targets = environments.map(({ name, env }) => {
    let url;
    try {
      url = new URL((env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error();
    } catch {
      issues.push(`${name}: Supabase URL missing or invalid`);
      return { name, env, url: null };
    }
    const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!key) issues.push(`${name}: service role key missing`);
    if (key.startsWith('eyJ')) {
      try {
        const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
        if (claims.ref && url.hostname !== `${claims.ref}.supabase.co`) issues.push(`${name}: URL and service key project differ`);
        if (claims.role !== 'service_role') issues.push(`${name}: key is not a service role key`);
      } catch { issues.push(`${name}: invalid service role JWT`); }
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '') !== url.href.replace(/\/$/, '')) {
      issues.push(`${name}: browser/server Supabase URLs differ`);
    }
    const workspace = (env.COM_MOON_DEFAULT_WORKSPACE_ID || env.DEFAULT_WORKSPACE_ID || '').trim();
    if (!workspace) issues.push(`${name}: workspace missing`);
    return { name, env, url, key, workspace };
  });
  for (const field of ['url', 'workspace', 'key']) {
    const values = targets.map(t => field === 'url' ? t.url?.href.replace(/\/$/, '') : t[field]).filter(Boolean);
    if (new Set(values).size > 1) issues.push(`root/Hub/Engine ${field} settings differ`);
  }
  const hub = targets.find(t => t.name === 'hub')?.env;
  const engine = targets.find(t => t.name === 'engine')?.env;
  if (hub && engine) {
    const secret = hub.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();
    if (!secret || secret !== engine.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()) issues.push('Hub/Engine shared secret missing or different');
    try { new URL(hub.COM_MOON_ENGINE_URL); } catch { issues.push('Hub Engine URL missing or invalid'); }
  }
  return { issues, targets };
}

export async function probeWorkspace(target, fetchImpl = fetch) {
  if (!target.url || !target.key || !target.workspace) return { ok: false, reason: 'missing-config' };
  const url = new URL('/rest/v1/workspaces', target.url);
  url.search = new URLSearchParams({ select: 'id', id: `eq.${target.workspace}`, limit: '1' }).toString();
  try {
    const response = await fetchImpl(url, {
      headers: { apikey: target.key, Authorization: `Bearer ${target.key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const rows = await response.json();
    return { ok: Array.isArray(rows) && rows.length === 1, reason: Array.isArray(rows) && rows.length === 1 ? 'ok' : 'workspace-not-found' };
  } catch (error) {
    return { ok: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'connection-failed' };
  }
}

async function main() {
  const require = createRequire(import.meta.url);
  const nextRequire = createRequire(require.resolve('next/package.json'));
  const { loadEnvConfig, resetEnv } = nextRequire('@next/env');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const environments = ['root', 'hub', 'engine'].map(name => {
    resetEnv();
    const directory = name === 'root' ? root : path.join(root, 'apps', name);
    const { combinedEnv } = loadEnvConfig(directory, true, { info() {}, error() {} }, true);
    return { name, env: { ...combinedEnv } };
  });
  resetEnv();
  const { issues, targets } = inspectRuntime(environments);
  for (const issue of issues) console.log(`[FAIL] ${issue}`);
  if (!issues.length) console.log('[PASS] root/Hub/Engine configuration agrees');
  const results = await Promise.all(targets.map(async target => {
    const result = await probeWorkspace(target);
    console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${target.name}: ${target.url?.hostname || 'unconfigured'} · ${result.reason}`);
    return result;
  }));
  if (issues.length || results.some(result => !result.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

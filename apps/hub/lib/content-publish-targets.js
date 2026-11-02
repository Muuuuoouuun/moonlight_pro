// 원고 작성의 "올릴 곳" — 브랜드마다 Threads · Instagram 연결 상태(저장된 메타데이터 기준, 공급자 실검증 아님).
// 토큰·계정 ID는 내보내지 않는다. 지금 Moonlight가 직접 올리는 채널은 Threads 하나다(2026-11-02).
import { SOCIAL_BRAND_REGISTRY, socialBrandSupportsProvider } from './social-brand-registry.js';
import { matchesMetaOAuthConnection, resolveMetaOAuthApp } from './meta-oauth-apps.js';
import { listSocialAccountConnections } from './social-account-connections.js';
import { getMetaTokenStatus } from './social-token-health.js';
import { resolveDefaultWorkspaceId } from './server-write.js';
import { createThreadsPublishRepository } from './repositories/threads-publish-jobs.js';
import { threadsPublishEnabled } from './threads-publish-service.js';

const PROVIDERS = ['meta_threads', 'instagram_api'];
const NIL = '00000000-0000-4000-8000-000000000000';

async function readAll(provider, workspaceId, listConnections) {
  const rows = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await listConnections(provider, workspaceId, '', offset);
    if (!page.available) return null;
    rows.push(...page.connections);
    if (page.connections.length < 100) break;
  }
  return rows;
}

/** 한 브랜드 · 한 채널의 상태 — connected · refresh-required(7일 안 만료) · reauthorization-required · expiry-unknown · not-connected · app-missing · unsupported · read-error. */
export function channelState(brandKey, provider, rows, now = Date.now()) {
  const registry = SOCIAL_BRAND_REGISTRY[brandKey];
  if (!registry || !socialBrandSupportsProvider(brandKey, provider)) return { state: 'unsupported' };
  const app = resolveMetaOAuthApp({ provider, brandKey, brandHandle: registry.brandHandle });
  if (!app?.configured) return { state: 'app-missing', handle: registry.brandHandle };
  if (!rows) return { state: 'read-error', handle: registry.brandHandle };
  const row = rows.find((candidate) => candidate.status === 'connected' && matchesMetaOAuthConnection(candidate, app));
  if (!row) return { state: 'not-connected', handle: registry.brandHandle };
  const config = row.config || {};
  const state = getMetaTokenStatus({ hasAccessToken: Boolean(config.accessToken), expiresAt: config.expiresAt }, now);
  const scopes = String(config.scope || '').split(/[,\s]+/);
  const publishScope = provider === 'meta_threads' ? 'threads_content_publish' : 'instagram_business_content_publish';
  return { state: scopes.includes(publishScope) || state !== 'connected' ? state : 'scope-missing', handle: registry.brandHandle, expiresAt: config.expiresAt || null };
}

export async function readContentPublishTargets({
  workspaceId = resolveDefaultWorkspaceId(), listConnections = listSocialAccountConnections,
  repo = createThreadsPublishRepository({ workspaceId }), enabled = threadsPublishEnabled(), now = Date.now(),
} = {}) {
  if (!workspaceId) return { status: 'preview', publishEnabled: false, storage: 'preview', brands: {} };
  try {
    const rows = Object.fromEntries(await Promise.all(PROVIDERS.map(async (provider) => [provider, await readAll(provider, workspaceId, listConnections)])));
    // 작업 표(0073)가 있는지 — 없으면 올리기 대신 "작업 표 연결 필요".
    let storage = 'live';
    try { const probe = await repo.command('latest', { variantId: NIL }); if (probe.status !== 'live') storage = 'error'; } catch { storage = 'missing'; }
    const brands = Object.fromEntries(Object.keys(SOCIAL_BRAND_REGISTRY).map((brandKey) => [brandKey, {
      threads: channelState(brandKey, 'meta_threads', rows.meta_threads, now),
      instagram: channelState(brandKey, 'instagram_api', rows.instagram_api, now),
    }]));
    const partial = PROVIDERS.some((provider) => !rows[provider]);
    return { status: partial ? 'partial' : 'live', publishEnabled: enabled, storage, brands };
  } catch {
    return { status: 'error', publishEnabled: enabled, storage: 'unknown', brands: {} };
  }
}

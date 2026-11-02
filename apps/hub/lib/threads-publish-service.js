// 브랜드 Threads 글 올리기 — 원고 작성의 올리기 창에서 운영자가 누른 한 번(2026-11-02 운영자 결정: Threads 먼저).
// 순서: 저장된 본문 읽기 → 계정 확인(보내기 전, 실패하면 작업을 만들지 않음) → 작업 준비 → lease → 연결 글마다
//   만들기 의도 기록 → 컨테이너 → 상태 확인 → 올리기 의도 기록 → 올리기 → 글 기록 → 첫 글 다시 읽기 → 확인됨.
// 응답을 잃으면 다시 보내지 않는다. 첫 글을 올리기 전에 끝난 실패만 '안 올라감'으로 정리하고 다시 올릴 수 있게 둔다.
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fetchSupabaseRowsDetailed } from '@com-moon/supabase-rest';
import { resolveDefaultWorkspaceId } from './server-write.js';
import { isCanonicalUuid } from './uuid.js';
import { SOCIAL_BRAND_REGISTRY, socialBrandSupportsProvider } from './social-brand-registry.js';
import { matchesMetaOAuthConnection, resolveMetaOAuthApp } from './meta-oauth-apps.js';
import { listSocialAccountConnections } from './social-account-connections.js';
import { createThreadsPublishRepository } from './repositories/threads-publish-jobs.js';
import { createThreadsTextAdapter, THREADS_REQUEST_TIMEOUT_MS, verifiedThreadsPost } from './threads-text-adapter.js';
import { threadPostsForPublish, threadPublishIssues } from './thread-posts.js';

export const THREADS_PUBLISH_ENV = 'COM_MOON_THREADS_PUBLISH_ENABLED';
const EFFECT_MARGIN_MS = 2000;
const LEASE_MS = 90000;
const CONTAINER_POLLS = 6;
const ABANDON_REASONS = ['not-posted', 'posted-manually'];
const JOB_KEYS = ['id', 'requestId', 'brandId', 'brandKey', 'contentId', 'variantId', 'provider', 'username', 'title', 'posts', 'postCount',
  'bodyHash', 'state', 'step', 'postIds', 'permalink', 'version', 'errorCode', 'abandonReason', 'createdAt', 'updatedAt', 'verifiedAt', 'abandonedAt'];
export const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
export const threadsPublishEnabled = () => process.env[THREADS_PUBLISH_ENV] === 'true';

/** 화면으로 나가는 작업 — 계정 ID·컨테이너·lease는 뺀다. */
export function publicThreadsJob(job) {
  if (!job || typeof job !== 'object') return null;
  return Object.fromEntries(JOB_KEYS.map((key) => [key, job[key] ?? null]));
}

export function normalizeThreadsPublishCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.action === 'publish') {
    const keys = ['action', 'requestId', 'variantId', 'contentId', 'brandId', 'bodyHash', 'confirmPublish'];
    if (Object.keys(input).some((key) => !keys.includes(key)) || input.confirmPublish !== true ||
      !['requestId', 'variantId', 'contentId', 'brandId'].every((key) => isCanonicalUuid(input[key])) ||
      !/^[a-f0-9]{64}$/.test(input.bodyHash || '')) return null;
    return { ...input, requestId: input.requestId.toLowerCase() };
  }
  if (input.action === 'abandon') {
    if (Object.keys(input).some((key) => !['action', 'jobId', 'reason'].includes(key)) || !isCanonicalUuid(input.jobId) ||
      !ABANDON_REASONS.includes(input.reason)) return null;
    return { ...input };
  }
  return null;
}

/** 저장된 결과물 · 콘텐츠 · 브랜드를 서버가 직접 읽는다 — 화면이 보낸 글을 믿지 않는다. */
export async function readThreadsPublishSource(workspaceId, { variantId, contentId }, { fetchRows = fetchSupabaseRowsDetailed } = {}) {
  const one = async (table, select, id) => {
    const result = await fetchRows(table, { select, limit: 1, strictRows: true, dedupe: false,
      filters: [['id', `eq.${id}`], ['workspace_id', `eq.${workspaceId}`]] });
    if (!result.configured) throw Error('storage-unavailable');
    if (result.error || !Array.isArray(result.rows)) throw Error('source-read-failed');
    return result.rows[0] || null;
  };
  const variant = await one('content_variants', 'id,content_id,body,variant_type,channel,status,title', variantId);
  const item = variant && variant.content_id === contentId ? await one('content_items', 'id,brand_id,title,status', contentId) : null;
  if (!variant || !item) return { ok: false, reason: 'not-found' };
  if (variant.variant_type !== 'threads_post') return { ok: false, reason: 'not-threads' };
  const brand = item.brand_id ? await one('brands', 'id,slug,name,status', item.brand_id) : null;
  if (!brand || brand.status !== 'active') return { ok: false, reason: 'brand-missing' };
  return { ok: true, variant, item, brand };
}

/** 이 브랜드의 Threads 계정 — 브랜드 전용 앱 · 핸들 · 권한 · 만료를 모두 맞춰야 쓴다. 토큰은 이 함수 밖으로 나가지 않는다. */
export async function readThreadsCredential(workspaceId, brandKey, { listConnections = listSocialAccountConnections, now = Date.now } = {}) {
  const registry = SOCIAL_BRAND_REGISTRY[brandKey];
  if (!registry || !socialBrandSupportsProvider(brandKey, 'meta_threads')) return { ok: false, reason: 'brand-unsupported' };
  const app = resolveMetaOAuthApp({ provider: 'meta_threads', brandKey, brandHandle: registry.brandHandle });
  if (!app?.configured) return { ok: false, reason: 'app-missing' };
  const rows = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await listConnections('meta_threads', workspaceId, '', offset);
    if (!page.available) throw Error('connection-read-failed');
    rows.push(...page.connections);
    if (page.connections.length < 100) break;
  }
  const row = rows.find((candidate) => candidate.status === 'connected' && matchesMetaOAuthConnection(candidate, app));
  if (!row) return { ok: false, reason: 'not-connected' };
  const config = row.config || {};
  const scopes = String(config.scope || '').split(/[,\s]+/);
  if (typeof config.accessToken !== 'string' || !config.accessToken.trim() || !(Date.parse(config.expiresAt) > now() + 60000)) {
    return { ok: false, reason: 'reconnect-required' };
  }
  if (!scopes.includes('threads_content_publish')) return { ok: false, reason: 'scope-missing' };
  return { ok: true, accessToken: config.accessToken, accountId: row.account_key, appKey: app.appKey, username: registry.brandHandle };
}

const reply = (status, job = null, extra = {}, httpStatus = 200) => ({ status, job: publicThreadsJob(job), ...extra, httpStatus });

export async function runThreadsPublish(input, {
  workspaceId = resolveDefaultWorkspaceId(), enabled = threadsPublishEnabled(),
  repo = createThreadsPublishRepository({ workspaceId }), readSource = readThreadsPublishSource, readCredential = readThreadsCredential,
  adapterFactory = createThreadsTextAdapter, owner = randomUUID(), monotonicNow = () => performance.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const command = normalizeThreadsPublishCommand(input);
  if (!command) return reply('invalid-input', null, { reason: 'invalid-command' }, 400);
  if (!workspaceId) return reply('preview', null, { reason: 'missing-workspace' }, 202);

  if (command.action === 'abandon') {
    try {
      const result = await repo.command('abandon', { jobId: command.jobId, reason: command.reason });
      return reply(result.status, result.job, {}, ['saved', 'duplicate'].includes(result.status) ? 200 : 409);
    } catch { return reply('error', null, { reason: 'job-storage-unconfirmed' }, 503); }
  }
  if (!enabled) return reply('disabled', null, { reason: 'threads-publish-off' }, 503);

  // 1. 보내기 전 확인 — 여기서 실패하면 작업을 만들지 않는다.
  let source, credential, posts, adapter;
  try {
    source = await readSource(workspaceId, command);
    if (!source.ok) return reply('blocked', null, { reason: source.reason }, 409);
    if (source.brand.id !== command.brandId) return reply('blocked', null, { reason: 'brand-mismatch' }, 409);
    if (sha256(source.variant.body || '') !== command.bodyHash) return reply('blocked', null, { reason: 'stale-body' }, 409);
    if (source.variant.status === 'published') return reply('blocked', null, { reason: 'already-published' }, 409);
    posts = threadPostsForPublish(source.variant.body);
    const issues = threadPublishIssues(posts);
    if (issues.length) return reply('blocked', null, { reason: issues[0].code }, 409);
    credential = await readCredential(workspaceId, source.brand.slug);
    if (!credential.ok) return reply('blocked', null, { reason: credential.reason }, 409);
    adapter = adapterFactory({ accessToken: credential.accessToken });
    const profile = await adapter.profile();
    if (profile?.id !== credential.accountId || String(profile.username || '').toLowerCase() !== credential.username) {
      return reply('blocked', null, { reason: 'account-mismatch' }, 409);
    }
  } catch (error) {
    return reply('blocked', null, { reason: error?.message === 'storage-unavailable' ? 'storage-unavailable' : 'read-unconfirmed' }, 503);
  }

  // 2. 작업 준비 — 같은 요청 ID는 같은 작업, 결과물에 열린 작업이 있으면 그 작업을 보여 준다.
  let job, lease, leaseDeadline;
  try {
    const prepareInput = {
      requestId: command.requestId, variantId: command.variantId, contentId: command.contentId, brandId: source.brand.id,
      brandKey: source.brand.slug, accountId: credential.accountId, appKey: credential.appKey, username: credential.username,
      posts, bodyHash: command.bodyHash,
    };
    let prepared = await repo.command('prepare', prepareInput);
    // 앞선 시도가 준비만 하고 멈춘 작업(아무것도 보내지 않음)은 정리하고 다시 준비한다. lease가 살아 있으면 RPC가 거절한다.
    if (prepared.status === 'busy' && ['prepared', 'claimed'].includes(prepared.job?.state)) {
      const cleared = await repo.command('abandon', { jobId: prepared.job.id, reason: 'cancelled-before-send' });
      if (cleared.status === 'saved') prepared = await repo.command('prepare', prepareInput);
    }
    if (!['saved', 'duplicate'].includes(prepared.status)) return reply(prepared.status, prepared.job, { reason: prepared.status }, 409);
    job = prepared.job;
    if (job.state === 'verified') return reply('verified', job);
    if (job.state !== 'prepared' && job.state !== 'claimed') return reply(job.state === 'ambiguous' ? 'ambiguous' : 'busy', job, {}, 409);
    const claimed = await repo.command('claim', { jobId: job.id, owner });
    if (claimed.status !== 'claimed' || !claimed.leaseToken) return reply(claimed.status === 'blocked' ? 'ambiguous' : 'busy', claimed.job || job, {}, 409);
    job = claimed.job; lease = claimed.leaseToken;
    const remaining = Number(claimed.leaseRemainingMs);
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > LEASE_MS) throw Error('job-storage-unconfirmed');
    leaseDeadline = monotonicNow() + remaining;
  } catch {
    return reply('error', job, { reason: 'job-storage-unconfirmed' }, 503);
  }

  const assertBudget = () => {
    if (leaseDeadline - monotonicNow() <= THREADS_REQUEST_TIMEOUT_MS + EFFECT_MARGIN_MS) throw Error('effect-lease-unavailable');
  };
  const advance = async (state, extra = {}) => {
    const result = await repo.command('advance', { jobId: job.id, owner, leaseToken: lease, expectedVersion: job.version, state, ...extra });
    if (result.status !== 'saved' || !result.job || result.job.id !== job.id) throw Error(result.status === 'blocked' ? 'connection-changed' : 'job-storage-unconfirmed');
    job = result.job;
    if (!['verified', 'ambiguous'].includes(state)) leaseDeadline = monotonicNow() + LEASE_MS;
  };

  // 3. 연결 글마다 차례로. 첫 글을 올리기 전에 멈추면 아무것도 공개되지 않았다.
  const postIds = [];
  let firstPublishSent = false;
  try {
    for (let step = 0; step < posts.length; step += 1) {
      await advance('creating');
      assertBudget();
      const containerId = await adapter.createContainer(posts[step], { replyToId: step ? postIds[step - 1] : null, beforeSend: assertBudget });
      await advance('container_ready', { containerId });
      let container = await adapter.container(containerId);
      for (let poll = 1; container.status === 'IN_PROGRESS' && poll < CONTAINER_POLLS; poll += 1) {
        await sleep(1000);
        container = await adapter.container(containerId);
      }
      if (container.status !== 'FINISHED') throw Error(step === 0 ? 'container-failed-before-publish' : 'container-failed');
      await advance('publish_requested');
      assertBudget();
      if (step === 0) firstPublishSent = true;
      const postId = await adapter.publish(containerId, { beforeSend: assertBudget });
      await advance('post_recorded', { postId });
      postIds.push(postId);
    }
    const receipt = verifiedThreadsPost(await adapter.post(postIds[0]),
      { postId: postIds[0], accountId: credential.accountId, username: credential.username, text: posts[0] });
    if (!receipt) {
      await advance('ambiguous', { errorCode: 'verification-unconfirmed' });
      return reply('ambiguous', job, { reason: 'verification-unconfirmed' }, 202);
    }
    await advance('verified', { permalink: receipt.permalink });
    return reply('verified', job);
  } catch (error) {
    // 저장이 이미 됐을 수도 있다 — CAS가 막으면 그대로 두고 다시 보내지 않는다.
    try { await advance('ambiguous', { errorCode: 'outcome-unconfirmed' }); } catch { /* 다음 claim이 lease 만료로 정리한다 */ }
    if (!firstPublishSent && job?.state === 'ambiguous') {
      // 첫 글을 올리라고 보내기 전 — 공개된 글이 없다. 정리해서 다시 올릴 수 있게 한다.
      try {
        const abandoned = await repo.command('abandon', { jobId: job.id, reason: 'not-posted' });
        if (abandoned.status === 'saved') return reply('failed', abandoned.job, { reason: error?.message === 'connection-changed' ? 'connection-changed' : 'not-sent' }, 502);
      } catch { /* 확인 필요로 남긴다 */ }
    }
    return reply('ambiguous', job, { reason: postIds.length ? 'partial' : 'outcome-unconfirmed', postedCount: postIds.length }, 202);
  }
}

export async function readLatestThreadsJob(variantId, { workspaceId = resolveDefaultWorkspaceId(), repo = createThreadsPublishRepository({ workspaceId }) } = {}) {
  if (!isCanonicalUuid(variantId)) return { status: 'invalid-input', job: null };
  if (!workspaceId) return { status: 'preview', job: null };
  try {
    const result = await repo.command('latest', { variantId });
    return { status: result.status === 'live' ? 'live' : 'error', job: publicThreadsJob(result.job) };
  } catch { return { status: 'error', job: null, reason: 'job-storage-unconfirmed' }; }
}

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolveDefaultWorkspaceId } from './server-write.js';
import { fetchMetaThreadsConnections } from './meta-threads.js';
import { resolveMetaOAuthApp, matchesMetaOAuthConnection } from './meta-oauth-apps.js';
import { approvedGorePayload, GORE_THREADS_TEST, matchesApprovedGoreJob, normalizeGoreTestCommand, publicGoreJob } from './gore-threads-test-contract.js';
import { createGoreTestRepository } from './repositories/gore-threads-test-jobs.js';
import { createThreadsTextTestAdapter, THREADS_TEXT_REQUEST_TIMEOUT_MS, verifiedGorePost } from './threads-text-test-adapter.js';

const EFFECT_LEASE_MARGIN_MS = 2000;

async function credential(workspaceId, command) {
  const app = resolveMetaOAuthApp({ provider: 'meta_threads', brandKey: 'gore', brandHandle: GORE_THREADS_TEST.username });
  if (!app?.configured || app.appId !== command.appId || app.appKey !== 'gore') throw Error('app-unavailable');
  const result = await fetchMetaThreadsConnections(workspaceId, command.accountId);
  const row = result.connections?.[0], config = row?.config;
  if (!result.available || row?.workspace_id !== workspaceId || row.provider !== 'meta_threads' || row.status !== 'connected' ||
    !matchesMetaOAuthConnection(row, app, command.accountId) || typeof config.accessToken !== 'string' || !config.accessToken.trim() ||
    !(Date.parse(config.expiresAt) > Date.now() + 60000) ||
    !['threads_basic','threads_content_publish'].every(scope => String(config.scope || '').split(/[,\s]+/).includes(scope))) throw Error('connection-unavailable');
  return { accessToken: config.accessToken };
}

const reply = (status, job, reason = null, httpStatus = 200) => ({ status, job: publicGoreJob(job), reason, httpStatus });
export async function runGoreThreadsTest(input, {
  workspaceId = resolveDefaultWorkspaceId(), enabled = process.env.COM_MOON_THREADS_TEXT_TEST_ENABLED === 'true',
  repo = createGoreTestRepository({ workspaceId }), readCredential = credential,
  adapterFactory = createThreadsTextTestAdapter, owner = randomUUID(),
  now = Date.now, monotonicNow = () => performance.now(),
} = {}) {
  const command = normalizeGoreTestCommand(input);
  if (!command || !approvedGorePayload(workspaceId, command.accountId, command.appId)) return reply('invalid-input', null, 'invalid-contract', 400);
  if (!enabled) return reply('disabled', null, 'one-post-test-not-enabled', 503);
  let job, lease, leaseWindow;
  function assertEffectLeaseBudget() {
    // Use the larger elapsed duration: monotonic time resists wall-clock rollback,
    // while wall time covers host sleep on clocks that pause during suspend.
    const elapsedMs = leaseWindow && Math.max(now() - leaseWindow.startedAt, monotonicNow() - leaseWindow.startedMonotonic);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 ||
      leaseWindow.remainingMs - elapsedMs <= THREADS_TEXT_REQUEST_TIMEOUT_MS + EFFECT_LEASE_MARGIN_MS) throw Error('effect-lease-unavailable');
  }
  async function advance(state, extra = {}) {
    const result = await repo.command('advance', { jobId: job.id, owner, leaseToken: lease, expectedVersion: job.version, state, ...extra });
    if (result.status !== 'saved' || !matchesApprovedGoreJob(result.job, workspaceId, command)) throw Error('job-storage-unconfirmed');
    job = result.job;
  }
  try {
    if (command.action === 'prepare') {
      await readCredential(workspaceId, command);
      const result = await repo.command('prepare', approvedGorePayload(workspaceId, command.accountId, command.appId));
      if (!matchesApprovedGoreJob(result.job, workspaceId, command)) return reply('conflict', null, 'preparation-unconfirmed', 409);
      return reply(result.status, result.job, null, ['saved','duplicate'].includes(result.status) ? 200 : 409);
    }
    const current = await repo.command('get', { jobId: command.jobId });
    job = current.job;
    if (!matchesApprovedGoreJob(job, workspaceId, command)) return reply('conflict', null, 'job-identity-mismatch', 409);
    if (job.state === 'verified') return reply('verified', job);
    // Read only; no OAuth refresh or credential modification occurs here.
    const secret = await readCredential(workspaceId, command);
    const adapter = adapterFactory(secret);
    const profile = await adapter.profile();
    if (profile?.id !== command.accountId || profile.username !== GORE_THREADS_TEST.username) return reply('conflict', job, 'provider-account-mismatch', 409);
    // Anchor BEFORE the RPC so delayed acknowledgement consumes the DB lease.
    // Relative DB budget avoids assuming synchronized application/DB wall clocks.
    const startedAt = now(), startedMonotonic = monotonicNow();
    const claimed = await repo.command(command.action === 'execute' ? 'claim' : 'lookup', { jobId: job.id, owner });
    if (claimed.status !== 'claimed') return reply(claimed.status, claimed.job, 'job-not-claimed', 409);
    job = claimed.job; lease = claimed.leaseToken;
    if (!matchesApprovedGoreJob(job, workspaceId, command) || !lease) throw Error('job-storage-unconfirmed');
    if (typeof claimed.leaseExpiresAt !== 'string' || !Number.isFinite(Date.parse(claimed.leaseExpiresAt)) ||
      !Number.isSafeInteger(claimed.leaseRemainingMs) || claimed.leaseRemainingMs <= 0 || claimed.leaseRemainingMs > 90000) throw Error('job-storage-unconfirmed');
    // Private claim metadata; never included in the public job projection or logs.
    leaseWindow = { expiresAt: claimed.leaseExpiresAt, remainingMs: claimed.leaseRemainingMs, startedAt, startedMonotonic };
    if (command.action === 'execute') {
      await advance('creating'); // Durable write intent BEFORE any provider POST.
      assertEffectLeaseBudget();
      const containerId = await adapter.createContainer(job.body, { beforeSend: assertEffectLeaseBudget });
      await advance('container_ready', { containerId });
      const container = await adapter.container(containerId);
      if (container.status !== 'FINISHED') throw Error('container-not-ready');
      await advance('publish_requested'); // Lost publish response remains ambiguous.
      assertEffectLeaseBudget();
      const postId = await adapter.publish(containerId, { beforeSend: assertEffectLeaseBudget });
      await advance('post_recorded', { postId });
    }
    // An operator-provided candidate is only attached after an exact provider GET.
    const candidatePostId = job.postId || command.observedPostId;
    if (candidatePostId) {
      const receipt = verifiedGorePost(await adapter.post(candidatePostId), { ...job, postId: candidatePostId });
      if (!receipt) throw Error('post-verification-unconfirmed');
      await advance('verified', { ...receipt, receiptSource: command.action === 'execute' ? 'provider-response' : 'operator-reconciled' });
      return reply('verified', job);
    }
    // A PUBLISHED container without a returned post ID does not prove which post to attach.
    if (job.containerId) await adapter.container(job.containerId);
    await advance('ambiguous', { errorCode: 'post-id-requires-manual-confirmation' });
    return reply('ambiguous', job, 'post-id-requires-manual-confirmation', 202);
  } catch {
    if (lease && job) {
      // A failed save may already have committed. CAS then fails safely; never retry POST.
      try { await advance('ambiguous', { errorCode: 'outcome-unconfirmed' }); } catch {}
      return reply('ambiguous', job, 'outcome-unconfirmed-read-before-retry', 202);
    }
    return reply('blocked', job, 'configuration-or-read-unconfirmed', 503);
  }
}

export async function readGoreThreadsTestJob(jobId, { workspaceId = resolveDefaultWorkspaceId(), repo = createGoreTestRepository({ workspaceId }) } = {}) {
  try { const result = await repo.command('get', { jobId }); return reply(result.status, result.job); }
  catch { return reply('error', null, 'job-read-unconfirmed'); }
}

import { resolveGmailConnection, getValidGmailAccessToken, createGmailInquiryClient, hasGmailReadScope } from './google-gmail.js';
import { assertOperatorEmail } from './sales-os/operator-scope.js';
import { isGoogleOAuthProviderEnabled } from './integration-readiness.js';
import { resolveDefaultWorkspaceId } from './server-write.js';
import { fetchSupabaseRowsDetailed, eqFilter } from './server-read.js';
import { forwardInquiryCommand } from './inquiry-engine-client.js';
import { classifyInquiryEmail, decodeGmailMessage } from './inquiry-email.js';

const DAY = 86400000;
const EXCLUDED = new Set(['SENT', 'DRAFT', 'SPAM', 'TRASH']);
const copy = value => structuredClone(value);
const iso = timestamp => new Date(timestamp).toISOString();
const clamp = (value, fallback, ceiling) => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.min(Math.floor(Number(value)), ceiling) : fallback;

export async function findKnownInquiryThread({ workspaceId, accountKey, threadId }, read = fetchSupabaseRowsDetailed) {
  if (!threadId) return false;
  const result = await read('inquiry_events', {
    select: 'id', filters: [['workspace_id', eqFilter(workspaceId)], ['source', 'eq.gmail'], ['source_account_key', eqFilter(accountKey)], ['thread_id', eqFilter(threadId)]], limit: 1,
  });
  if (!Array.isArray(result?.rows)) throw new Error('inquiry-thread-read-failed');
  return result.rows.length > 0;
}

const defaults = {
  now: Date.now, resolveConnection: resolveGmailConnection, getAccessToken: getValidGmailAccessToken,
  createClient: createGmailInquiryClient, checkOperator: assertOperatorEmail, knownThread: findKnownInquiryThread, command: forwardInquiryCommand,
};

function formsFromEnv(env) {
  if (!env.COM_MOON_INQUIRY_EMAIL_FORMS) return [];
  try {
    const parsed = JSON.parse(env.COM_MOON_INQUIRY_EMAIL_FORMS);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new Error('inquiry-email-forms-config-invalid'); }
}

function listState({ profile, now, previous = {}, recoverySince }) {
  return {
    ...previous, version: 1, phase: recoverySince ? 'recovery' : 'bootstrap',
    bootstrapStartedAt: previous.bootstrapStartedAt || iso(now),
    bootstrapSince: previous.bootstrapSince || iso(now - 7 * DAY),
    listSince: recoverySince || previous.bootstrapSince || iso(now - 7 * DAY), listBefore: iso(now),
    cursor: String(profile.historyId), pageToken: null, pending: [], afterPage: null,
    ...(recoverySince ? { recoverySince, recoveryNotice: `Gmail 커서 만료로 ${recoverySince} 이후 메일을 복구 수집합니다. 삭제되었거나 조회 범위 밖인 메일은 복구되지 않을 수 있습니다.` } : {}),
  };
}

// A newest-first bootstrap can encounter the reply before its earlier inquiry.
// Inspect earlier inbound context now, so this does not depend on page/run order.
async function earlierThreadInquiry(client, message, trustedForms) {
  const thread = await client.getThread(message.threadId);
  if (!Array.isArray(thread?.messages)) throw new Error('gmail-thread-page-invalid');
  const prior = thread.messages.filter(raw => raw.id !== message.id && Number(raw.internalDate) > 0 && Number(raw.internalDate) <= message.internalDate
    && !(raw.labelIds || []).some(label => EXCLUDED.has(label))).sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
  let evidence = null;
  for (const raw of prior.slice(0, 50)) {
    const classified = classifyInquiryEmail(decodeGmailMessage(raw), { trustedForms });
    const context = { kind: classified.kind, orgScope: classified.orgScope, classification: 'inquiry', reason: '앞선 수신 문의에 대한 추가 회신' };
    // Canonical form notices must establish Gmail-thread routing before a reply.
    // Assigning their canonicalKey to the reply would incorrectly mute its arrival.
    if (classified.canonicalKey) return { ...context, predecessorId: raw.id };
    if (classified.classification !== 'ignored' && !evidence) evidence = context;
  }
  return prior.length > 50 ? { kind: 'general', orgScope: 'unclassified', classification: 'review', reason: '긴 대화의 문의 문맥 확인 필요' } : evidence;
}

function tombstone(state, id, now) {
  const deletedMessageCount = (state.deletedMessageCount || 0) + 1;
  const deletedMessages = [...(state.deletedMessages || []), { id, at: iso(now), reason: 'gmail-message-deleted' }].slice(-100);
  const recovery = state.recoverySince ? `Gmail 커서 만료로 ${state.recoverySince} 이후 메일을 복구 수집합니다. ` : '';
  return { ...state, deletedMessages, deletedMessageCount, recoveryNotice: `${recovery}Gmail에서 삭제된 원문 ${deletedMessageCount}건을 건너뛰었습니다. 삭제된 내용은 복구할 수 없습니다.` };
}

// Every pending page and successful prefix lives in Engine. A failed event is
// retained at pending[0]; only a saved/duplicate receipt permits advancement.
export async function runGmailInquirySync(options = {}, overrides = {}) {
  const deps = { ...defaults, ...overrides }, env = options.env || process.env;
  const workspaceId = options.workspaceId || resolveDefaultWorkspaceId();
  const maxMessages = clamp(options.maxMessages, 20, 50), maxPages = clamp(options.maxPages, 5, 10);
  const startedAt = deps.now(), deadline = startedAt + clamp(options.maxDurationMs, 35000, 45000);
  const counts = { scanned: 0, staged: 0, duplicates: 0, skipped: 0 };
  let state = {}, sync = {}, connection, accountKey, leaseToken, leaseValid = false, preflightComplete = false, pages = 0, finished = false;
  const output = (status, extra = {}) => ({ status, ...counts, remaining: state.pending?.length || 0, phase: state.phase || null,
    recoverySince: state.recoverySince || null, recoveryNotice: state.recoveryNotice || null, ...extra });
  if (!workspaceId) return output('preview', { reason: 'workspace-not-configured' });
  if (!isGoogleOAuthProviderEnabled('gmail', env)) return output('preview', { reason: 'gmail-provider-not-enabled' });

  async function checkpoint(nextState, extra = {}) {
    const result = await deps.command({ action: 'save_sync', workspaceId, accountKey, leaseToken, state: nextState, ...extra }, { env });
    if (!result.ok || result.data?.status !== 'saved') {
      // Any failed checkpoint makes ownership uncertain: no further mutation.
      leaseValid = false;
      throw new Error(result.data?.error || 'inquiry-sync-checkpoint-failed');
    }
    state = copy(nextState);
  }
  function nextAfterMessage(current) {
    const next = { ...current, pending: current.pending.slice(1) };
    if (!next.pending.length && next.afterPage) {
      const { done, ...transition } = next.afterPage;
      Object.assign(next, transition, { afterPage: null });
      return { next, done: done === true };
    }
    return { next, done: false };
  }
  try {
    const trustedForms = formsFromEnv(env);
    connection = await deps.resolveConnection(workspaceId);
    if (!connection) return output('preview', { reason: 'gmail-not-connected' });
    const accessToken = await deps.getAccessToken(connection);
    if (!accessToken) throw Object.assign(new Error('gmail-reconnect-required'), { code: 'gmail-reconnect-required' });
    const client = deps.createClient({ accessToken });
    const tokenInfo = await client.getTokenInfo();
    if (!hasGmailReadScope(tokenInfo?.scope)) throw Object.assign(new Error('gmail-read-scope-required'), { code: 'gmail-read-scope-required' });
    // Profile is authenticated by Gmail, unlike the stored config/email hint.
    const profile = await client.getProfile();
    const checked = deps.checkOperator(profile?.emailAddress, 'google_gmail');
    if (!checked.ok) throw Object.assign(new Error(checked.reason), { code: checked.reason });
    if (!/^\d+$/.test(String(profile.historyId || ''))) throw new Error('gmail-history-id-missing');
    accountKey = String(checked.email).trim().toLowerCase();
    preflightComplete = true;
    const claimed = await deps.command({ action: 'claim_sync', workspaceId, accountKey }, { env });
    if (!claimed.ok || claimed.data?.status !== 'saved') {
      const status = ['busy', 'preview'].includes(claimed.data?.status) ? claimed.data.status : 'error';
      return output(status, { reason: claimed.data?.error || (status === 'busy' ? 'inquiry-sync-busy' : 'inquiry-sync-unavailable'), error: claimed.data?.error });
    }
    leaseToken = claimed.data.leaseToken;
    if (!leaseToken) throw new Error('inquiry-sync-lease-missing');
    leaseValid = true;
    state = copy(claimed.data.state || {}); sync = claimed.data.sync || {};
    if (!state.version) await checkpoint(listState({ profile, now: deps.now(), previous: {
      bootstrapStartedAt: iso(startedAt), bootstrapSince: iso(startedAt - 7 * DAY),
    } }));
    else if (state.version !== 1 || !['bootstrap', 'recovery', 'history'].includes(state.phase) || !Array.isArray(state.pending) || !/^\d+$/.test(state.cursor || '')) throw new Error('inquiry-sync-state-invalid');
    const knownThreads = new Map();
    while (!finished && counts.scanned < maxMessages && deps.now() < deadline) {
      if (state.pending.length) {
        // Renew before fetching/ingesting. The ingest command also carries the
        // fence, so expiration during a Gmail fetch cannot produce a stale write.
        await checkpoint(state);
        const id = state.pending[0];
        let rawMessage;
        try { rawMessage = await client.getMessage(id); }
        catch (error) {
          if (error.status !== 404) throw error;
          // Permanent deletion is a recorded gap, not a retryable fetch failure.
          const advance = nextAfterMessage(tombstone(state, id, deps.now()));
          await checkpoint(advance.next);
          counts.scanned += 1; counts.skipped += 1; finished = advance.done;
          continue;
        }
        const message = decodeGmailMessage(rawMessage);
        if (!message.id || message.id !== id) throw new Error('gmail-message-identity-mismatch');
        counts.scanned += 1;
        if (!message.labelIds.some(label => EXCLUDED.has(label))) {
          if (!knownThreads.has(message.threadId)) knownThreads.set(message.threadId, await deps.knownThread({ workspaceId, accountKey, threadId: message.threadId }));
          let classification = classifyInquiryEmail(message, { trustedForms, knownThread: knownThreads.get(message.threadId) });
          if (message.threadId && !knownThreads.get(message.threadId) && !classification.canonicalKey
            && (classification.classification !== 'ignored' || classification.reason === '문의 신호 없음')) {
            const context = await earlierThreadInquiry(client, message, trustedForms);
            if (context?.predecessorId && !(state.deletedMessages || []).some(item => item.id === context.predecessorId)) {
              await checkpoint({ ...state, pending: [context.predecessorId, ...state.pending.filter(pendingId => pendingId !== context.predecessorId)] });
              continue;
            }
            if (context && classification.classification === 'ignored') {
              const { predecessorId, ...detection } = context;
              classification = { ...classification, ...detection };
            }
          }
          if (classification.classification !== 'ignored') {
            const receipt = await deps.command({ action: 'ingest', workspaceId, source: 'gmail', sourceAccountKey: accountKey, externalEventId: id,
              accountKey, leaseToken, threadId: message.threadId, subject: classification.subject || message.subject || '제목 없는 문의', body: classification.body || message.body || '(본문 확인 필요)',
              contact: classification.contact, kind: classification.kind, classification: classification.classification, reason: classification.reason,
              orgScope: classification.orgScope, ...(classification.canonicalKey ? { canonicalKey: classification.canonicalKey } : {}),
              receivedAt: message.receivedAt || state.bootstrapStartedAt, historical: !message.internalDate || message.internalDate < Date.parse(state.bootstrapStartedAt),
              sourceUrl: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(accountKey)}#all/${encodeURIComponent(message.threadId || id)}` }, { env });
            if (!receipt.ok || !['saved', 'duplicate'].includes(receipt.data?.status)) {
              if (/lease/i.test(receipt.data?.error || '')) leaseValid = false;
              throw new Error(receipt.data?.error || 'inquiry-ingest-failed');
            }
            if (receipt.data.status === 'duplicate') counts.duplicates += 1;
            else counts.staged += 1;
            knownThreads.set(message.threadId, true);
          } else counts.skipped += 1;
        } else counts.skipped += 1;
        const advance = nextAfterMessage(state);
        await checkpoint(advance.next);
        finished = advance.done;
        continue;
      }
      if (pages >= maxPages) break;
      pages += 1;
      let pending, afterPage;
      if (state.phase === 'bootstrap' || state.phase === 'recovery') {
        const page = await client.listMessages({ after: state.listSince, before: state.listBefore, pageToken: state.pageToken, maxResults: 50 });
        if (page.messages !== undefined && !Array.isArray(page.messages)) throw new Error('gmail-message-page-invalid');
        pending = [...new Set((page.messages || []).map(m => m.id).filter(Boolean))];
        afterPage = page.nextPageToken ? { pageToken: page.nextPageToken } : { phase: 'history', pageToken: null };
      } else {
        const requestedAt = iso(deps.now());
        let page;
        try { page = await client.listHistory({ startHistoryId: state.cursor, pageToken: state.pageToken, maxResults: 50 }); }
        catch (error) {
          if (error.status !== 404) throw error;
          const recoveryProfile = await client.getProfile();
          const recoveryAccount = deps.checkOperator(recoveryProfile?.emailAddress, 'google_gmail');
          if (!recoveryAccount.ok || recoveryAccount.email !== accountKey) throw new Error('operator-email-mismatch');
          if (!/^\d+$/.test(String(recoveryProfile.historyId || ''))) throw new Error('gmail-history-id-missing');
          const candidates = [sync.last_success_at, state.coverageThrough].map(Date.parse).filter(Number.isFinite);
          const recoverySince = iso(candidates.length ? Math.min(...candidates) - 5 * 60000 : Date.parse(state.bootstrapSince || state.bootstrapStartedAt) - 5 * 60000);
          await checkpoint(listState({ profile: recoveryProfile, now: deps.now(), previous: state, recoverySince }));
          continue;
        }
        if ((page.history !== undefined && !Array.isArray(page.history)) || !/^\d+$/.test(String(page.historyId || ''))) throw new Error('gmail-history-page-invalid');
        pending = [...new Set((page.history || []).flatMap(entry => (entry.messagesAdded || []).map(added => added.message?.id)).filter(Boolean))];
        afterPage = page.nextPageToken ? { pageToken: page.nextPageToken } : { pageToken: null, cursor: String(page.historyId), coverageThrough: requestedAt, done: true };
      }
      if (pending.length) await checkpoint({ ...state, pending, afterPage });
      else {
        const { done, ...transition } = afterPage;
        await checkpoint({ ...state, ...transition, pending: [], afterPage: null });
        finished = done === true;
      }
    }
    if (finished) {
      await checkpoint(state, { success: true });
      return output('saved');
    }
    return output('partial', { reason: 'inquiry-sync-continuation', hasMore: true });
  } catch (error) {
    const errorCode = error?.code || (!preflightComplete && [401, 403].includes(error?.status) ? 'gmail-reconnect-required' :
      error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'gmail-sync-timeout' : error?.message || 'gmail-sync-failed');
    // A prior saved OAuth connection was operator-validated at connection time.
    // On auth failure it may identify the *health record* only: no mailbox read,
    // ingest or success is authorized by this cached identity.
    if (!preflightComplete && !leaseToken && connection?.source === 'connection') {
      const prior = deps.checkOperator(connection.config?.email, 'google_gmail');
      if (prior.ok) {
        try {
          const failedAccount = String(prior.email).trim().toLowerCase();
          const claim = await deps.command({ action: 'claim_sync', workspaceId, accountKey: failedAccount }, { env });
          if (claim.ok && claim.data?.status === 'saved' && claim.data.leaseToken) {
            accountKey = failedAccount; leaseToken = claim.data.leaseToken; leaseValid = true;
            state = copy(claim.data.state || {}); sync = claim.data.sync || {};
          }
        } catch { /* the original preflight failure remains the visible reason */ }
      }
    }
    if (leaseToken && leaseValid) {
      try { await checkpoint(state, { success: false, error: errorCode }); } catch { /* state is still at the last confirmed checkpoint */ }
    }
    const reconnect = ['gmail-reconnect-required', 'gmail-read-scope-required', 'operator-email-mismatch', 'missing-operator-email'].includes(errorCode);
    return output(counts.staged + counts.duplicates + counts.skipped > 0 ? 'partial' : 'error', { error: errorCode, ...(reconnect ? { reason: errorCode } : {}), retryable: !reconnect });
  } finally {
    if (leaseToken && leaseValid) {
      try { await deps.command({ action: 'release_sync', workspaceId, accountKey, leaseToken }, { env }); } catch { /* a lease expires automatically */ }
    }
  }
}

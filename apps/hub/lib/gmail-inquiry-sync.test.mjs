import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { canonicalFormSubmission } from './inquiry-email.js';
import { readFile } from 'node:fs/promises';
import { runGmailInquirySync, findKnownInquiryThread } from './gmail-inquiry-sync.js';
import { createGmailInquiryClient, hasGmailReadScope, buildGoogleGmailAuthUrl } from './google-gmail.js';
const READ = 'https://www.googleapis.com/auth/gmail.readonly';
const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const account = 'operator@example.com';
const NOW = Date.parse('2026-09-13T09:00:00Z');
const clone = value => structuredClone(value);
function raw(id, { body = '도입 상담을 요청합니다.', date = NOW - 10000, threadId = `t-${id}`, labels = ['INBOX'] } = {}) {
  return { id, threadId, internalDate: String(date), labelIds: labels, payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: '고객 <customer@naver.com>' }, { name: 'Subject', value: '안녕하세요' }], body: { data: Buffer.from(body).toString('base64url') } } };
}
function harness({ state = {}, sync = {}, messages = {}, pages = [], histories = [], knownThread = false, failure } = {}) {
  const saved = { state: clone(state), sync: clone(sync) }, calls = [], ingest = [], clientCalls = [];
  const client = {
    getTokenInfo: async () => ({ scope: READ }),
    getThread: async threadId => ({ messages: Object.values(messages).filter(message => message.threadId === threadId) }),
    getProfile: async () => { clientCalls.push(['profile']); return { emailAddress: account.toUpperCase(), historyId: '100' }; },
    listMessages: async options => { clientCalls.push(['list', clone(options)]); return pages.shift() || { messages: [] }; },
    listHistory: async options => { clientCalls.push(['history', clone(options)]); const result = histories.shift(); if (result instanceof Error) throw result; return result || { history: [], historyId: '200' }; },
    getMessage: async id => { clientCalls.push(['message', id]); if (messages[id] instanceof Error) throw messages[id]; return messages[id] || raw(id); },
  };
  const deps = {
    now: () => NOW,
    resolveConnection: async () => ({ refreshToken: 'synthetic', config: { scope: READ } }),
    getAccessToken: async () => 'synthetic-token',
    createClient: () => client,
    checkOperator: value => value.toLowerCase() === account ? { ok: true, email: account } : { ok: false, reason: 'operator-email-mismatch' },
    knownThread: async () => knownThread,
    command: async command => {
      calls.push(clone(command));
      const failed = failure?.(command, calls);
      if (failed) return { ok: false, httpStatus: 409, data: { status: 'error', error: failed } };
      if (command.action === 'claim_sync') return { ok: true, data: { status: 'saved', leaseToken: 'lease', state: clone(saved.state), sync: clone(saved.sync) } };
      if (command.action === 'save_sync') { saved.state = clone(command.state); if (command.success) saved.sync.last_success_at = new Date(NOW).toISOString(); return { ok: true, data: { status: 'saved' } }; }
      if (command.action === 'ingest') { ingest.push(clone(command)); return { ok: true, data: { status: 'saved' } }; }
      return { ok: true, data: { status: 'saved' } };
    },
  };
  return { deps, client, saved, calls, ingest, clientCalls, run: options => runGmailInquirySync({ workspaceId, env: { GOOGLE_OAUTH_ENABLED_PROVIDERS: 'gmail' }, ...options }, deps) };
}
const history = (ids, more = {}) => ({ history: [{ messagesAdded: ids.map(id => ({ message: { id } })) }], historyId: '200', ...more });
const existing = { version: 1, phase: 'history', cursor: '50', pending: [], bootstrapStartedAt: new Date(NOW - 86400000).toISOString() };

test('bootstrap captures history first, consumes all pages and catches racing mail with correct historical flags', async () => {
  const h = harness({ pages: [{ messages: [{ id: 'old1' }], nextPageToken: 'page2' }, { messages: [{ id: 'old2' }] }], histories: [history(['new'])], messages: { new: raw('new', { date: NOW + 100 }) } });
  const result = await h.run();
  assert.equal(result.status, 'saved'); assert.equal(result.staged, 3);
  assert.ok(h.clientCalls.findIndex(([name]) => name === 'profile') < h.clientCalls.findIndex(([name]) => name === 'list'));
  const lists = h.clientCalls.filter(([name]) => name === 'list').map(([, args]) => args);
  assert.equal(lists[1].pageToken, 'page2'); assert.equal(lists[0].after, new Date(NOW - 7 * 86400000).toISOString());
  assert.deepEqual(h.ingest.map(x => x.historical), [true, true, false]);
  assert.ok(h.ingest.every(x => x.sourceAccountKey === account && x.leaseToken === 'lease' && x.accountKey === account));
  assert.equal(h.saved.state.cursor, '200'); assert.deepEqual(h.saved.state.pending, []);
});
test('bounded runs persist pending IDs and resume a page before advancing the cursor', async () => {
  const h = harness({ state: existing, histories: [history(['a', 'b'])] });
  const first = await h.run({ maxMessages: 1 });
  assert.equal(first.status, 'partial'); assert.equal(h.saved.state.cursor, '50'); assert.deepEqual(h.saved.state.pending, ['b']);
  const second = await h.run();
  assert.equal(second.status, 'saved'); assert.equal(h.saved.state.cursor, '200');
  assert.deepEqual(h.ingest.map(x => x.externalEventId), ['a', 'b']);
});
test('history pagination retains start cursor until the final page is persisted', async () => {
  const h = harness({ state: existing, histories: [history(['a'], { nextPageToken: 'next-history' }), history(['b'], { historyId: '300' })] });
  assert.equal((await h.run()).status, 'saved');
  const calls = h.clientCalls.filter(([name]) => name === 'history').map(([, args]) => args);
  assert.equal(calls[0].startHistoryId, '50'); assert.equal(calls[1].startHistoryId, '50'); assert.equal(calls[1].pageToken, 'next-history');
  assert.equal(h.saved.state.cursor, '300');
});
test('failed ingest preserves the unprocessed suffix and cursor for the next execution', async () => {
  let fail = true;
  const h = harness({ state: existing, histories: [history(['a', 'b'])], failure: c => c.action === 'ingest' && c.externalEventId === 'b' && fail ? 'database-unavailable' : null });
  const result = await h.run();
  assert.equal(result.status, 'partial'); assert.equal(result.staged, 1); assert.equal(result.error, 'database-unavailable');
  assert.equal(h.saved.state.cursor, '50'); assert.deepEqual(h.saved.state.pending, ['b']);
  fail = false; assert.equal((await h.run()).status, 'saved'); assert.equal(h.saved.state.cursor, '200');
});
test('checkpoint lease loss stops before an ingest and never writes failure state through a stale lease', async () => {
  let saves = 0;
  const h = harness({ state: existing, histories: [history(['a'])], failure: c => c.action === 'save_sync' && ++saves >= 2 ? 'lease-lost' : null });
  const result = await h.run();
  assert.equal(result.status, 'error'); assert.equal(result.error, 'lease-lost'); assert.equal(h.ingest.length, 0);
  assert.deepEqual(h.saved.state.pending, ['a']);
  assert.equal(h.calls.filter(c => c.action === 'save_sync').length, 2);
});
test('history 404 starts visible paginated recovery from the prior success rather than latest 20', async () => {
  const lastSuccess = new Date(NOW - 3 * 86400000).toISOString();
  const h = harness({ state: existing, sync: { last_success_at: lastSuccess }, histories: [Object.assign(new Error('gmail-history-expired'), { status: 404 }), history(['recent'])], pages: [{ messages: [{ id: 'recovered' }], nextPageToken: 'recover-page2' }, { messages: [] }] });
  assert.equal((await h.run()).status, 'saved');
  const list = h.clientCalls.find(([name]) => name === 'list')[1];
  assert.ok(Date.parse(list.after) <= Date.parse(lastSuccess));
  assert.match(h.saved.state.recoveryNotice, /커서|복구/); assert.ok(h.saved.state.recoverySince);
  assert.deepEqual(h.ingest.map(x => x.externalEventId), ['recovered', 'recent']);
});
test('existing thread no-keyword replies and archived/read inquiries are collected', async () => {
  const h = harness({ state: existing, knownThread: true, histories: [history(['reply'])], messages: { reply: raw('reply', { body: '네, 내일 가능합니다.', labels: [] }) } });
  assert.equal((await h.run()).staged, 1); assert.equal(h.ingest[0].classification, 'inquiry');
  assert.match(h.ingest[0].sourceUrl, /^https:\/\/mail.google.com\//);
});
test('known-thread query failure stops rather than silently dropping a reply', async () => {
  const h = harness({ state: existing, histories: [history(['reply'])], messages: { reply: raw('reply', { body: '네, 내일 가능합니다.' }) } });
  h.deps.knownThread = async () => { throw new Error('inquiry-thread-read-failed'); };
  const result = await h.run();
  assert.equal(result.status, 'error'); assert.equal(result.error, 'inquiry-thread-read-failed'); assert.deepEqual(h.saved.state.pending, ['reply']);
});
test('known-thread reads are tenant/account/thread scoped and null rows are an error', async () => {
  let query;
  assert.equal(await findKnownInquiryThread({ workspaceId, accountKey: account, threadId: 'thread-1' }, async (table, opts) => { query = { table, ...opts }; return { rows: [{ id: 'existing' }] }; }), true);
  assert.equal(query.table, 'inquiry_events');
  for (const name of ['workspace_id', 'source', 'source_account_key', 'thread_id']) assert.ok(query.filters.some(([key]) => key === name));
  await assert.rejects(() => findKnownInquiryThread({ workspaceId, accountKey: account, threadId: 'thread-1' }, async () => ({ rows: null })), /inquiry-thread-read-failed/);
});
test('false stored readonly readiness and account mismatch never claim or ingest', async () => {
  const missingRead = harness(); missingRead.client.getTokenInfo = async () => ({ scope: 'https://www.googleapis.com/auth/gmail.send' });
  assert.equal((await missingRead.run()).reason, 'gmail-read-scope-required'); assert.equal(missingRead.calls.length, 0);
  const mismatch = harness(); mismatch.client.getProfile = async () => ({ emailAddress: 'stranger@example.com', historyId: '10' });
  assert.equal((await mismatch.run()).error, 'operator-email-mismatch'); assert.equal(mismatch.calls.length, 0);
});
test('no connection or disabled provider is preview and a busy lease is not success', async () => {
  const h = harness(); h.deps.resolveConnection = async () => null;
  assert.equal((await h.run()).status, 'preview');
  assert.equal((await h.run({ env: {} })).reason, 'gmail-provider-not-enabled');
  const busy = harness(); busy.deps.command = async () => ({ ok: false, data: { status: 'busy' } });
  assert.equal((await busy.run()).status, 'busy'); assert.equal(busy.ingest.length, 0);
});
test('Gmail read helper accepts readonly/modify/full scopes and keeps cursor errors typed', async () => {
  for (const scope of [READ, 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/']) assert.equal(hasGmailReadScope(scope), true);
  assert.equal(hasGmailReadScope('https://www.googleapis.com/auth/gmail.send'), false);
  const urls = [];
  const api = createGmailInquiryClient({ accessToken: 'synthetic', fetchImpl: async url => { urls.push(new URL(url)); return new Response('{}', { status: 404 }); } });
  await assert.rejects(() => api.listHistory({ startHistoryId: '100', pageToken: 'page-2' }), e => e.status === 404);
  assert.equal(urls[0].searchParams.get('historyTypes'), 'messageAdded');
  assert.equal(urls[0].searchParams.has('labelId'), false);
});
test('Gmail listing has an explicit range, pagination and no inbox/unread restriction', async () => {
  let url;
  const api = createGmailInquiryClient({ accessToken: 'synthetic', fetchImpl: async target => { url = new URL(target); return Response.json({ messages: [] }); } });
  await api.listMessages({ after: new Date(NOW - 7 * 86400000).toISOString(), before: new Date(NOW).toISOString(), pageToken: 'page-2', maxResults: 50 });
  assert.equal(url.searchParams.get('pageToken'), 'page-2'); assert.equal(url.searchParams.get('maxResults'), '50');
  assert.ok(url.searchParams.get('q').includes('after:')); assert.equal(url.searchParams.has('labelIds'), false); assert.ok(!url.searchParams.get('q').includes('is:unread'));
});
test('OAuth Gmail builder respects the explicit provider allowlist', () => {
  const old = { ...process.env };
  try {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic', COM_MOON_OAUTH_STATE_SECRET: 'synthetic', GOOGLE_OAUTH_ENABLED_PROVIDERS: 'calendar' });
    assert.equal(buildGoogleGmailAuthUrl({ origin: 'https://hub.example.com' }), null);
    process.env.GOOGLE_OAUTH_ENABLED_PROVIDERS = 'gmail';
    assert.ok(new URL(buildGoogleGmailAuthUrl({ origin: 'https://hub.example.com' })).searchParams.get('scope').includes(READ));
  } finally { process.env = old; }
});
test('scan GET only returns durable status; cron has an exact bearer gate and opt-in flag', async () => {
  const scan = await readFile(new URL('../app/api/hub/email/scan/route.js', import.meta.url), 'utf8');
  const cron = await readFile(new URL('../app/api/cron/inquiries-sync/route.js', import.meta.url), 'utf8');
  assert.match(scan, /getInquirySyncStatus/); assert.doesNotMatch(scan.slice(scan.indexOf('export async function GET')), /runGmailInquirySync\(/);
  assert.match(scan, /assertHubWriteAllowed/);
  assert.match(cron, /COM_MOON_INQUIRY_AUTO_SYNC/); assert.match(cron, /CRON_SECRET/);
});

test('cron rejects missing/wrong Bearer credentials in development and disables collection until opted in', async () => {
  const { GET } = await import('../app/api/cron/inquiries-sync/route.js');
  const old = { ...process.env };
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.CRON_SECRET;
    assert.equal((await GET(new Request('https://hub.example.com/api/cron/inquiries-sync'))).status, 401);
    process.env.CRON_SECRET = 'synthetic-cron-secret';
    for (const authorization of ['synthetic-cron-secret', 'Bearer wrong', 'bearer synthetic-cron-secret', 'Bearer synthetic-cron-secret extra']) {
      assert.equal((await GET(new Request('https://hub.example.com/api/cron/inquiries-sync', { headers: { authorization } }))).status, 401);
    }
    delete process.env.COM_MOON_INQUIRY_AUTO_SYNC;
    const result = await GET(new Request('https://hub.example.com/api/cron/inquiries-sync', { headers: { authorization: 'Bearer synthetic-cron-secret' } }));
    assert.equal(result.status, 202); assert.equal((await result.json()).reason, 'inquiry-auto-sync-disabled');
  } finally { process.env = old; }
});
test('manual scan is write guarded and malformed input never starts collection', async () => {
  const { POST } = await import('../app/api/hub/email/scan/route.js');
  const old = { ...process.env };
  try {
    process.env.NODE_ENV = 'development';
    process.env.COM_MOON_HUB_WRITE_SECRET = 'synthetic-write-secret';
    assert.equal((await POST(new Request('https://hub.example.com/api/hub/email/scan', { method: 'POST', body: '{}' }))).status, 401);
    assert.equal((await POST(new Request('https://hub.example.com/api/hub/email/scan', { method: 'POST', headers: { origin: 'https://hub.example.com' }, body: '{broken' }))).status, 400);
  } finally { process.env = old; }
});

test('missing date fallback is stable across a saved-event checkpoint loss retry', async () => {
  const h = harness({ state: existing, histories: [history(['a'])], messages: { a: { ...raw('a'), internalDate: '' } }, failure: (c, calls) => c.action === 'save_sync' && calls.some(x => x.action === 'ingest') && !h.allowSave ? 'network-after-save' : null });
  await h.run();
  assert.equal(h.ingest.length, 1); assert.deepEqual(h.saved.state.pending, ['a']);
  h.allowSave = true; h.deps.now = () => NOW + 86400000;
  await h.run();
  assert.equal(h.ingest.length, 2); assert.equal(h.ingest[0].receivedAt, h.ingest[1].receivedAt);
});
test('an ingest lease loss stops all later checkpoint and release writes', async () => {
  const h = harness({ state: existing, histories: [history(['a', 'b'])], failure: c => c.action === 'ingest' ? 'stale-lease' : null });
  const result = await h.run();
  assert.equal(result.error, 'stale-lease');
  assert.equal(h.calls.at(-1).action, 'ingest'); assert.deepEqual(h.saved.state.pending, ['a', 'b']);
});
test('Gmail message fetch failure retains a pending message and excludes sent mail without a thread lookup', async () => {
  const h = harness({ state: existing, histories: [history(['a', 'b'])], messages: { a: raw('a', { labels: ['SENT'] }), b: new Error('gmail-api-503') } });
  h.deps.knownThread = async () => { throw new Error('must-not-query-excluded-message'); };
  const result = await h.run(); assert.equal(result.status, 'partial'); assert.equal(result.error, 'gmail-api-503'); assert.deepEqual(h.saved.state.pending, ['b']); assert.equal(h.ingest.length, 0);
});

test('Gmail connection read failure is an error even when an environment refresh token exists', async () => {
  const { resolveGmailConnection } = await import('./google-gmail.js');
  const old = { ...process.env }, oldFetch = globalThis.fetch;
  try {
    process.env = { SUPABASE_URL: 'https://database.example.com', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key', GOOGLE_REFRESH_TOKEN: 'synthetic' };
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(() => resolveGmailConnection(workspaceId), /gmail-connection-read-failed/);
  } finally { process.env = old; globalThis.fetch = oldFetch; }
});
test('OAuth refresh has a timeout signal so collection cannot hang in token exchange', async () => {
  const { refreshGoogleGmailAccessToken } = await import('./google-gmail.js');
  const old = { ...process.env }, oldFetch = globalThis.fetch;
  let signal;
  try {
    process.env = { GOOGLE_CLIENT_ID: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic' };
    globalThis.fetch = async (_url, options) => { signal = options.signal; return Response.json({ access_token: 'synthetic' }); };
    await refreshGoogleGmailAccessToken('synthetic');
    assert.ok(signal instanceof AbortSignal);
  } finally { process.env = old; globalThis.fetch = oldFetch; }
});

test('permanently deleted message is durably tombstoned before advancing to later mail', async () => {
  const h = harness({ state: existing, histories: [history(['deleted', 'newer'])], messages: { deleted: Object.assign(new Error('gmail-api-404'), { status: 404 }) } });
  const first = await h.run({ maxMessages: 1 });
  assert.equal(first.status, 'partial'); assert.deepEqual(h.saved.state.pending, ['newer']);
  assert.equal(h.saved.state.deletedMessages[0].id, 'deleted'); assert.match(h.saved.state.recoveryNotice, /삭제/);
  const second = await h.run(); assert.equal(second.status, 'saved'); assert.equal(second.staged, 1);
  assert.equal(h.saved.state.cursor, '200'); assert.equal(h.saved.state.deletedMessageCount, 1);
});
test('failed tombstone checkpoint retains deleted message and stops progression', async () => {
  const h = harness({ state: existing, histories: [history(['deleted', 'newer'])], messages: { deleted: Object.assign(new Error('gmail-api-404'), { status: 404 }) }, failure: c => c.action === 'save_sync' && c.state.deletedMessages?.length ? 'tombstone-save-failed' : null });
  const result = await h.run(); assert.equal(result.error, 'tombstone-save-failed'); assert.deepEqual(h.saved.state.pending, ['deleted', 'newer']); assert.equal(h.ingest.length, 0);
});
test('newest-first bootstrap keeps a keywordless reply using earlier inbound thread context across runs', async () => {
  const messages = { reply: raw('reply', { body: '확인했습니다. 내일 가능합니다.', date: NOW - 1000, threadId: 'thread1' }), initial: raw('initial', { body: '도입 상담을 요청합니다.', date: NOW - 10000, threadId: 'thread1' }) };
  const h = harness({ messages, pages: [{ messages: [{ id: 'reply' }], nextPageToken: 'older-page' }, { messages: [{ id: 'initial' }] }] });
  h.client.getThread = async () => ({ messages: [messages.initial, messages.reply] });
  const first = await h.run({ maxMessages: 1 }); assert.equal(first.staged, 1); assert.equal(h.ingest[0].externalEventId, 'reply'); assert.equal(h.ingest[0].kind, 'sales');
  await h.run(); assert.deepEqual(h.ingest.map(x => x.externalEventId), ['reply', 'initial']);
});
test('thread context failures retry and future/outbound context cannot manufacture an inquiry', async () => {
  const reply = raw('reply', { body: '내일 가능합니다.', date: NOW - 1000, threadId: 'thread1' });
  const h = harness({ state: existing, histories: [history(['reply'])], messages: { reply } });
  h.client.getThread = async () => { throw new Error('gmail-api-503'); };
  assert.equal((await h.run()).error, 'gmail-api-503'); assert.deepEqual(h.saved.state.pending, ['reply']);
  h.client.getThread = async () => ({ messages: [raw('future', { date: NOW + 100 }), raw('sent', { date: NOW - 10000, labels: ['SENT'] })] });
  assert.equal((await h.run()).staged, 0); assert.equal(h.ingest.length, 0);
});

test('revoked preflight auth records failure against the prior verified operator connection without moving its cursor or last success', async () => {
  const lastSuccess = new Date(NOW - 86400000).toISOString();
  const h = harness({ state: existing, sync: { last_success_at: lastSuccess } });
  h.deps.resolveConnection = async () => ({ source: 'connection', config: { email: account, scope: READ }, refreshToken: 'synthetic' });
  h.deps.getAccessToken = async () => { throw Object.assign(new Error('gmail-token-401'), { status: 401 }); };
  const result = await h.run();
  assert.equal(result.reason, 'gmail-reconnect-required'); assert.equal(result.error, 'gmail-reconnect-required');
  assert.deepEqual(h.saved.state, existing); assert.equal(h.saved.sync.last_success_at, lastSuccess); assert.equal(h.ingest.length, 0);
  assert.ok(h.calls.some(c => c.action === 'save_sync' && c.success === false && c.error === 'gmail-reconnect-required'));
  assert.equal(h.calls.at(-1).action, 'release_sync');
});
test('read-scope failure persists a reconnection hint only for a prior operator account and respects busy leases', async () => {
  const h = harness({ state: existing });
  h.deps.resolveConnection = async () => ({ source: 'connection', config: { email: account }, refreshToken: 'synthetic' });
  h.client.getTokenInfo = async () => ({ scope: 'https://www.googleapis.com/auth/gmail.send' });
  const result = await h.run(); assert.equal(result.reason, 'gmail-read-scope-required');
  assert.ok(h.calls.some(c => c.action === 'save_sync' && c.success === false && c.error === 'gmail-read-scope-required'));
  const unsafe = harness(); unsafe.deps.resolveConnection = async () => ({ source: 'connection', config: { email: 'stranger@example.com' }, refreshToken: 'synthetic' }); unsafe.deps.getAccessToken = async () => null;
  await unsafe.run(); assert.equal(unsafe.calls.length, 0);
  const busy = harness(); busy.deps.resolveConnection = h.deps.resolveConnection; busy.client.getTokenInfo = h.client.getTokenInfo;
  const actions = []; busy.deps.command = async c => { actions.push(c.action); return { ok: false, data: { status: 'busy' } }; };
  await busy.run(); assert.deepEqual(actions, ['claim_sync']);
});


test('verified form predecessor is durably ingested before its newer reply, without sharing canonical identity with the reply', async () => {
  const submitted = { eventId: 'event1', formId: 'contact', contact: { email: 'customer@naver.com' }, subject: '도입 문의', message: '도입 상담을 요청합니다.', submittedAt: new Date(NOW - 10000).toISOString() };
  const source = { id: 'site', formId: 'contact', sender: 'no-reply@forms.example.com', orgScope: 'personal', verificationSecret: 'synthetic-signing-secret' };
  const initial = raw('initial', { body: JSON.stringify(submitted), date: NOW - 10000, threadId: 'thread1' });
  initial.payload.headers = [{ name: 'From', value: source.sender }, { name: 'Subject', value: 'New form submission' }, { name: 'X-Moonlight-Submission-Signature', value: 'sha256=' + createHmac('sha256', source.verificationSecret).update(canonicalFormSubmission(submitted)).digest('hex') }];
  const reply = raw('reply', { body: '확인했습니다. 내일 가능합니다.', date: NOW - 1000, threadId: 'thread1' });
  const h = harness({ messages: { initial, reply }, pages: [{ messages: [{ id: 'reply' }] }] });
  h.client.getThread = async () => ({ messages: [initial, reply] });
  h.deps.knownThread = async () => h.ingest.some(command => command.threadId === 'thread1');
  const options = { maxMessages: 1, env: { GOOGLE_OAUTH_ENABLED_PROVIDERS: 'gmail', COM_MOON_INQUIRY_EMAIL_FORMS: JSON.stringify([source]) } };
  await h.run(options);
  assert.deepEqual(h.saved.state.pending, ['initial', 'reply']); assert.equal(h.ingest.length, 0);
  await h.run(options); await h.run(options);
  assert.deepEqual(h.ingest.map(c => c.externalEventId), ['initial', 'reply']);
  assert.equal(h.ingest[0].canonicalKey, 'form:site:contact:event1'); assert.equal(h.ingest[1].canonicalKey, undefined);
});

test('bootstrap includes mail arriving during OAuth preflight while keeping it nonhistorical', async () => {
  let clock = NOW;
  const arrived = NOW + 3000;
  const h = harness({ messages: { duringPreflight: raw('duringPreflight', { date: arrived }) }, histories: [{ history: [], historyId: '100' }] });
  h.deps.now = () => clock;
  h.client.getProfile = async () => { clock = NOW + 5000; return { emailAddress: account, historyId: '100' }; };
  h.client.listMessages = async options => ({ messages: Date.parse(options.before) >= arrived ? [{ id: 'duringPreflight' }] : [] });
  const result = await h.run();
  assert.equal(result.staged, 1); assert.equal(h.ingest[0].historical, false);
  assert.equal(h.saved.state.bootstrapStartedAt, new Date(NOW).toISOString());
});

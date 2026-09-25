import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = globalThis.__salesContextTest = {};
const stubs = {
  '@/lib/repositories/revenue-ledger': `export async function getRevenueLedger() {
    const state = globalThis.__salesContextTest;
    state.ledgerReads = (state.ledgerReads || 0) + 1;
    return state.ledger;
  }`,
  '@/lib/repositories/crm-activities': `export async function getRecentContactActivities(args) {
    globalThis.__salesContextTest.contactQuery = args;
    return globalThis.__salesContextTest.outcomes;
  }`,
  '@/lib/repositories/content-ledger': `export async function getContentLedger() { return globalThis.__salesContextTest.content; }`,
  '@/lib/repositories/crm-pipeline': `export async function getCrmPipeline() { return null; }`,
  '@/lib/sales-os/agent-runs': `export async function getRecentAgentRuns(args) {
    globalThis.__salesContextTest.runQuery = args;
    return { source: 'supabase', runs: globalThis.__salesContextTest.runRows
      .filter(row => !args.agent || row.agent === args.agent)
      .filter(row => !args.mode || row.mode === args.mode)
      .filter(row => !args.unscopedOnly || !row.ref)
      .slice(0, args.limit) };
  }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
} });
const { assembleSalesContext } = await import('./context-assembler.js');

beforeEach(() => {
  delete state.runQuery;
  delete state.contactQuery;
  delete state.ledgerReads;
  state.ledger = {
    source: 'supabase', summary: { pipeline: 999 }, stages: [],
    leads: [
      { id: 'lead-classin', workspace: 'classin', type: 'company', companyId: 'company-classin', name: 'ClassIn 학원' },
      { id: 'lead-personal', workspace: 'brand', type: 'company', companyId: 'company-personal', name: '개인 고객' },
      { id: 'lead-unknown', type: null, name: '소속 미확인' },
    ],
    deals: [
      { id: 'deal-classin', workspace: 'classin', type: 'company', companyId: 'company-classin', name: 'ClassIn 거래' },
      { id: 'deal-personal', workspace: 'brand', type: 'company', companyId: 'company-personal', name: '개인 거래' },
    ],
    accounts: [
      { id: 'account-classin', type: 'company', companyId: 'company-classin', name: 'ClassIn 계약 고객' },
      { id: 'account-personal', type: 'personal', companyId: 'company-personal', name: '개인 계약 고객' },
    ],
    cases: [{ id: 'case-classin', type: 'company' }, { id: 'case-personal', type: 'personal' }],
  };
  state.outcomes = { source: 'supabase', outcomes: [
    { id: 'activity-classin', leadId: 'lead-classin', companyId: 'company-classin', note: '회사 연락' },
    { id: 'activity-deal', dealId: 'deal-classin', note: '회사 거래 연락' },
    { id: 'activity-personal', leadId: 'lead-personal', companyId: 'company-classin', note: '개인 연락' },
    { id: 'activity-company-classin', companyId: 'company-classin', note: '범위 미확인 회사 단위 연락' },
    { id: 'activity-company-personal', companyId: 'company-personal', note: '개인 회사 연락' },
  ] };
  state.content = { source: 'supabase', brands: [{ key: 'classmoon', rules: ['ClassIn 규칙'] }],
    cadence: { published: 8, goal: 10 }, ideaQueue: [{ id: 'idea-personal', brandKey: 'sinabro', title: '개인 콘텐츠' }] };
  state.runRows = [
    { id: 'run-council', agent: 'council', recommendation: '개인 브랜드 자문' },
    { id: 'run-guru-deal', agent: 'guru', mode: 'deal-review', ref: 'deal-classin', recommendation: '이전 딜 코칭' },
    { id: 'run-guru', agent: 'guru', mode: 'open-question', ref: null, recommendation: '영업 자문' },
  ];
});

test('pipeline advice includes only confirmed ClassIn records and Guru memory', async () => {
  const context = await assembleSalesContext({ mode: 'pipeline-triage' });
  assert.deepEqual(context.leads.map(row => row.id), ['lead-classin']);
  assert.deepEqual(context.deals.map(row => row.id), ['deal-classin']);
  assert.deepEqual(context.accounts.map(row => row.id), ['account-classin']);
  assert.deepEqual(context.cases.map(row => row.id), ['case-classin']);
  assert.deepEqual(context.outcomes.recent.map(row => row.note), ['회사 연락', '회사 거래 연락']);
  assert.ok(context.missing.some(item => item.reason === 'company-only activity scope unverified'));
  assert.equal(context.summary, null, 'global totals cannot describe the filtered ClassIn slice');
  assert.equal(context.content, null, 'global cadence and ideas cannot be called ClassIn facts');
  assert.deepEqual(state.runQuery, { agent: 'guru', ref: null, limit: 5 });
  assert.deepEqual(context.memory.recent_runs.map(row => row.id), ['run-guru-deal', 'run-guru']);
});

test('shelf card question excludes unrelated records and previous advice', async () => {
  state.runRows = [
    ...Array.from({ length: 40 }, (_, index) => ({ id: `focused-${index}`, agent: 'guru', mode: 'open-question', ref: `customer-${index}` })),
    { id: 'general', agent: 'guru', mode: 'open-question', ref: null, recommendation: '범위 없는 질문' },
  ];
  const context = await assembleSalesContext({ mode: 'open-question', guidanceId: 'sales-gap' });
  assert.equal(context.source, 'reference');
  assert.equal(context.scope, 'unscoped');
  assert.equal(context.memory, undefined);
  assert.equal(context.deals, undefined);
  assert.equal(context.leads, undefined);
  assert.equal(context.outcomes, undefined);
  assert.equal(state.runQuery, undefined);
  assert.equal(state.ledgerReads, undefined, 'a card-only question does not need the customer ledger');
  assert.equal(JSON.stringify(context).includes('ClassIn 학원'), false);
});

test('card-only question still uses its cited reference when the customer ledger is unavailable', async () => {
  state.ledger = { source: 'error', error: 'offline' };
  const context = await assembleSalesContext({ mode: 'open-question', guidanceId: 'sales-gap' });
  assert.deepEqual(context, { source: 'reference', scope: 'unscoped', missing: [] });
  assert.equal(state.ledgerReads, undefined);
});

test('customer card question carries only the exact linked ClassIn customer and its direct activity', async () => {
  const context = await assembleSalesContext({ mode: 'open-question', guidanceId: 'sales-gap', ref: 'lead-classin' });
  assert.equal(context.scope, 'linked');
  assert.deepEqual(context.leads.map(row => row.id), ['lead-classin']);
  assert.deepEqual(context.deals.map(row => row.id), ['deal-classin']);
  assert.deepEqual(context.outcomes.recent.map(row => row.note), ['회사 연락', '회사 거래 연락']);
  assert.match(context.contextBoundary, /조직 수준/);
  assert.equal(context.memory, undefined);
  assert.equal(JSON.stringify(context).includes('개인 고객'), false);
  assert.equal(JSON.stringify(context).includes('ClassIn 계약 고객'), false);
});

test('customer follow-up without a newly selected card stays on the exact ClassIn record', async () => {
  const context = await assembleSalesContext({ mode: 'open-question', ref: 'lead-classin' });
  assert.equal(context.scope, 'linked');
  assert.deepEqual(context.leads.map(row => row.id), ['lead-classin']);
  assert.deepEqual(context.deals.map(row => row.id), ['deal-classin']);
  assert.equal(JSON.stringify(context).includes('개인 고객'), false);
  assert.equal(JSON.stringify(context).includes('ClassIn 계약 고객'), false);
});

test('account card question includes only same-company ClassIn leads and deals', async () => {
  state.outcomes.outcomes.push({ id: 'activity-account', accountId: 'account-classin', note: '계정 직접 연락' });
  const context = await assembleSalesContext({ mode: 'open-question', guidanceId: 'sales-gap', ref: 'account-classin' });
  assert.equal(context.scope, 'linked');
  assert.deepEqual(context.accounts.map(row => row.id), ['account-classin']);
  assert.deepEqual(context.leads.map(row => row.id), ['lead-classin']);
  assert.deepEqual(context.deals.map(row => row.id), ['deal-classin']);
  assert.deepEqual(context.outcomes.recent.map(row => row.note), ['회사 연락', '회사 거래 연락', '계정 직접 연락']);
  assert.equal(JSON.stringify(context).includes('개인 고객'), false);
  assert.equal(JSON.stringify(context).includes('개인 거래'), false);
});

test('unmatched customer card reference reveals no other ledger records', async () => {
  const context = await assembleSalesContext({ mode: 'open-question', guidanceId: 'sales-gap', ref: 'customer-not-in-read' });
  assert.equal(context.scope, 'unlinked');
  assert.equal(context.memory, undefined);
  assert.equal(JSON.stringify(context).includes('ClassIn 학원'), false);
  assert.equal(JSON.stringify(context).includes('ClassIn 거래'), false);
  assert.ok(context.missing.some(item => item.source === 'revenue-ledger' && item.reason === 'reference-not-in-read'));
});

test('general Guru question can read ClassIn records without previous generated advice', async () => {
  const context = await assembleSalesContext({ mode: 'open-question' });
  assert.deepEqual(context.leads.map(row => row.id), ['lead-classin']);
  assert.deepEqual(context.deals.map(row => row.id), ['deal-classin']);
  assert.equal(context.scope, 'unscoped');
  assert.equal(context.memory, undefined);
  assert.equal(state.runQuery, undefined);
  assert.equal(JSON.stringify(context).includes('개인 거래'), false);
});

test('unavailable or failed core revenue reads remain preview or error, never empty truth', async () => {
  for (const source of ['preview', 'error']) {
    state.ledger = { source, error: `${source}-ledger`, leads: [], deals: [], accounts: [], cases: [] };
    const context = await assembleSalesContext({ mode: 'open-question' });
    assert.equal(context.source, source);
    assert.ok(context.missing.some(item => item.source === 'revenue-ledger'));
  }
});

test('optional read envelopes disclose missing context rather than silently emptying it', async () => {
  state.outcomes = { source: 'error', error: 'crm-read-failed', outcomes: [] };
  state.content = { source: 'error', error: 'content-read-failed', brands: [], ideaQueue: [] };
  const context = await assembleSalesContext({ mode: 'pipeline-triage' });
  assert.equal(context.source, 'partial');
  assert.deepEqual(context.missing.map(item => item.source), ['crm_activities', 'content-ledger']);
});

test('a partially read revenue ledger names the missing slice in the Guru context', async () => {
  state.ledger.partial = true;
  state.ledger.failedSources = ['companies'];
  const context = await assembleSalesContext({ mode: 'open-question' });
  assert.equal(context.source, 'partial');
  assert.deepEqual(context.missing.find(item => item.source === 'revenue-ledger')?.failedSources, ['companies']);
});

test('explicit personal workspace or brand excludes a record even when its type says company', async () => {
  state.ledger.leads.push({ id: 'lead-personal-brand', brand: 'sinabro', type: 'company' });
  state.ledger.deals.push({ id: 'deal-classmoon', brand: 'classmoon', type: 'personal' });
  const context = await assembleSalesContext({ mode: 'pipeline-triage' });
  assert.deepEqual(context.leads.map(row => row.id), ['lead-classin']);
  assert.deepEqual(context.deals.map(row => row.id), ['deal-classin', 'deal-classmoon']);
});

test('a company-only contact stays out even when current revenue rows suggest ClassIn', async () => {
  state.ledger.leads.push({ id: 'lead-personal-shared', workspace: 'brand', type: 'personal', companyId: 'company-classin' });
  const context = await assembleSalesContext({ mode: 'pipeline-triage' });
  assert.deepEqual(context.outcomes.recent.map(row => row.note), ['회사 연락', '회사 거래 연락']);
});
test('account-linked contacts use the account scope even when a company ID is shared', async () => {
  state.ledger.accounts[1].companyId = 'company-classin';
  state.outcomes.outcomes = [
    { id: 'account-classin-contact', accountId: 'account-classin', companyId: 'company-classin', note: 'ClassIn 계정 연락' },
    { id: 'account-personal-contact', accountId: 'account-personal', companyId: 'company-classin', note: '개인 계정 연락' },
    { id: 'mixed-contact', leadId: 'lead-personal', accountId: 'account-classin', note: '충돌하는 범위' },
    { id: 'unverified-contact', companyId: 'company-classin', note: '회사 ID만 있음' },
  ];
  const context = await assembleSalesContext({ mode: 'pipeline-triage' });
  assert.deepEqual(context.outcomes.recent.map(row => row.note), ['ClassIn 계정 연락']);
  assert.equal(context.outcomes.recent[0].account_id, 'account-classin');
  assert.deepEqual(state.contactQuery, { limit: 500 });
});
test('ClassIn contacts are capped after scope filtering', async () => {
  state.outcomes.outcomes = [
    ...Array.from({ length: 40 }, (_, index) => ({ id: `personal-${index}`, accountId: 'account-personal', note: `개인 ${index}` })),
    ...Array.from({ length: 35 }, (_, index) => ({ id: `classin-${index}`, accountId: 'account-classin', note: `ClassIn ${index}` })),
  ];
  const context = await assembleSalesContext({ mode: 'pipeline-triage' });
  assert.equal(context.outcomes.recent.length, 30);
  assert.deepEqual(context.outcomes.recent.map(row => row.note), Array.from({ length: 30 }, (_, index) => `ClassIn ${index}`));
});

test('ordinary sales modes also exclude personal revenue and global aggregates', async () => {
  const context = await assembleSalesContext({ mode: 'pipeline-triage' });
  assert.deepEqual(context.leads.map(row => row.id), ['lead-classin']);
  assert.deepEqual(context.deals.map(row => row.id), ['deal-classin']);
  assert.deepEqual(context.outcomes.recent.map(row => row.note), ['회사 연락', '회사 거래 연락']);
  assert.equal(context.summary, null);
  assert.equal(context.content, null);
});

test('deal review never focuses a personal deal even when its ref matches exactly', async () => {
  const personal = await assembleSalesContext({ mode: 'deal-review', ref: 'deal-personal' });
  assert.equal(personal.focus.found, false);
  assert.equal(JSON.stringify(personal).includes('개인 거래'), false);

  const classin = await assembleSalesContext({ mode: 'deal-review', ref: 'deal-classin' });
  assert.equal(classin.focus.found, true);
  assert.equal(classin.focus.item_id, 'deal-classin');
});

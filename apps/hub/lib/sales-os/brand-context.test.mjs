import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = globalThis.__brandScopeTest = {};
const stubs = {
  '@/lib/repositories/content-ledger': `export async function getContentLedger() { return globalThis.__brandScopeTest.content; }`,
  '@/lib/repositories/operating-ledger': `export async function getProjectLedger() { return globalThis.__brandScopeTest.projects; }`,
  '@/lib/sales-os/agent-runs': `export async function getRecentAgentRuns(args) {
    globalThis.__brandScopeTest.runQuery = args;
    return { ...globalThis.__brandScopeTest.memory, runs: (globalThis.__brandScopeTest.memory.runs || [])
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
const { assembleBrandContext } = await import('./brand-context.js');

beforeEach(() => {
  state.content = {
    source: 'supabase',
    brands: [{ key: 'personal-a', orgScope: 'personal', voice: 'A' }, { key: 'personal-b', orgScope: 'personal', voice: 'B' }, { key: 'company', orgScope: 'classin' }],
    items: [{ id: 'idea-a', brandKey: 'personal-a' }, { id: 'idea-company', brandKey: 'company' }],
    ideaQueue: [{ id: 'idea-a', title: 'Personal idea', brandKey: 'personal-a' }, { id: 'idea-company', title: 'Company idea', brandKey: 'company' }],
    campaigns: [{ id: 'campaign-b', name: 'Offer B', brandKey: 'personal-b', businessTruth: { customer: 'Founders' } }, { id: 'company-campaign', brandKey: 'company' }],
    cadence: { published: 99 },
  };
  state.projects = { source: 'supabase', projects: [{ id: 'company-project', workspace: 'classin', brand: 'company' }] };
  state.memory = { source: 'supabase', runs: [] };
});

test('empty personal projects never fall back to company data or global aggregates', async () => {
  const ctx = await assembleBrandContext();
  assert.deepEqual(ctx.projects, []);
  assert.deepEqual(ctx.brands.map((b) => b.key), ['personal-a', 'personal-b']);
  assert.deepEqual(ctx.content.idea_queue_top.map((i) => i.id), ['idea-a']);
  assert.equal(ctx.content.cadence, null);
  assert.equal(ctx.content.queue_counts, null);
  assert.equal(ctx.campaigns.length, 1);
});
test('open-question without a ref keeps personal context without choosing a brand voice or focus', async () => {
  const ctx = await assembleBrandContext({ mode: 'open-question' });
  assert.equal(ctx.brand, null);
  assert.equal(Object.hasOwn(ctx, 'focus'), false);
  assert.deepEqual(ctx.brands.map((b) => b.key), ['personal-a', 'personal-b']);
  assert.ok(ctx.brands.every((b) => !Object.hasOwn(b, 'voice')));
  assert.deepEqual(ctx.content.idea_queue_top.map((i) => i.id), ['idea-a']);
  assert.equal(ctx.campaigns.some((campaign) => campaign.brandKey === 'company'), false);
});
test('office-review without a ref does not choose an unrelated brand or expose company rows', async () => {
  const ctx = await assembleBrandContext({ mode: 'office-review' });
  assert.equal(ctx.brand, null);
  assert.equal(Object.hasOwn(ctx, 'focus'), false);
  assert.equal(ctx.scope, 'personal');
  assert.ok(ctx.brands.every((brand) => !Object.hasOwn(brand, 'voice')));
  assert.deepEqual(ctx.content.idea_queue_top.map((idea) => idea.id), ['idea-a']);
  assert.equal(ctx.campaigns.some((campaign) => campaign.brandKey === 'company'), false);
});
test('office-review resolves a personal brand only when the caller selected an exact ref', async () => {
  const matched = await assembleBrandContext({ mode: 'office-review', ref: 'personal-b' });
  assert.equal(matched.brand.key, 'personal-b');
  assert.equal(matched.brand.voice, 'B');
  const unmatched = await assembleBrandContext({ mode: 'office-review', ref: 'personal' });
  assert.equal(unmatched.brand, null);
  assert.equal(unmatched.focus.found, false);
});
test('a Guru brand question reads only its own runs while ordinary advice keeps Council memory', async () => {
  state.memory.runs = [
    { id: 'council-run', agent: 'council' },
    { id: 'focused-brand-guru-run', agent: 'guru.brand', mode: 'open-question', ref: 'personal-a' },
    { id: 'brand-guru-run', agent: 'guru.brand', mode: 'open-question', ref: null },
    { id: 'sales-guru-run', agent: 'guru' },
  ];
  const guru = await assembleBrandContext({ mode: 'open-question' });
  assert.deepEqual(state.runQuery, { agent: 'guru.brand', mode: 'open-question', unscopedOnly: true, ref: null, limit: 5 });
  assert.deepEqual(guru.memory.recent_runs.map(run => run.id), ['brand-guru-run']);

  const focused = await assembleBrandContext({ mode: 'open-question', ref: 'personal-a' });
  assert.deepEqual(state.runQuery, { agent: 'guru.brand', ref: 'personal-a', mode: 'open-question', limit: 5 });
  assert.deepEqual(focused.memory.recent_runs.map(run => run.id), ['focused-brand-guru-run']);

  const council = await assembleBrandContext({ mode: 'brand-strategy' });
  assert.deepEqual(state.runQuery, { agent: 'council', ref: null, limit: 5 });
  assert.deepEqual(council.memory.recent_runs.map(run => run.id), ['council-run']);
});
test('general brand Guru memory is not crowded out by focused brand runs', async () => {
  state.memory.runs = [
    ...Array.from({ length: 40 }, (_, index) => ({ id: `focused-${index}`, agent: 'guru.brand', mode: 'open-question', ref: `brand-${index}` })),
    { id: 'general', agent: 'guru.brand', mode: 'open-question', ref: null },
  ];
  const context = await assembleBrandContext({ mode: 'open-question' });
  assert.deepEqual(context.memory.recent_runs.map(run => run.id), ['general']);
});
test('an explicit brand question limits projects, campaigns and ideas to that brand', async () => {
  state.content.items.push({ id: 'idea-b', brandKey: 'personal-b' });
  state.content.ideaQueue.push({ id: 'idea-b', title: 'B idea', brandKey: 'personal-b' });
  state.projects.projects.push(
    { id: 'project-a', workspace: 'brand', brand: 'personal-a', name: 'A work' },
    { id: 'project-b', workspace: 'brand', brand: 'personal-b', name: 'B work' },
  );
  const context = await assembleBrandContext({ mode: 'open-question', ref: 'personal-b' });
  assert.deepEqual(context.brands.map(brand => brand.key), ['personal-b']);
  assert.deepEqual(context.projects.map(project => project.id), ['project-b']);
  assert.deepEqual(context.campaigns.map(campaign => campaign.id), ['campaign-b']);
  assert.deepEqual(context.content.idea_queue_top.map(idea => idea.id), ['idea-b']);
  assert.equal(context.focus.kind, 'brand');
});
test('open-question applies only an explicitly matched personal brand voice', async () => {
  const brand = await assembleBrandContext({ mode: 'open-question', ref: 'personal-b' });
  assert.equal(brand.brand.key, 'personal-b');
  assert.equal(brand.brand.voice, 'B');
  assert.equal(brand.focus.kind, 'brand');
  assert.ok(brand.brands.every((b) => !Object.hasOwn(b, 'voice')));

  const campaign = await assembleBrandContext({ mode: 'open-question', ref: 'campaign-b' });
  assert.equal(campaign.brand.key, 'personal-b');
  assert.equal(campaign.focus.kind, 'campaign');
  assert.deepEqual(campaign.brands.map(row => row.key), ['personal-b']);
  assert.deepEqual(campaign.campaigns.map(row => row.id), ['campaign-b']);

  for (const ref of ['company', 'company-project', 'unknown-brand', 'personal']) {
    const unmatched = await assembleBrandContext({ mode: 'open-question', ref });
    assert.equal(unmatched.brand, null, ref);
    assert.equal(unmatched.focus.found, false, ref);
  }
});
test('legacy brand strategy keeps its default personal brand for existing callers', async () => {
  const ctx = await assembleBrandContext({ mode: 'brand-strategy' });
  assert.equal(ctx.brand.key, 'personal-a');
});
test('campaign focus uses its business truth and matching brand voice', async () => {
  const ctx = await assembleBrandContext({ ref: 'campaign-b' });
  assert.equal(ctx.focus.kind, 'campaign');
  assert.equal(ctx.focus.entity.businessTruth.customer, 'Founders');
  assert.equal(ctx.brand.voice, 'B');
});
test('cross-scope refs remain missing; memory failures are disclosed', async () => {
  state.memory = { source: 'error', error: 'memory-read-failed' };
  const ctx = await assembleBrandContext({ ref: 'company-project' });
  assert.equal(ctx.focus.found, false);
  assert.equal(ctx.source, 'partial');
  assert.ok(ctx.missing.some((s) => s.source === 'agent_runs'));
});
test('a preview ledger and a failed ledger cannot masquerade as partial usable brand context', async () => {
  state.content = { source: 'error', error: 'content-read-failed', brands: [], items: [], ideaQueue: [] };
  state.projects = { source: 'preview', projects: [] };
  const contentFailure = await assembleBrandContext({ mode: 'open-question' });
  assert.equal(contentFailure.source, 'error');

  state.content = { source: 'preview', brands: [], items: [], ideaQueue: [] };
  state.projects = { source: 'error', error: 'project-read-failed', projects: [] };
  const projectFailure = await assembleBrandContext({ mode: 'open-question' });
  assert.equal(projectFailure.source, 'error');

  state.projects = { source: 'preview', projects: [] };
  const unconfigured = await assembleBrandContext({ mode: 'open-question' });
  assert.equal(unconfigured.source, 'preview');
});

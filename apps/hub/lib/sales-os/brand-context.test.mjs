import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = globalThis.__brandScopeTest = {};
const stubs = {
  '@/lib/repositories/content-ledger': `export async function getContentLedger() { return globalThis.__brandScopeTest.content; }`,
  '@/lib/repositories/operating-ledger': `export async function getProjectLedger() { return globalThis.__brandScopeTest.projects; }`,
  '@/lib/sales-os/agent-runs': `export async function getRecentAgentRuns() { return globalThis.__brandScopeTest.memory; }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
} });
const { assembleBrandContext } = await import('./brand-context.js');

beforeEach(() => {
  state.content = {
    source: 'supabase',
    brands: [{ key: 'personal-a', orgScope: 'personal', voice: 'A' }, { key: 'personal-b', orgScope: 'personal', voice: 'B', audience: 'Founders who read Threads', promise: 'A sharper next move', currentFocus: 'Ship the roadmap' }, { key: 'company', orgScope: 'classin' }],
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
test('campaign focus uses its business truth and matching brand voice', async () => {
  const ctx = await assembleBrandContext({ ref: 'campaign-b' });
  assert.equal(ctx.focus.kind, 'campaign');
  assert.equal(ctx.focus.entity.businessTruth.customer, 'Founders');
  assert.equal(ctx.brand.voice, 'B');
  assert.equal(ctx.brand.audience, 'Founders who read Threads');
  assert.equal(ctx.brand.promise, 'A sharper next move');
  assert.equal(ctx.brand.currentFocus, 'Ship the roadmap');
});
test('cross-scope refs remain missing; memory failures are disclosed', async () => {
  state.memory = { source: 'error', error: 'memory-read-failed' };
  const ctx = await assembleBrandContext({ ref: 'company-project' });
  assert.equal(ctx.focus.found, false);
  assert.equal(ctx.source, 'partial');
  assert.ok(ctx.missing.some((s) => s.source === 'agent_runs'));
});

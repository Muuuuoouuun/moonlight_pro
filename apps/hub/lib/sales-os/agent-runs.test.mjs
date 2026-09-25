import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const state = globalThis.__agentRunsScopeTest = {};
const stubs = {
  '@/lib/server-read': `
    export const eqFilter = value => 'eq.' + value;
    export const withWorkspaceFilter = extra => extra;
    export async function fetchSupabaseRows(table, options) {
      globalThis.__agentRunsScopeTest.read = { table, options };
      return [];
    }
  `,
  '@/lib/server-write': `
    export function resolveDefaultWorkspaceId() { return 'workspace'; }
    export function resolveSupabaseConfig() { return { configured: true }; }
    export async function insertSupabaseRecord() { return { persisted: true }; }
    export async function updateSupabaseRecord() { return { persisted: true }; }
  `,
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
} });
const { getRecentAgentRuns } = await import('./agent-runs.js');

test('general Guru memory is filtered to unscoped open questions before the database limit', async () => {
  const result = await getRecentAgentRuns({ agent: 'guru.brand', mode: 'open-question', unscopedOnly: true, limit: 5 });
  assert.equal(result.source, 'supabase');
  assert.equal(state.read.table, 'agent_runs');
  assert.deepEqual(state.read.options.filters, [
    ['ref', 'is.null'],
    ['agent', 'eq.guru.brand'],
    ['mode', 'eq.open-question'],
  ]);
  assert.equal(state.read.options.limit, 5);
});

test('focused Guru memory stays on its exact ref and mode', async () => {
  await getRecentAgentRuns({ agent: 'guru', ref: 'customer-1', mode: 'open-question', limit: 5 });
  assert.deepEqual(state.read.options.filters, [
    ['ref', 'eq.customer-1'],
    ['agent', 'eq.guru'],
    ['mode', 'eq.open-question'],
  ]);
});

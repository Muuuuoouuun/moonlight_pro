import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DATABASE_FEATURES, summarizeReadiness } from './database-readiness.mjs';
const readyRows = () => DATABASE_FEATURES.flatMap(f => [
  ...f.tables.map(name => ({ migration: f.migration, kind: 'table', name, present: true, protected: true })),
  ...f.functions.map(name => ({ migration: f.migration, kind: 'function', name, present: true, protected: true })),
]);
test('an absent RPC, missing result row or public execute permission prevents readiness', () => {
  const rows = readyRows();
  assert.ok(summarizeReadiness(rows).every(f => f.ready));
  for (const broken of [rows.slice(1), rows.map((r,i) => i === 0 ? { ...r, present: false } : r), rows.map((r,i) => i === rows.length - 1 ? { ...r, protected: false } : r)]) {
    assert.ok(summarizeReadiness(broken).some(f => !f.ready));
  }
  assert.ok(summarizeReadiness([]).every(f => !f.ready));
  assert.throws(() => summarizeReadiness(null));
});

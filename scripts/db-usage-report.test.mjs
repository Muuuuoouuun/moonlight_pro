import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLES_SQL, UNUSED_INDEXES_SQL, STATS_SQL, classifyTable, summarize, formatBytes } from './db-usage-report.mjs';

test('usage report sends read-only SQL only', () => {
  for (const sql of [TABLES_SQL, UNUSED_INDEXES_SQL, STATS_SQL]) {
    assert.match(sql.trim(), /^select\b/i);
    assert.doesNotMatch(sql, /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|vacuum|reindex)\b\s/i);
  }
});

test('unused index query never offers unique, primary or constraint indexes', () => {
  assert.match(UNUSED_INDEXES_SQL, /not i\.indisunique/);
  assert.match(UNUSED_INDEXES_SQL, /not i\.indisprimary/);
  assert.match(UNUSED_INDEXES_SQL, /pg_constraint/);
});

test('classifyTable separates empty, write-only and bloated tables', () => {
  assert.deepEqual(classifyTable({ live_rows: 0, dead_rows: 0, seq_scan: 3, idx_scan: 0, writes: 0 }), ['비어 있음']);
  assert.deepEqual(classifyTable({ live_rows: 40, dead_rows: 0, seq_scan: 0, idx_scan: 0, writes: 40 }), ['쓰기 전용']);
  assert.deepEqual(classifyTable({ live_rows: 10, dead_rows: 5000, seq_scan: 9, idx_scan: 1, writes: 9000 }), ['죽은 행 과다']);
  assert.deepEqual(classifyTable({ live_rows: 10, dead_rows: 2, seq_scan: 9, idx_scan: 1, writes: 12 }), []);
});

test('summarize lists empty tables and keeps the stats reset time', () => {
  const report = summarize({
    tables: [{ table: 'api_keys', live_rows: 0, dead_rows: 0, seq_scan: 0, idx_scan: 0, writes: 0 },
      { table: 'tasks', live_rows: 120, dead_rows: 3, seq_scan: 50, idx_scan: 900, writes: 400 }],
    unusedIndexes: [{ table: 'crm_activities', index: 'idx_crm_activities_workspace_lead', idx_scan: 0, index_bytes: 16384 }],
    stats: { stats_reset: '2026-09-20T00:00:00Z', database_bytes: '2048' },
  });
  assert.deepEqual(report.emptyTables, ['api_keys']);
  assert.equal(report.statsReset, '2026-09-20T00:00:00Z');
  assert.equal(report.databaseBytes, 2048);
  assert.equal(report.unusedIndexes.length, 1);
});

test('formatBytes reads like a size', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(16384), '16 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

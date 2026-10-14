#!/usr/bin/env node
// 운영 DB 사용량 측정(읽기 전용). pg_stat 카운터로 테이블별 행 수·스캔·크기와 한 번도 쓰이지 않은
// 인덱스를 보여 준다. 코드 정적 분석(docs/db-optimization-audit-2026-10-01.md)이 "코드 참조 0"으로 본
// 테이블·인덱스를 실제 운영 데이터로 확정하는 단계다. 아무것도 바꾸지 않는다 — SELECT만 보낸다.
//
//   npm run db:usage            표 출력
//   npm run db:usage -- --json  JSON 출력
//
// 카운터는 마지막 통계 리셋(리전 이전·재시작 포함) 이후 값이다. 리셋 시각을 함께 출력하니,
// 리셋 직후라면 idx_scan 0은 "안 쓰임"이 아니라 "아직 모름"으로 읽는다.
import { pathToFileURL } from 'node:url';
import { loadEnv, deriveProjectRef, runSql } from './apply-migrations.mjs';

export const TABLES_SQL = `select
  c.relname as table,
  s.n_live_tup::bigint as live_rows,
  s.n_dead_tup::bigint as dead_rows,
  s.seq_scan::bigint as seq_scan,
  coalesce(s.idx_scan, 0)::bigint as idx_scan,
  (s.n_tup_ins + s.n_tup_upd + s.n_tup_del)::bigint as writes,
  pg_total_relation_size(c.oid)::bigint as total_bytes,
  greatest(s.last_autovacuum, s.last_vacuum) as last_vacuum
from pg_stat_user_tables s
join pg_class c on c.oid = s.relid
where s.schemaname = 'public'
order by pg_total_relation_size(c.oid) desc`;

export const UNUSED_INDEXES_SQL = `select
  s.relname as table,
  s.indexrelname as index,
  s.idx_scan::bigint as idx_scan,
  pg_relation_size(s.indexrelid)::bigint as index_bytes
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname = 'public'
  and s.idx_scan = 0
  and not i.indisunique
  and not i.indisprimary
  and not exists (select 1 from pg_constraint k where k.conindid = s.indexrelid)
order by pg_relation_size(s.indexrelid) desc, s.relname`;

export const STATS_SQL = `select stats_reset, pg_database_size(current_database())::bigint as database_bytes
from pg_stat_database where datname = current_database()`;

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = value / 1024;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit += 1; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[unit]}`;
}

// 표 하나의 판정. 행이 없고 읽은 적도 없으면 "비어 있음·미사용", 쓰기만 있고 읽기가 없으면
// "쓰기 전용"(로그성 테이블은 정상일 수 있음), 죽은 행이 산 행보다 많으면 vacuum 확인.
export function classifyTable(row) {
  const live = Number(row.live_rows) || 0;
  const dead = Number(row.dead_rows) || 0;
  const reads = (Number(row.seq_scan) || 0) + (Number(row.idx_scan) || 0);
  const writes = Number(row.writes) || 0;
  const flags = [];
  if (live === 0 && writes === 0) flags.push('비어 있음');
  if (writes > 0 && reads === 0) flags.push('쓰기 전용');
  if (dead > 1000 && dead > live) flags.push('죽은 행 과다');
  return flags;
}

export function summarize({ tables = [], unusedIndexes = [], stats = {} }) {
  return {
    statsReset: stats.stats_reset || null,
    databaseBytes: Number(stats.database_bytes) || 0,
    tables: tables.map(row => ({ ...row, flags: classifyTable(row) })),
    emptyTables: tables.filter(row => classifyTable(row).includes('비어 있음')).map(row => row.table),
    unusedIndexes,
  };
}

function rows(response, label) {
  if (!response.ok) throw Error(`${label}: HTTP ${response.status}`);
  const parsed = JSON.parse(response.body);
  if (!Array.isArray(parsed)) throw Error(`${label}: invalid response`);
  return parsed;
}

function printReport(report) {
  console.log(`통계 리셋: ${report.statsReset || '알 수 없음'} · DB 크기 ${formatBytes(report.databaseBytes)}`);
  console.log('\n[테이블] 크기순 — 행 / 죽은 행 / seq / idx / 쓰기 / 크기 / 표시');
  for (const t of report.tables) {
    console.log(`  ${t.table.padEnd(34)} ${String(t.live_rows).padStart(8)} ${String(t.dead_rows).padStart(7)} ${String(t.seq_scan).padStart(9)} ${String(t.idx_scan).padStart(9)} ${String(t.writes).padStart(8)} ${formatBytes(t.total_bytes).padStart(8)}  ${t.flags.join(', ')}`);
  }
  console.log(`\n[비어 있는 테이블] ${report.emptyTables.length}개`);
  if (report.emptyTables.length) console.log('  ' + report.emptyTables.join(', '));
  console.log(`\n[리셋 이후 한 번도 안 쓰인 인덱스] ${report.unusedIndexes.length}개 (unique·PK·제약 인덱스 제외)`);
  for (const i of report.unusedIndexes) console.log(`  ${i.table}.${i.index} · ${formatBytes(i.index_bytes)}`);
}

async function main() {
  const env = loadEnv();
  const ref = deriveProjectRef(env);
  const token = (env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!ref || !token) throw Error('SUPABASE_ACCESS_TOKEN and the configured Supabase project are required');
  const [tables, unusedIndexes, stats] = await Promise.all([
    runSql(ref, token, TABLES_SQL).then(r => rows(r, 'tables')),
    runSql(ref, token, UNUSED_INDEXES_SQL).then(r => rows(r, 'unused indexes')),
    runSql(ref, token, STATS_SQL).then(r => rows(r, 'stats')),
  ]);
  const report = summarize({ tables, unusedIndexes, stats: stats[0] || {} });
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

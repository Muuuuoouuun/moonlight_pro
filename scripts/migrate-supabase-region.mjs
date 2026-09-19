#!/usr/bin/env node

// Moonlight — Supabase 리전 이전 (구 프로젝트 → 한국 리전 신규 프로젝트)
//
// 왜 마이그레이션 재생이 아니라 덤프 복제인가:
//   supabase/migrations 45개는 번호가 7쌍 충돌하고(0003·0004·0012·0013·0014·0018·0025)
//   빈 DB에 처음부터 적용된 적이 한 번도 없다. setup/00_live_schema.sql에도 2026-09에
//   추가된 inquiries·journal_notes·content_revisions·agent_jobs가 빠져 있다.
//   현재 운영 프로젝트는 실제로 동작하는 상태이므로 그 스키마가 정본이다.
//
// 사용법:
//   export MOONLIGHT_SOURCE_DB_URL='postgresql://postgres.<ref>:<pw>@<host>:5432/postgres'
//   export MOONLIGHT_TARGET_DB_URL='postgresql://postgres.<ref>:<pw>@<host>:5432/postgres'
//   node scripts/migrate-supabase-region.mjs preflight   # 양쪽 연결·버전·대상 비어있음 확인
//   node scripts/migrate-supabase-region.mjs dump        # 구 프로젝트에서 스키마+데이터 추출
//   node scripts/migrate-supabase-region.mjs restore     # 신 프로젝트에 적용
//   node scripts/migrate-supabase-region.mjs verify      # 테이블별 행 수 대조
//   node scripts/migrate-supabase-region.mjs all         # 위 4단계 연속
//
// 원본은 절대 쓰지 않는다. 모든 원본 접근은 읽기 전용이다.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const OUT_DIR = process.env.MOONLIGHT_MIGRATION_DIR
  || path.join(process.cwd(), '.migration-dump');
const SCHEMA_FILE = path.join(OUT_DIR, 'schema.sql');
const DATA_FILE = path.join(OUT_DIR, 'data.sql');

const SOURCE = (process.env.MOONLIGHT_SOURCE_DB_URL || '').trim();
const TARGET = (process.env.MOONLIGHT_TARGET_DB_URL || '').trim();

const redact = (url) => url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@');
const log = (msg) => console.log(msg);
const fail = (msg) => { console.error(`[FAIL] ${msg}`); process.exit(1); };

function requireUrls({ target = true } = {}) {
  if (!SOURCE) fail('MOONLIGHT_SOURCE_DB_URL 이 없다. Supabase 대시보드 → Settings → Database → Connection string.');
  if (target && !TARGET) fail('MOONLIGHT_TARGET_DB_URL 이 없다. 새 한국 리전 프로젝트의 연결 문자열을 넣어라.');
  if (target && SOURCE === TARGET) fail('원본과 대상이 같다. 대상 URL을 다시 확인해라.');
}

function psql(url, sql, { tuplesOnly = true } = {}) {
  const args = ['--dbname', url, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1'];
  if (tuplesOnly) args.push('--tuples-only', '--no-align');
  args.push('--command', sql);
  return execFileSync('psql', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tableCounts(url) {
  // 행 수는 count(*)로 실측한다. pg_class.reltuples는 ANALYZE 시점에 따라 틀린다.
  const names = psql(url, `select tablename from pg_tables where schemaname='public' order by tablename`)
    .split('\n').map(s => s.trim()).filter(Boolean);
  if (!names.length) return new Map();
  const union = names.map(n => `select '${n}' as t, count(*)::bigint as n from public."${n}"`).join(' union all ');
  const rows = psql(url, `${union} order by t`).split('\n').map(s => s.trim()).filter(Boolean);
  return new Map(rows.map(line => { const [t, n] = line.split('|'); return [t, Number(n)]; }));
}

function stagePreflight() {
  requireUrls();
  log('원본 : ' + redact(SOURCE));
  log('대상 : ' + redact(TARGET) + '\n');

  try { execFileSync('pg_dump', ['--version'], { stdio: 'ignore' }); }
  catch { fail('pg_dump 이 없다. `brew install postgresql@17`'); }

  let sourceVersion, targetVersion;
  try { sourceVersion = psql(SOURCE, 'show server_version'); }
  catch (e) { fail('원본 연결 실패. 비밀번호와 호스트를 확인해라.\n' + String(e.stderr || e.message).slice(0, 400)); }
  try { targetVersion = psql(TARGET, 'show server_version'); }
  catch (e) { fail('대상 연결 실패. 새 프로젝트가 아직 프로비저닝 중일 수 있다.\n' + String(e.stderr || e.message).slice(0, 400)); }

  log(`[PASS] 원본 Postgres ${sourceVersion}`);
  log(`[PASS] 대상 Postgres ${targetVersion}`);
  if (sourceVersion.split('.')[0] !== targetVersion.split('.')[0]) {
    log(`[WARN] 메이저 버전이 다르다 (${sourceVersion} → ${targetVersion}). 복원은 보통 되지만 확장 기능 차이를 확인해라.`);
  }

  const counts = tableCounts(SOURCE);
  const withRows = [...counts.entries()].filter(([, n]) => n > 0);
  log(`[PASS] 원본 public 테이블 ${counts.size}개, 데이터 있는 테이블 ${withRows.length}개`);
  for (const [t, n] of withRows.sort((a, b) => b[1] - a[1]).slice(0, 12)) log(`       ${t.padEnd(28)} ${n}`);

  const targetCounts = tableCounts(TARGET);
  const targetRows = [...targetCounts.values()].reduce((a, b) => a + b, 0);
  if (targetCounts.size > 0 && targetRows > 0) {
    fail(`대상에 이미 테이블 ${targetCounts.size}개 · 행 ${targetRows}개가 있다.\n`
      + '       덮어쓰면 복구할 수 없다. 빈 프로젝트를 쓰거나, 의도한 것이면 대상에서 public 스키마를 먼저 비워라.');
  }
  log(`[PASS] 대상이 비어 있다 (테이블 ${targetCounts.size}개)`);
  log('\n다음: node scripts/migrate-supabase-region.mjs dump');
}

function stageDump() {
  requireUrls({ target: false });
  mkdirSync(OUT_DIR, { recursive: true });

  // --no-owner 는 유지한다(소유 역할이 프로젝트마다 다를 수 있다). 그러나 권한은 반드시 옮긴다 —
  // Supabase 프로젝트는 anon·authenticated·service_role 표준 역할을 공유하고, GRANT 를 빼면
  // 함수 EXECUTE 가 PUBLIC 기본값으로 풀려 anon 까지 RPC 를 부를 수 있게 된다(db:check 가 잡는 보안 계약).
  const common = ['--dbname', SOURCE, '--schema', 'public', '--no-owner', '--quote-all-identifiers'];

  log('스키마 추출 중...');
  execFileSync('pg_dump', [...common, '--schema-only', '--file', SCHEMA_FILE], { stdio: ['ignore', 'inherit', 'inherit'] });
  log(`[PASS] ${SCHEMA_FILE} (${(statSync(SCHEMA_FILE).size / 1024).toFixed(0)} KB)`);

  log('데이터 추출 중...');
  // --disable-triggers 는 쓰지 않는다: `ALTER TABLE ... DISABLE TRIGGER ALL` 이 FK 시스템 트리거를
  // 건드려 슈퍼유저를 요구하는데 Supabase 의 postgres 역할은 슈퍼유저가 아니다.
  // 대신 복원 때 session_replication_role=replica 로 FK 검사를 끈다(순환 FK: profiles↔workspaces, inquiries).
  execFileSync('pg_dump', [...common, '--data-only', '--file', DATA_FILE], { stdio: ['ignore', 'inherit', 'inherit'] });
  log(`[PASS] ${DATA_FILE} (${(statSync(DATA_FILE).size / 1024).toFixed(0)} KB)`);

  const schema = readFileSync(SCHEMA_FILE, 'utf8');
  const tables = (schema.match(/^CREATE TABLE /gm) || []).length;
  const functions = (schema.match(/^CREATE FUNCTION |^CREATE OR REPLACE FUNCTION /gm) || []).length;
  log(`\n덤프 내용: 테이블 ${tables}개 · 함수 ${functions}개`);
  log('다음: node scripts/migrate-supabase-region.mjs restore');
}

function stageRestoreSchema() {
  requireUrls();
  if (!existsSync(SCHEMA_FILE)) fail('덤프 파일이 없다. 먼저 dump 단계를 돌려라.');

  // 덤프는 원본의 충실한 사본으로 남기고, 적용 직전에만 대상 쪽 사정을 반영한다.
  //  1) Supabase 대상에는 public 스키마가 이미 있다.
  //  2) Supabase 가 플랫폼 차원에서 만들어 두는 public 함수(예: rls_auto_enable — 이벤트 트리거
  //     ensure_rls 가 물려 있다)가 원본 덤프에도 들어 있다. 대상 것이 더 최신일 수 있으므로
  //     덮어쓰지 않고 건너뛴다.
  const existing = new Set(
    psql(TARGET, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)
      .split('\n').map(s => s.trim()).filter(Boolean));

  // pg_dump 출력은 `--\n-- Name: ...\n--` 헤더로 객체 블록이 나뉜다. 그 경계로 잘라 건너뛸 블록을 뺀다.
  const raw = readFileSync(SCHEMA_FILE, 'utf8').replace(/^CREATE SCHEMA "public";$/m, 'CREATE SCHEMA IF NOT EXISTS "public";');
  const blocks = raw.split(/(?=^--\n-- Name: )/m);
  const skipped = [];
  const kept = blocks.filter(block => {
    const header = /^--\n-- Name: (.+?); Type: (FUNCTION|ACL)/m.exec(block);
    if (!header) return true;
    // "rls_auto_enable()" 또는 ACL 블록의 "FUNCTION \"rls_auto_enable\"()" 양쪽에서 이름을 뽑는다.
    const name = (/^(?:FUNCTION\s+)?"?([a-z_][a-z0-9_]*)"?\s*\(/i.exec(header[1].trim()) || [])[1];
    if (!name || !existing.has(name)) return true;
    skipped.push(`${name} (${header[2]})`);
    return false;
  });
  if (skipped.length) log(`대상에 이미 있어 건너뜀: ${skipped.join(', ')}`);

  //  3) `ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"` 은 플랫폼 소유 역할이라 우리 postgres
  //     역할로는 바꿀 수 없다(permission denied). 기본 권한은 *앞으로 만들어질* 객체에만 적용되고
  //     대상 프로젝트에는 같은 플랫폼 기본값이 이미 서 있으므로 건너뛴다. FOR ROLE "postgres" 는 적용한다.
  const applied = kept.join('')
    .replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin".*$/gm, '');

  const patched = path.join(OUT_DIR, 'schema.applied.sql');
  writeFileSync(patched, applied);

  log('스키마 적용 중...');
  execFileSync('psql', ['--dbname', TARGET, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', patched],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  log('[PASS] 스키마 적용 완료');
  log('다음: node scripts/migrate-supabase-region.mjs restore-data');
}

function stageRestoreData() {
  requireUrls();
  if (!existsSync(DATA_FILE)) fail('덤프 파일이 없다. 먼저 dump 단계를 돌려라.');

  // 순환 FK 때문에 삽입 순서만으로는 제약을 만족시킬 수 없다. replica 모드는 FK 검사와 함께
  // 앱 트리거(set_updated_at 등)도 멈추므로 원본 타임스탬프가 그대로 보존된다.
  const dataPatched = path.join(OUT_DIR, 'data.applied.sql');
  writeFileSync(dataPatched, 'SET session_replication_role = replica;\n' + readFileSync(DATA_FILE, 'utf8'));

  log('데이터 적용 중...');
  execFileSync('psql', ['--dbname', TARGET, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', dataPatched],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  log('[PASS] 데이터 적용 완료');

  stageReconcilePrivileges();
  log('\n다음: node scripts/migrate-supabase-region.mjs verify');
}

// 함수 실행 권한을 원본과 똑같이 맞춘다.
//
// 왜 필요한가: Supabase 는 public 스키마에 `ALTER DEFAULT PRIVILEGES FOR ROLE postgres
// ... GRANT ALL ON FUNCTIONS TO anon, authenticated` 를 걸어 둔다. 그래서 복원으로 만들어진
// 모든 RPC 가 anon 실행 가능 상태로 태어난다. 덤프에 들어 있는 `REVOKE ALL ... FROM PUBLIC` 은
// PUBLIC 유사권한만 지우고 anon/authenticated 에 준 *명시적* GRANT 는 못 지운다.
// 2026-09-20 실제 이관에서 RPC 29개 중 25개가 anon 실행 가능으로 넘어갔고 db:check 가 잡았다.
function stageReconcilePrivileges() {
  requireUrls();
  const ROLES = ['anon', 'authenticated', 'service_role'];
  const probe = `select p.oid::regprocedure::text, ${ROLES.map(r => `has_function_privilege('${r}',p.oid,'EXECUTE')`).join(', ')}`
    + ` from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`;
  const read = (url) => {
    const out = new Map();
    // 함수 시그니처에 쉼표·개행이 들어가므로 흔치 않은 구분자를 쓴다.
    const raw = execFileSync('psql', ['--dbname', url, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--tuples-only', '--no-align', '--record-separator', '\u00a7', '--field-separator', '\u0001', '--command', probe],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    for (const row of raw.split('\u00a7')) {
      const cells = row.trim().split('\u0001');
      if (cells.length === ROLES.length + 1) out.set(cells[0], cells.slice(1).map(c => c === 't'));
    }
    return out;
  };

  const source = read(SOURCE), target = read(TARGET);
  const stmts = [];
  for (const [signature, has] of target) {
    const want = source.get(signature);
    if (!want) continue; // 대상에만 있는 플랫폼 함수는 건드리지 않는다
    ROLES.forEach((role, i) => {
      if (has[i] && !want[i]) stmts.push(`REVOKE ALL ON FUNCTION ${signature} FROM "${role}";`);
      else if (!has[i] && want[i]) stmts.push(`GRANT EXECUTE ON FUNCTION ${signature} TO "${role}";`);
    });
  }

  if (!stmts.length) { log('[PASS] 함수 실행 권한이 이미 원본과 일치한다'); return; }
  const file = path.join(OUT_DIR, 'privileges.sql');
  writeFileSync(file, stmts.join('\n') + '\n');
  execFileSync('psql', ['--dbname', TARGET, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', file],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  log(`[PASS] 함수 실행 권한 ${stmts.length}건을 원본에 맞춰 교정`);
}

function stageVerify() {
  requireUrls();
  const source = tableCounts(SOURCE);
  const target = tableCounts(TARGET);

  const names = [...new Set([...source.keys(), ...target.keys()])].sort();
  let mismatched = 0, missing = 0;
  for (const name of names) {
    const a = source.get(name), b = target.get(name);
    if (b === undefined) { console.log(`[FAIL] ${name.padEnd(30)} 대상에 테이블 없음`); missing += 1; continue; }
    if (a === undefined) continue; // 대상에만 있는 건 문제 아님
    if (a !== b) { console.log(`[FAIL] ${name.padEnd(30)} 원본 ${a} → 대상 ${b}`); mismatched += 1; }
  }

  const total = [...source.values()].reduce((x, y) => x + y, 0);
  log(`\n원본 테이블 ${source.size}개 · 전체 행 ${total}개`);
  if (missing || mismatched) fail(`테이블 누락 ${missing}개 · 행 수 불일치 ${mismatched}개`);
  log(`[PASS] 테이블 ${source.size}개 전부 행 수 일치`);
  log('\n다음: apps/hub/.env.local 과 apps/engine/.env.local 의 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 를 새 프로젝트로 바꾸고');
  log('      npm run db:check 로 최종 확인.');
}

const stageRestore = () => { stageRestoreSchema(); log(''); stageRestoreData(); };
const STAGES = { preflight: stagePreflight, dump: stageDump, restore: stageRestore,
  'restore-schema': stageRestoreSchema, 'restore-data': stageRestoreData,
  'reconcile-privileges': stageReconcilePrivileges, verify: stageVerify };
const stage = process.argv[2];

if (stage === 'all') {
  stagePreflight(); log('\n' + '─'.repeat(60) + '\n');
  stageDump(); log('\n' + '─'.repeat(60) + '\n');
  stageRestore(); log('\n' + '─'.repeat(60) + '\n');
  stageVerify();
} else if (STAGES[stage]) {
  STAGES[stage]();
} else {
  console.error('사용법: node scripts/migrate-supabase-region.mjs <preflight|dump|restore|restore-schema|restore-data|verify|all>');
  process.exit(1);
}

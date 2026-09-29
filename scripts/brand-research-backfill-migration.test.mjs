// 브랜드 리서치 채우기(0054) — 정적 검사 + 실제 PostgreSQL에서 시드(0004) → 0053 → 0054 연쇄 적용.
// macOS: initdb/pg_ctl spawn env에만 LC_ALL을 넣는다(CLAUDE.md 테스트 함정). 프로세스 전역으로 두지 않는다.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const read = (file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
const SEED = "20260427_0004_canonical_brand_directory.sql";
const BACKFILL_0053 = "20260929_0053_brand_identity_audience_promise_offer.sql";
const FILE = "20260929_0054_brand_research_backfill.sql";
const source = read(FILE);
const code = source.replace(/--[^\n]*/g, "");

// 운영자 입력이 필요하거나 승인된 문구라 이 마이그레이션이 절대 쓰면 안 되는 키.
const NEVER_WRITTEN = ["identity_confirmed_at", "voice_examples", "philosophy", "voice", "content_rules", "forbidden_terms", "cadence", "weekly_goal", "operating_state", "role", "org_scope"];
const rows = [...source.matchAll(/^ {4}\('([a-z0-9_]+)', '([a-z_]+)',/gm)].map((m) => ({ slug: m[1], key: m[2] }));

test("0054 is a post-0044 migration: no transaction control, updates brands.meta only", () => {
  assert.doesNotMatch(code, /\bbegin\s*;|\bcommit\s*;|\brollback\s*;/i);
  assert.doesNotMatch(code, /\b(insert|delete|drop|create|alter|grant|truncate)\b/i);
  assert.ok(rows.length >= 20, `expected the desired list to parse, got ${rows.length} rows`);
});

test("0054 writes only researched fields and never confirms an identity", () => {
  const written = new Set(rows.map((row) => row.key));
  assert.deepEqual([...written].sort(), ["audience", "channels", "current_focus", "direction", "is_focused", "keywords", "offer", "promise", "source_links"]);
  for (const key of NEVER_WRITTEN) assert.ok(!written.has(key), `${key} must not be written`);
  assert.match(code, /coalesce\(b\.meta ->> 'identity_confirmed_at', ''\) = ''/, "confirmed identities are skipped");
  const slugs = new Set(rows.map((row) => row.slug));
  for (const untouched of ["moonpm", "studyseagull", "classin_side"]) assert.ok(!slugs.has(untouched), `${untouched} has no research`);
});

test("0054 supersedes only strings that 0053 actually wrote", () => {
  const backfilled = new Map();
  for (const m of read(BACKFILL_0053).matchAll(/'audience', '([^']*)',\s*'promise', '([^']*)',\s*'offer', '([^']*)'\s*\) \|\| coalesce\(meta, '\{\}'::jsonb\), updated_at = now\(\) where slug = '([^']*)';/g)) {
    backfilled.set(`${m[4]}:audience`, m[1]);
    backfilled.set(`${m[4]}:promise`, m[2]);
    backfilled.set(`${m[4]}:offer`, m[3]);
  }
  assert.equal(backfilled.size, 27);
  const superseding = [...source.matchAll(/\('([a-z0-9_]+)', '(audience|promise|offer)',\s*to_jsonb\('[^']*'::text\),\s*to_jsonb\('([^']*)'::text\)\)/g)];
  assert.equal(superseding.length, 8);
  for (const [, slug, key, old] of superseding) assert.equal(old, backfilled.get(`${slug}:${key}`), `${slug}.${key} superseded string must equal the 0053 value`);
});

const available = process.getuid?.() !== 0 && ["initdb", "pg_ctl", "psql"].every((bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);

test("0054 fills blanks, keeps operator input and confirmed identities, and is idempotent (real PostgreSQL)", { skip: available ? false : "PostgreSQL binaries and non-root user required" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "brand-research-pg-"));
  const data = join(directory, "data");
  const port = String(51000 + (process.pid % 5000));
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", directory, "-p", port, "-U", "brand_test", "-d", "postgres"];
  const sql = (input) => execFileSync("psql", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const pgEnv = { ...process.env, LC_ALL: process.env.LC_ALL || "C" };
  const value = (slug, key) => JSON.parse(sql(`select coalesce(meta -> '${key}', 'null'::jsonb) from public.brands where slug = '${slug}'`));
  const stamp = (slug) => sql(`select updated_at from public.brands where slug = '${slug}'`);
  const OLD = "2026-09-01 00:00:00+00";
  let started = false;
  try {
    execFileSync("initdb", ["-D", data, "-U", "brand_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe", env: pgEnv });
    execFileSync("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -p ${port} -c listen_addresses=''`, "-w", "start"], { stdio: "pipe", env: pgEnv });
    started = true;
    sql(`create table public.workspaces(id uuid primary key, slug text);
      insert into public.workspaces values ('11111111-1111-1111-1111-111111111111', 'com-moon-os');
      create table public.brands(
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null, slug text not null, name text not null,
        kind text, status text not null default 'active', color_hex text, description text,
        meta jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), unique (workspace_id, slug));`);
    sql(read(SEED));
    sql(read(BACKFILL_0053));

    // 운영자가 앱에서 이미 손댄 상태를 흉내낸다.
    sql(`update public.brands set meta = meta || '{"audience":"운영자가 직접 쓴 대상"}'::jsonb where slug = 'classmoon';
      update public.brands set meta = meta || '{"current_focus":"","channels":[]}'::jsonb where slug = 'gore';
      update public.brands set meta = meta || '{"identity_confirmed_at":"2026-09-20T00:00:00Z"}'::jsonb where slug = 'sinabro';
      update public.brands set meta = meta || '{"current_focus":"운영자가 직접 쓴 집중점","is_focused":false}'::jsonb where slug = 'holyfuncollector';
      update public.brands set updated_at = '${OLD}';`);
    const before = Object.fromEntries(["moonpm", "studyseagull", "bridgemaker"].map((slug) => [slug, sql(`select meta::text from public.brands where slug = '${slug}'`)]));

    sql(source);

    // 정상화: 0053이 옮긴 4월 시드 값 → 운영자 9/23 답변으로 교체, 집중 브랜드 표시.
    assert.match(value("politicofficer", "offer"), /85%/);
    assert.match(value("politicofficer", "audience"), /2030 → 1020 → 4050/);
    assert.equal(value("politicofficer", "is_focused"), true);
    assert.match(value("politicofficer", "philosophy"), /중립적으로 관찰/, "approved copy is left for the operator");
    // class.moon: 운영자가 쓴 대상은 보존, 아직 0053 값이던 약속은 교체.
    assert.equal(value("classmoon", "audience"), "운영자가 직접 쓴 대상");
    assert.match(value("classmoon", "promise"), /수업의 품질을 높이고/);
    assert.deepEqual(value("classmoon", "source_links"), ["https://www.threads.com/@moon.classin"]);
    // 22th nomad: 추정 시드였던 값 교체, 배열도 정확 일치일 때만.
    assert.equal(value("22nomad", "audience"), "테크를 좋아하는 사람과 새 기술을 배우려는 초보자");
    assert.deepEqual(value("22nomad", "keywords"), ["기술", "AI", "소식", "실사용", "리뷰"]);
    assert.equal(value("22nomad", "promise"), "과장 없는 실제 맥락의 기록", "compatible 0053 value is kept");
    assert.equal(value("22nomad", "cadence"), "personal_archive");
    // 빈 문자열·빈 배열도 빈 칸으로 본다.
    assert.match(value("gore", "current_focus"), /함께 도전하는 요소/);
    assert.deepEqual(value("gore", "channels"), ["Threads", "Instagram"]);
    // 확정된 정체성은 손대지 않는다(updated_at도 그대로). 운영자가 쓴 값·명시한 false도 보존.
    assert.equal(value("sinabro", "current_focus"), null);
    assert.equal(stamp("sinabro"), sql(`select '${OLD}'::timestamptz`));
    assert.equal(value("holyfuncollector", "current_focus"), "운영자가 직접 쓴 집중점");
    assert.equal(value("holyfuncollector", "is_focused"), false);
    // 조사 범위 밖 브랜드는 그대로, 새 확정 표시는 어디에도 없다.
    for (const slug of ["moonpm", "studyseagull"]) assert.equal(sql(`select meta::text from public.brands where slug = '${slug}'`), before[slug]);
    assert.equal(sql("select count(*) from public.brands where meta ->> 'voice_examples' is not null"), "0");
    assert.equal(sql("select count(*) from public.brands where slug <> 'sinabro' and meta ->> 'identity_confirmed_at' is not null"), "0");
    // 이미 채워진 bridgemaker 원본 필드는 유지하고 빈 칸(current_focus)만 채운다.
    const bridge = JSON.parse(sql("select meta::text from public.brands where slug = 'bridgemaker'"));
    assert.equal(bridge.philosophy, JSON.parse(before.bridgemaker).philosophy);
    assert.match(bridge.current_focus, /변증·논증은 전체의 절반 이하/);

    // 재실행은 무변화 — 값도 updated_at도.
    sql("update public.brands set updated_at = '2026-09-02 00:00:00+00'");
    const settled = sql("select slug, meta::text from public.brands order by slug");
    sql(source);
    assert.equal(sql("select slug, meta::text from public.brands order by slug"), settled);
    assert.equal(sql("select count(*) from public.brands where updated_at <> '2026-09-02 00:00:00+00'"), "0", "second run touches no row");
  } finally {
    if (started) spawnSync("pg_ctl", ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore", env: pgEnv });
    rmSync(directory, { recursive: true, force: true });
  }
});

// AI 사용량 기록(0052) — 마이그레이션 정적 검사 + 실제 PostgreSQL 적용.
// macOS: initdb/pg_ctl spawn env에만 LC_ALL을 넣는다(CLAUDE.md 테스트 함정). 프로세스 전역으로 두지 않는다.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migrationCallSql } from "./apply-migrations.mjs";
import { DATABASE_FEATURES, readinessSql, summarizeReadiness } from "./database-readiness.mjs";

const FILE = "20260926_0052_ai_usage_log.sql";
const BOOTSTRAP = "20260923_0044_migration_history.sql";
const source = readFileSync(new URL(`../supabase/migrations/${FILE}`, import.meta.url), "utf8");
const code = source.replace(/--[^\n]*/g, "");

test("0052 is a post-0044 migration: no transaction control, RLS on, service_role select+insert only", () => {
  assert.doesNotMatch(code, /\bbegin\s*;|\bcommit\s*;|\brollback\s*;/i);
  assert.match(code, /alter table public\.ai_usage_log enable row level security;/);
  assert.match(code, /revoke all on public\.ai_usage_log from public, anon, authenticated, service_role;/);
  const grants = [...code.matchAll(/grant\s+([^;]*?)\s+on\s+([^;]*?)\s+to\s+([^;]*);/gi)].map((m) => m[0].replace(/\s+/g, " "));
  assert.deepEqual(grants, ["grant select, insert on public.ai_usage_log to service_role;"]);
  assert.doesNotMatch(code.replace(/revoke[^;]*;/gi, ""), /\b(anon|authenticated)\b/, "API roles appear only in the revoke");
  assert.match(code, /create index if not exists ai_usage_log_workspace_occurred_idx\s+on public\.ai_usage_log \(workspace_id, occurred_at\)/);
});

test("0052 stores counts, a surface key and a model name — no text column for prompts or answers", () => {
  const table = code.match(/create table if not exists public\.ai_usage_log \(([\s\S]*?)\n\);/)[1];
  const columns = table.split("\n").map((line) => line.trim().split(/\s+/)[0]).filter((name) => /^[a-z_]+$/.test(name));
  assert.deepEqual(columns, ["id", "workspace_id", "occurred_at", "surface", "model", "prompt_tokens", "output_tokens", "thinking_tokens", "total_tokens"]);
  assert.match(table, /surface text not null check \(surface ~ '\^\[a-z0-9\]\[a-z0-9-\]\{0,47\}\$'\)/);
});

test("db:check tracks the ai_usage_log table", () => {
  const feature = DATABASE_FEATURES.find((f) => f.migration === FILE);
  assert.ok(feature);
  assert.deepEqual(feature.tables, ["ai_usage_log"]);
  assert.equal(DATABASE_FEATURES.at(-1), feature, "features stay in filename order");
});

const available = process.getuid?.() !== 0 && ["initdb", "pg_ctl", "psql"].every((bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);

test("0052 applies through the migration history executor on real PostgreSQL", { skip: available ? false : "PostgreSQL binaries and non-root user required" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-usage-log-pg-"));
  const data = join(directory, "data");
  const port = String(56000 + (process.pid % 5000));
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", directory, "-p", port, "-U", "usage_test", "-d", "postgres"];
  const sql = (input) => execFileSync("psql", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const pgEnv = { ...process.env, LC_ALL: process.env.LC_ALL || "C" };
  const W = "11111111-1111-4111-8111-111111111111";
  let started = false;
  try {
    execFileSync("initdb", ["-D", data, "-U", "usage_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe", env: pgEnv });
    execFileSync("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -p ${port} -c listen_addresses=''`, "-w", "start"], { stdio: "pipe", env: pgEnv });
    started = true;
    // Supabase-like defaults: new public tables start out granted to every API role.
    sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      create table public.workspaces(id uuid primary key); insert into public.workspaces values('${W}');`);
    sql(readFileSync(new URL(`../supabase/migrations/${BOOTSTRAP}`, import.meta.url), "utf8"));
    const hash = createHash("sha256").update(source).digest("hex");
    assert.equal(sql(migrationCallSql(source, FILE, hash)), "applied");
    assert.equal(sql(migrationCallSql(source, FILE, hash)), "already_applied");

    assert.equal(sql("select relrowsecurity from pg_class where oid='public.ai_usage_log'::regclass"), "t");
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.equal(sql(`select has_table_privilege('${role}','public.ai_usage_log','${privilege}')`), "f", `${role} ${privilege}`);
    }
    assert.equal(sql("select has_table_privilege('service_role','public.ai_usage_log','SELECT')"), "t");
    assert.equal(sql("select has_table_privilege('service_role','public.ai_usage_log','INSERT')"), "t");
    assert.equal(sql("select has_table_privilege('service_role','public.ai_usage_log','UPDATE')"), "f");
    assert.equal(sql("select has_table_privilege('service_role','public.ai_usage_log','DELETE')"), "f");

    // The row shape the Engine/Hub recorders send inserts as service_role and sums by month.
    sql(`set role service_role; insert into public.ai_usage_log(workspace_id,surface,model,prompt_tokens,output_tokens,thinking_tokens,total_tokens)
      values('${W}','persona-chat','gemini-3.5-flash',120,40,30,190),('${W}','hub-meeting-review','gemini-3.5-flash',10,4,6,20); reset role;`);
    assert.equal(sql(`select sum(total_tokens) from public.ai_usage_log where workspace_id='${W}' and occurred_at >= date_trunc('month', now())`), "210");
    assert.throws(() => sql(`insert into public.ai_usage_log(workspace_id,surface,model) values('${W}','고객 김철수','m');`), /check/i);
    assert.throws(() => sql(`insert into public.ai_usage_log(workspace_id,surface,model,total_tokens) values('${W}','brief','m',-1);`), /check/i);

    const feature = DATABASE_FEATURES.filter((f) => f.migration === FILE);
    const rows = JSON.parse(sql(`select coalesce(json_agg(r),'[]') from (${readinessSql(feature)}) r;`));
    assert.deepEqual(summarizeReadiness(rows, feature).map((r) => r.ready), [true]);
  } finally {
    if (started) spawnSync("pg_ctl", ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore", env: pgEnv });
    rmSync(directory, { recursive: true, force: true });
  }
});

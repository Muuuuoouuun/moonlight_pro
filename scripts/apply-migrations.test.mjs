import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapReadinessSql, migrationCallSql, parseMigrationArgs, validateTargetRef } from "./apply-migrations.mjs";

const REF = "ncgpnqfulnlshegalmbd";
const BOOTSTRAP = "20260923_0044_migration_history.sql";
const hash = sql => createHash("sha256").update(sql).digest("hex");

test("migration CLI requires an explicit file and matching project", () => {
  assert.throws(() => parseMigrationArgs([]), /Specify at least one/);
  assert.throws(() => parseMigrationArgs([BOOTSTRAP]), /expect-ref/);
  assert.throws(() => parseMigrationArgs(["--expect-ref", REF, "../other.sql"]), /filename, not a path/);
  assert.throws(() => parseMigrationArgs(["--expect-ref", REF, BOOTSTRAP, BOOTSTRAP]), /Duplicate/);
  assert.deepEqual(parseMigrationArgs(["--expect-ref", REF, BOOTSTRAP]).files, [BOOTSTRAP]);
  assert.throws(() => validateTargetRef([
    { name: ".env", values: { SUPABASE_URL: `https://${REF}.supabase.co` } },
    { name: "apps/hub/.env.local", values: { NEXT_PUBLIC_SUPABASE_URL: "https://rwqefdxalmbrkybxqwxj.supabase.co" } },
  ], REF), /points to/);
  assert.equal(validateTargetRef([
    { name: ".env", values: { SUPABASE_URL: `https://${REF}.supabase.co` } },
  ], REF), REF);
});

test("migration SQL is sent as base64 data, not interpolated SQL source", () => {
  const content = "select E'it\\'s'; commit; select 1/0;";
  const call = migrationCallSql(content, "20260924_0045_probe.sql", hash(content));
  assert.match(call, /select moonlight_ops\.apply_migration\(/);
  assert.ok(!call.includes(content));
  assert.ok(call.includes(Buffer.from(content, "utf8").toString("base64")));
  assert.throws(() => migrationCallSql(content, "../probe.sql", hash(content)), /Invalid migration identity/);
});

test("migration ledger and DDL commit or roll back together in PostgreSQL", {
  skip: process.getuid?.() === 0 || !["initdb", "pg_ctl", "psql"].every(command => {
    try { execFileSync("which", [command], { stdio: "ignore" }); return true; } catch { return false; }
  }),
}, () => {
  const directory = mkdtempSync(join(tmpdir(), "moonlight-migrations-pg-"));
  const data = join(directory, "data");
  const port = String(55000 + (process.pid % 10000));
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", directory, "-p", port, "-U", "migration_test", "-d", "postgres"];
  const sql = source => execFileSync("psql", args, { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  let started = false;
  try {
    const pgEnv = { ...process.env, LC_ALL: process.env.LC_ALL || "C" };
    execFileSync("initdb", ["-D", data, "-U", "migration_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe", env: pgEnv });
    execFileSync("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -p ${port} -c listen_addresses=''`, "-w", "start"], { stdio: "pipe", env: pgEnv });
    started = true;
    sql("create role anon; create role authenticated; create role service_role;");
    const bootstrap = readFileSync(new URL("../supabase/migrations/" + BOOTSTRAP, import.meta.url), "utf8");
    sql(bootstrap);
    const readiness = () => JSON.parse(sql(`select row_to_json(r) from (${bootstrapReadinessSql()}) r;`));
    assert.deepEqual(readiness(), { history: true, executor: true, rls: true, implementation: true, private: true });
    assert.equal(sql("select to_regprocedure('moonlight_ops.apply_migration(text,text,text)') is not null"), "t");
    assert.equal(sql("select has_schema_privilege('anon','moonlight_ops','USAGE')"), "f");
    assert.equal(sql("select has_table_privilege('service_role','moonlight_ops.applied_migrations','SELECT')"), "f");
    assert.equal(sql("select has_function_privilege('service_role','moonlight_ops.apply_migration(text,text,text)','EXECUTE')"), "f");
    assert.equal(sql("select relrowsecurity from pg_class where oid='moonlight_ops.applied_migrations'::regclass"), "t");
    sql("grant execute on function moonlight_ops.apply_migration(text,text,text) to anon;");
    assert.equal(readiness().private, false);
    sql("revoke execute on function moonlight_ops.apply_migration(text,text,text) from anon;");

    const failing = "create table moonlight_ops.should_rollback(id int);\nselect 1/0;";
    const name = "20260924_0045_atomicity_probe.sql";
    assert.throws(() => sql(migrationCallSql(failing, name, hash(failing))));
    assert.equal(sql("select to_regclass('moonlight_ops.should_rollback') is null"), "t");
    assert.equal(sql(`select count(*) from moonlight_ops.applied_migrations where filename='${name}'`), "0");

    const good = "create table moonlight_ops.did_commit(id int);";
    assert.equal(sql(migrationCallSql(good, name, hash(good))), "applied");
    assert.equal(sql("select to_regclass('moonlight_ops.did_commit') is not null"), "t");
    assert.equal(sql(`select sha256 from moonlight_ops.applied_migrations where filename='${name}'`), hash(good));
    assert.equal(sql(migrationCallSql(good, name, hash(good))), "already_applied");
    assert.throws(() => sql(migrationCallSql("select 1;", name, hash("select 1;"))), /migration-checksum-conflict/);
    assert.throws(() => sql(migrationCallSql("select 1;", "20260924_0046_bad_hash.sql", hash("other"))), /migration-invalid-identity/);

    for (const [file, source, table] of [
      ["20260924_0046_escape_probe.sql", "create table moonlight_ops.escape_probe(id int); select E'it\\'s'; commit; select E'a\\'b'; select 1/0;", "escape_probe"],
      ["20260924_0047_identifier_probe.sql", "create table moonlight_ops.foo$tag$(id int); commit; create table moonlight_ops.bar$tag$(id int); select 1/0;", "foo$tag$"],
    ]) {
      assert.throws(() => sql(migrationCallSql(source, file, hash(source))), /EXECUTE of transaction commands is not implemented/);
      assert.equal(sql(`select to_regclass('moonlight_ops.${table}') is null`), "t");
      assert.equal(sql(`select count(*) from moonlight_ops.applied_migrations where filename='${file}'`), "0");
    }
  } finally {
    if (started) execFileSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "pipe", env: { ...process.env, LC_ALL: process.env.LC_ALL || "C" } });
    rmSync(directory, { recursive: true, force: true });
  }
});

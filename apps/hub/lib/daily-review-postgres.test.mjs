import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const migration = new URL("../../../supabase/migrations/20260912_0025_daily_review_journal.sql", import.meta.url);
const postgresAvailable = process.getuid?.() !== 0 && ["initdb", "pg_ctl", "psql"].every((bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const requestId = (number) => `33333333-3333-4333-8333-${String(number).padStart(12, "0")}`;
const literal = (value) => value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;

function saveSql({ date = "2026-09-12", workspace = WORKSPACE, timezone = "Asia/Seoul", energy = 2, focus = "", progress = null, note = "", revision = 0, request = 1 } = {}) {
  return `select public.save_daily_review_v1(${literal(workspace)}::uuid, ${literal(date)}::date, ${literal(timezone)}, ${energy ?? "null"}, ${literal(focus)}, ${literal(JSON.stringify(progress))}::jsonb, ${literal(note)}, ${revision}, ${literal(requestId(request))}::uuid);`;
}

test("daily review PostgreSQL migration, atomic writes and permissions", {
  skip: postgresAvailable ? false : "PostgreSQL binaries and a non-root test user are required",
}, async (t) => {
  assert.equal(existsSync(migration), true, "daily review migration must exist");
  const directory = mkdtempSync(join(tmpdir(), "daily-review-pg-"));
  const data = join(directory, "data");
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", directory, "-p", "55492", "-U", "daily_review_test", "-d", "postgres"];
  const sql = (source) => execFileSync("psql", args, { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const json = (source) => JSON.parse(sql(source));
  let started = false;
  try {
    execFileSync("initdb", ["-D", data, "-U", "daily_review_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe" });
    execFileSync("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -p 55492 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe" });
    started = true;
    sql(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create role unrelated_role;
      create table public.workspaces (id uuid primary key, timezone text, meta jsonb default '{}'::jsonb);
      insert into public.workspaces values ('${WORKSPACE}', 'Asia/Seoul', '{}'), ('${OTHER}', 'UTC', '{}');
    `);
    const migrationSql = readFileSync(migration, "utf8");
    sql(migrationSql);

    await t.test("partial answer creates one review and receipt with the target local date", () => {
      const saved = json(saveSql());
      assert.equal(saved.status, "saved");
      assert.equal(saved.review.review_revision, 1);
      assert.equal(saved.review.review_date, "2026-09-12");
      assert.equal(saved.review.review_timezone, "Asia/Seoul");
      assert.deepEqual(saved.review.review_data, { energy: 2, progress: null });
      assert.equal(saved.review.body, "");
      assert.equal(sql("select count(*) from public.daily_review_receipts;"), "1");
      assert.equal(sql("select (occurred_at at time zone 'Asia/Seoul')::date from public.journal_entries;"), "2026-09-12");
    });

    await t.test("same-day create conflicts without replacing existing answers", () => {
      const result = json(saveSql({ energy: 5, request: 2 }));
      assert.equal(result.status, "conflict");
      assert.equal(result.error, "date-exists");
      assert.equal(result.review.review_data.energy, 2);
      assert.equal(sql("select count(*) from public.daily_review_receipts;"), "1");
    });

    await t.test("edit increments revision while retaining the original timezone and date", () => {
      const result = json(saveSql({ energy: null, focus: "첫 단락", progress: 0, note: "후속 수정", revision: 1, timezone: "UTC", request: 2 }));
      assert.equal(result.status, "saved");
      assert.equal(result.review.review_revision, 2);
      assert.equal(result.review.review_timezone, "Asia/Seoul");
      assert.equal(result.review.review_date, "2026-09-12");
      assert.deepEqual(result.review.review_data, { energy: null, progress: 0 });
    });

    await t.test("retry after later edits returns the latest review without replaying the write", () => {
      const result = json(saveSql({ timezone: "UTC" }));
      assert.equal(result.status, "duplicate");
      assert.equal(result.review.review_revision, 2);
      assert.equal(result.review.body, "후속 수정");
      assert.equal(sql(`select response->'review'->>'review_revision' from public.daily_review_receipts where request_id = '${requestId(1)}';`), "1");
      assert.equal(sql("select count(*) from public.daily_review_receipts;"), "2");
    });

    await t.test("reused request key or stale revision conflicts with the current review", () => {
      for (const options of [{ energy: 5 }, { energy: 3, revision: 1, request: 3 }]) {
        const result = json(saveSql(options));
        assert.equal(result.status, "conflict");
        assert.equal(result.review.review_revision, 2);
        assert.equal(result.review.body, "후속 수정");
      }
      const missing = json(saveSql({ date: "2026-09-10", revision: 1, request: 4 }));
      assert.equal(missing.status, "conflict");
      assert.equal(missing.review, null);
      const reusedDate = json(saveSql({ date: "2026-09-11" }));
      assert.equal(reusedDate.status, "conflict");
      assert.equal(reusedDate.error, "request-id-reused");
      assert.equal(sql("select count(*) from public.journal_entries;"), "1");
    });

    await t.test("SQL rejects empty, invalid and targetless numeric answers", () => {
      for (const options of [
        { energy: null }, { energy: null, focus: "\t\n", note: " \r\n" },
        { energy: 0 }, { energy: 6 }, { progress: 0 }, { progress: "0" },
        { focus: "x".repeat(501) }, { note: "x".repeat(4001) }, { revision: -1 },
        { timezone: "not/a-zone" },
      ]) {
        assert.equal(json(saveSql({ date: "2026-09-11", request: 5, ...options })).status, "invalid-input", JSON.stringify(options));
      }
      assert.equal(sql("select count(*) from public.journal_entries;"), "1");
    });

    await t.test("no target, focus only and identical text on different dates are separate answers", () => {
      assert.equal(json(saveSql({ date: "2026-09-11", energy: null, progress: "not_applicable", request: 6 })).status, "saved");
      assert.equal(json(saveSql({ date: "2026-09-10", energy: null, focus: "첫 단락", request: 7 })).status, "saved");
      assert.equal(json(saveSql({ date: "2026-09-09", energy: null, focus: "첫 단락", request: 8 })).status, "saved");
      assert.equal(sql("select count(*) from public.journal_entries;"), "4");
    });

    await t.test("workspace, date and receipt uniqueness are scoped independently", () => {
      const result = json(saveSql({ workspace: OTHER, timezone: "UTC", energy: 5 }));
      assert.equal(result.status, "saved");
      assert.equal(result.review.workspace_id, OTHER);
      assert.equal(result.review.review_data.energy, 5);
      assert.equal(json(saveSql()).review.review_data.energy, null);
    });

    await t.test("concurrent creates and edits cannot silently overwrite each other", async () => {
      const run = async (source) => JSON.parse((await promisify(execFile)("psql", [...args, "-c", source])).stdout.trim());
      const created = await Promise.all([run(saveSql({ date: "2026-09-08", request: 11 })), run(saveSql({ date: "2026-09-08", request: 12, energy: 5 }))]);
      assert.deepEqual(created.map((value) => value.status).sort(), ["conflict", "saved"]);
      const edited = await Promise.all([run(saveSql({ date: "2026-09-08", request: 13, revision: 1, energy: 3 })), run(saveSql({ date: "2026-09-08", request: 14, revision: 1, energy: 4 }))]);
      assert.deepEqual(edited.map((value) => value.status).sort(), ["conflict", "saved"]);
      const repeated = await Promise.all([1, 2, 3].map(() => run(saveSql({ date: "2026-09-07", request: 15 }))));
      assert.deepEqual(repeated.map((value) => value.status).sort(), ["duplicate", "duplicate", "saved"]);
      assert.equal(sql(`select count(*) from public.daily_review_receipts where request_id = '${requestId(15)}';`), "1");
    });

    await t.test("receipt failure rolls back the journal mutation", () => {
      sql(`create function public.fail_test_receipt() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$;
        create trigger fail_receipt before insert on public.daily_review_receipts for each row execute function public.fail_test_receipt();`);
      assert.throws(() => sql(saveSql({ date: "2026-09-06", request: 16 })));
      sql("drop trigger fail_receipt on public.daily_review_receipts;");
      assert.equal(sql("select count(*) from public.journal_entries where review_date = '2026-09-06';"), "0");
      assert.equal(sql(`select count(*) from public.daily_review_receipts where request_id = '${requestId(16)}';`), "0");
    });

    await t.test("generic notes remain possible and daily-review constraints cannot be bypassed", () => {
      sql(`insert into public.journal_entries (workspace_id, body) values ('${WORKSPACE}', '일반 기록');`);
      assert.equal(sql("select count(*) from public.journal_entries where entry_kind = 'note';"), "1");
      assert.throws(() => sql(`insert into public.journal_entries (workspace_id, body) values ('${WORKSPACE}', '');`));
      assert.throws(() => sql(`update public.journal_entries set review_data = '{"energy":null,"progress":0}', focus_target = '' where entry_kind = 'daily_review';`));
      assert.throws(() => sql(`insert into public.journal_entries (workspace_id, entry_kind, review_date, review_timezone, focus_target, review_data) values ('${WORKSPACE}', 'daily_review', '2026-09-12', 'Asia/Seoul', '', '{"energy":2,"progress":null}');`));
    });

    await t.test("only service_role can access tables or execute the write RPC", () => {
      const signature = "public.save_daily_review_v1(uuid,date,text,integer,text,jsonb,text,bigint,uuid)";
      for (const role of ["anon", "authenticated", "unrelated_role"]) {
        assert.equal(sql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`), "f");
        assert.equal(sql(`select has_table_privilege('${role}', 'public.journal_entries', 'SELECT,INSERT,UPDATE,DELETE');`), "f");
        assert.throws(() => sql(`set role ${role}; ${saveSql()}`));
      }
      assert.equal(sql(`select has_function_privilege('service_role', '${signature}', 'EXECUTE');`), "t");
      assert.equal(sql("select bool_and(relrowsecurity) from pg_class where relname in ('journal_entries', 'daily_review_receipts');"), "t");
      assert.equal(json(`set role service_role; ${saveSql({ date: "2026-09-05", request: 17 })}`).status, "saved");
    });

    await t.test("migration can be reapplied without modifying existing reviews", () => {
      const before = sql("select count(*) from public.journal_entries;");
      sql(migrationSql);
      assert.equal(sql("select count(*) from public.journal_entries;"), before);
      assert.equal(json(saveSql()).review.review_revision, 2);
    });
  } finally {
    if (started) execFileSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
    rmSync(directory, { recursive: true, force: true });
  }
});

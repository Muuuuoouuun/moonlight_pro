import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { DATABASE_FEATURES, readinessSql, summarizeReadiness } from "../../../scripts/database-readiness.mjs";

const available = process.getuid?.() !== 0 && ["initdb", "pg_ctl", "psql"].every((bin) =>
  spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
const migration = new URL("../../../supabase/migrations/20260923_0043_task_focus_cap.sql", import.meta.url);
const workspace = "33333333-3333-4333-8333-333333333333";
const ids = [1, 2, 3, 4, 5].map((n) => `55555555-5555-4555-8555-55555555555${n}`);
const day = "2026-09-21";

test("concurrent task updates cannot select a fourth focus task", { skip: available ? false : "PostgreSQL binaries and non-root user required" }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "task-focus-cap-pg-"));
  const data = join(directory, "data");
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", directory, "-p", "55501", "-U", "focus_test", "-d", "postgres"];
  const sql = (source) => execFileSync("psql", args, { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const localeEnv = { ...process.env, LC_ALL: process.env.LC_ALL || "C" };
  let started = false;
  let first;
  try {
    execFileSync("initdb", ["-D", data, "-U", "focus_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe", env: localeEnv });
    execFileSync("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -p 55501 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe", env: localeEnv });
    started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.workspaces (id uuid PRIMARY KEY);
      CREATE TABLE public.tasks (id uuid PRIMARY KEY, workspace_id uuid REFERENCES public.workspaces(id), meta jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO public.workspaces(id) VALUES ('${workspace}');
      INSERT INTO public.tasks(id, workspace_id, meta) VALUES
      ('${ids[0]}', '${workspace}', '{"focus_dates":["${day}"]}'),
      ('${ids[1]}', '${workspace}', '{"focus_dates":["${day}"]}'),
      ('${ids[2]}', '${workspace}', '{"focus_dates":[]}'),
      ('${ids[3]}', '${workspace}', '{"focus_dates":[]}');`);
    const feature = DATABASE_FEATURES.find((item) => item.migration === "20260923_0043_task_focus_cap.sql");
    const check = () => summarizeReadiness(JSON.parse(sql(`SELECT coalesce(json_agg(r),'[]') FROM (${readinessSql([feature])}) r;`)), [feature])[0];
    assert.equal(check().ready, false, "db:check must reject a database without the migration");
    if (existsSync(migration)) sql(readFileSync(migration, "utf8"));
    sql(`INSERT INTO public.tasks(id, workspace_id, meta) VALUES ('${ids[4]}', '${workspace}', '{"focus_dates":[]}');`);
    assert.equal(check().ready, true);
    sql("ALTER TABLE public.tasks DISABLE TRIGGER task_focus_cap_v1;");
    assert.equal(check().ready, false, "db:check must detect a disabled cap trigger");
    sql("ALTER TABLE public.tasks ENABLE REPLICA TRIGGER task_focus_cap_v1;");
    assert.equal(check().ready, false, "a replica-only trigger does not enforce normal writes");
    sql("ALTER TABLE public.tasks ENABLE TRIGGER task_focus_cap_v1;");

    first = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
    let firstOutput = "";
    const firstExit = new Promise((resolve) => first.on("exit", resolve));
    const firstReady = new Promise((resolve, reject) => {
      first.stdout.on("data", (chunk) => {
        firstOutput += chunk;
        if (firstOutput.includes("FIRST_UPDATED")) resolve();
      });
      first.on("error", reject);
      first.on("exit", (code) => { if (!firstOutput.includes("FIRST_UPDATED")) reject(new Error(`first psql exited ${code}`)); });
    });
    first.stdin.write(`BEGIN;\nUPDATE public.tasks SET meta = '{"focus_dates":["${day}"]}' WHERE id = '${ids[2]}';\nSELECT 'FIRST_UPDATED';\n`);
    await firstReady;

    const second = spawn("psql", [...args, "-c", `UPDATE public.tasks SET meta = '{"focus_dates":["${day}"]}' WHERE id = '${ids[3]}' /*SECOND_FOCUS_UPDATE*/;`], { stdio: ["ignore", "pipe", "pipe"] });
    let secondError = "";
    second.stderr.on("data", (chunk) => { secondError += chunk; });
    const secondExit = new Promise((resolve, reject) => {
      second.on("error", reject);
      second.on("exit", (code) => resolve(code));
    });
    // Hold the first transaction until the second command is blocked on its workspace lock.
    // Without 0043 the second command exits successfully instead, reproducing four picks.
    let secondBlocked = false;
    for (let attempt = 0; attempt < 100 && second.exitCode === null; attempt += 1) {
      const waitType = sql("SELECT coalesce(wait_event_type, '') FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND query LIKE '%/*SECOND_FOCUS_UPDATE*/%' LIMIT 1;");
      if (waitType === "Lock") { secondBlocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (existsSync(migration)) assert.equal(secondBlocked, true, "the competing update must wait for the first transaction");
    first.stdin.end("COMMIT;\n");
    assert.equal(await firstExit, 0, "the first pick must commit");
    const code = await secondExit;
    const selected = Number(sql(`SELECT count(*) FROM public.tasks WHERE workspace_id = '${workspace}' AND meta->'focus_dates' ? '${day}';`));
    assert.equal(selected, 3);
    assert.notEqual(code, 0, "the fourth pick must fail after the first transaction commits");
    assert.match(secondError, /focus-limit/);
  } finally {
    if (first && !first.killed) first.kill();
    if (started) execFileSync("pg_ctl", ["-D", data, "-m", "fast", "stop"], { stdio: "pipe", env: localeEnv });
    rmSync(directory, { recursive: true, force: true });
  }
});

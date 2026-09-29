#!/usr/bin/env node

// Apply one reviewed migration at a time through the Supabase Management API.
// The 0044 bootstrap is checked by its DB objects; later files use its ledger.
// Earlier files were applied before a ledger existed;
// their presence on disk is not evidence that they need to run again.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase/migrations");
const BOOTSTRAP = "20260923_0044_migration_history.sql";
const FILENAME = /^\d{8}_\d{4}_[a-z0-9_]+\.sql$/;
const PROJECT_REF = /^[a-z0-9]{20}$/;

function parseEnvFile(filepath) {
  if (!existsSync(filepath)) return {};
  const out = {};
  for (const rawLine of readFileSync(filepath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const norm = line.startsWith("export ") ? line.slice(7).trim() : line;
    const i = norm.indexOf("=");
    if (i <= 0) continue;
    const key = norm.slice(0, i).trim();
    let val = norm.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function envSources() {
  return [
    { name: ".env", values: parseEnvFile(path.join(root, ".env")) },
    { name: ".env.local", values: parseEnvFile(path.join(root, ".env.local")) },
    { name: "apps/hub/.env.local", values: parseEnvFile(path.join(root, "apps/hub/.env.local")) },
    { name: "process", values: process.env },
  ];
}

export function loadEnv() {
  return Object.assign({}, ...envSources().map(source => source.values));
}

export function deriveProjectRef(env) {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF.trim();
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

export function validateTargetRef(sources, expectedRef) {
  if (!PROJECT_REF.test(expectedRef || "")) throw Error("Pass a valid --expect-ref <project-ref>.");
  const configured = [];
  for (const { name, values } of sources) {
    for (const key of ["SUPABASE_PROJECT_REF", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
      const value = (values[key] || "").trim();
      if (!value) continue;
      let ref = value;
      if (key !== "SUPABASE_PROJECT_REF") {
        let host;
        try { host = new URL(value).hostname; } catch { throw Error(`${name}: ${key} is not a valid URL.`); }
        ref = host.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
      }
      if (!PROJECT_REF.test(ref || "")) throw Error(`${name}: ${key} is not a Supabase project ref.`);
      configured.push({ name, key, ref });
    }
  }
  if (!configured.length) throw Error("No configured Supabase project URL or ref.");
  const mismatch = configured.find(item => item.ref !== expectedRef);
  if (mismatch) throw Error(`${mismatch.name}: ${mismatch.key} points to ${mismatch.ref}; expected ${expectedRef}.`);
  return expectedRef;
}

export function parseMigrationArgs(args) {
  const options = { expectedRef: "", allowLegacy: false, files: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--expect-ref") options.expectedRef = args[++i] || "";
    else if (arg === "--allow-legacy") options.allowLegacy = true;
    else if (arg.startsWith("-")) throw Error(`Unknown option: ${arg}`);
    else if (!FILENAME.test(arg)) throw Error(`Use a migration filename, not a path: ${arg}`);
    else options.files.push(arg);
  }
  if (!options.files.length) throw Error("Specify at least one reviewed migration filename.");
  if (!PROJECT_REF.test(options.expectedRef)) throw Error("Pass --expect-ref <project-ref>.");
  if (new Set(options.files).size !== options.files.length) throw Error("Duplicate migration filename.");
  return options;
}

export async function runSql(ref, token, sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

function sqlRows(response, label) {
  if (!response.ok) throw Error(`${label}: HTTP ${response.status}.`);
  const rows = JSON.parse(response.body);
  if (!Array.isArray(rows)) throw Error(`${label}: invalid database response.`);
  return rows;
}

function bootstrapBodyHash() {
  const sql = readFileSync(path.join(migrationsDir, BOOTSTRAP), "utf8");
  const body = sql.match(/\bas\s+\$migration\$([\s\S]*?)\$migration\$;/i)?.[1];
  if (!body) throw Error("Bootstrap migration function body was not found.");
  return createHash("sha256").update(body).digest("hex");
}

export function bootstrapReadinessSql() {
  const bodyHash = bootstrapBodyHash();
  return `select
    to_regclass('moonlight_ops.applied_migrations') is not null as history,
    to_regprocedure('moonlight_ops.apply_migration(text,text,text)') is not null as executor,
    coalesce((select relrowsecurity from pg_class
      where oid = to_regclass('moonlight_ops.applied_migrations')), false) as rls,
    coalesce((select not p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '${bodyHash}'
      and exists (select 1 from unnest(p.proconfig) as configs(setting)
        where setting ~ '^search_path=pg_catalog, ?moonlight_ops$')
      from pg_proc p where p.oid = to_regprocedure('moonlight_ops.apply_migration(text,text,text)')), false)
      as implementation,
    not exists (select 1 from (values ('anon'), ('authenticated'), ('service_role')) as roles(role)
      where coalesce(has_schema_privilege(role, to_regnamespace('moonlight_ops'), 'USAGE'), false)
         or coalesce(has_table_privilege(role, to_regclass('moonlight_ops.applied_migrations'),
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), false)
         or coalesce(has_function_privilege(role,
           to_regprocedure('moonlight_ops.apply_migration(text,text,text)'), 'EXECUTE'), false))
      as private`;
}

async function bootstrapReady(ref, token) {
  const rows = sqlRows(await runSql(ref, token, bootstrapReadinessSql()), "Migration bootstrap check");
  return ["history", "executor", "rls", "implementation", "private"]
    .every(key => rows[0]?.[key] === true);
}

async function recordedHash(ref, token, filename) {
  const rows = sqlRows(await runSql(ref, token,
    `select sha256 from moonlight_ops.applied_migrations where filename = '${filename}'`), "Migration history read");
  return rows[0]?.sha256 ?? null;
}

// Base64 avoids SQL string quoting of arbitrary migration text. PostgreSQL
// parses the source inside apply_migration; its SPI executor forbids COMMIT.
export function migrationCallSql(sql, filename, sha256) {
  if (!FILENAME.test(filename) || !/^[0-9a-f]{64}$/.test(sha256)) throw Error("Invalid migration identity.");
  const payload = Buffer.from(sql, "utf8").toString("base64");
  return `select moonlight_ops.apply_migration(
    '${filename}', '${sha256}', convert_from(decode('${payload}', 'base64'), 'UTF8')
  ) as status;`;
}

function migrationFiles(filenames) {
  return filenames.map(filename => {
    const full = path.join(migrationsDir, filename);
    if (!existsSync(full)) throw Error(`Migration file not found: ${filename}`);
    const sql = readFileSync(full, "utf8");
    return { filename, sql, sha256: createHash("sha256").update(sql).digest("hex") };
  });
}

async function main() {
  const { expectedRef, allowLegacy, files } = parseMigrationArgs(process.argv.slice(2));
  const sources = envSources();
  const ref = validateTargetRef(sources, expectedRef);
  const token = (Object.assign({}, ...sources.map(source => source.values)).SUPABASE_ACCESS_TOKEN || "").trim();
  if (!token) throw Error("Missing SUPABASE_ACCESS_TOKEN.");
  const migrations = migrationFiles(files); // Check all paths before the first write.
  console.log(`Target project: ${ref}`);
  console.log(`Migrations: ${files.join(", ")}`);

  let ready = await bootstrapReady(ref, token);
  if (!ready && (migrations.length !== 1 || migrations[0].filename !== BOOTSTRAP)) {
    throw Error(`Migration history is missing. Apply ${BOOTSTRAP} by itself first.`);
  }
  for (const migration of migrations) {
    const { filename, sha256, sql } = migration;
    if (filename === BOOTSTRAP) {
      if (ready) { console.log(`[SKIP] ${filename} bootstrap objects already verified.`); continue; }
      process.stdout.write(`[..] ${filename} bootstrap ... `);
      let result;
      try { result = await runSql(ref, token, sql); }
      catch { throw Error(`${filename}: request ended without a response. Inspect bootstrap objects before retrying.`); }
      let after = false;
      try { after = await bootstrapReady(ref, token); } catch { /* report unknown below */ }
      if (!after) throw Error(`${filename}: bootstrap failed or commit state is unknown (HTTP ${result.status}). Inspect DB objects before retrying.`);
      ready = true;
      console.log("OK (objects and privileges verified)");
      continue;
    }
    const recorded = await recordedHash(ref, token, filename);
    if (recorded === sha256) {
      console.log(`[SKIP] ${filename} already recorded (${sha256.slice(0, 12)}).`);
      continue;
    }
    if (recorded) throw Error(`${filename}: recorded checksum differs from the file. Do not edit an applied migration.`);
    if (filename < BOOTSTRAP && !allowLegacy) {
      throw Error(`${filename}: untracked legacy migration. Verify its live state before using --allow-legacy.`);
    }
    const query = migrationCallSql(sql, filename, sha256);
    process.stdout.write(`[..] ${filename} (${sha256.slice(0, 12)}) ... `);
    let result;
    try { result = await runSql(ref, token, query); }
    catch {
      console.log("UNKNOWN");
      throw Error(`${filename}: request ended without a response. Commit state is unknown; inspect the history table before retrying.`);
    }
    if (!result.ok) {
      console.log(`HTTP ${result.status}`);
      // The API may report a network error after the transaction committed.
      let after;
      try { after = await recordedHash(ref, token, filename); } catch { /* report unknown below */ }
      if (after === sha256) {
        console.log(`[PASS] ${filename} committed; history read-back matches despite the HTTP error.`);
        continue;
      }
      throw Error(`${filename}: application failed or commit state is unknown. Inspect the history table before retrying.`);
    }
    let after;
    try { after = await recordedHash(ref, token, filename); }
    catch { throw Error(`${filename}: query returned success but history read-back failed. Commit state is unknown.`); }
    if (after !== sha256) throw Error(`${filename}: query returned success but history read-back did not match.`);
    console.log("OK (history verified)");
  }
  console.log("[PASS] Requested migrations are verified.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[FAIL] ${error.message}`); process.exitCode = 1; });
}

#!/usr/bin/env node

// Apply SQL migrations to the live Supabase project via the Management API.
//
// PostgREST (the service-role REST key) cannot run DDL, so this uses the
// Supabase Management API `/database/query` endpoint, which needs a personal
// access token (PAT, `sbp_...`) — create one at
// https://supabase.com/dashboard/account/tokens and put it in apps/hub/.env.local:
//
//   SUPABASE_ACCESS_TOKEN=sbp_xxx
//
// Then pass the exact migration filename, for example:
//   npm run db:migrate -- 20260713_0015_durable_task_loop.sql
// Running without filenames keeps the legacy 0005/0006 default and does not
// apply later migrations such as Phase 1A.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const DEFAULT_MIGRATIONS = [
  "20260617_0005_sales_os_sheets_sync.sql",
  "20260617_0006_crm_xiaoshouyi_owner_names.sql",
];

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

function loadEnv() {
  return {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
    ...parseEnvFile(path.join(root, "apps/hub/.env.local")),
    ...process.env,
  };
}

function deriveProjectRef(env) {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF.trim();
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

async function runSql(ref, token, sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text };
}

async function main() {
  const env = loadEnv();
  const token = (env.SUPABASE_ACCESS_TOKEN || "").trim();
  const ref = deriveProjectRef(env);

  if (!ref) {
    console.error("[FAIL] Could not derive project ref from SUPABASE_URL.");
    process.exit(1);
  }
  if (!token) {
    console.error("[FAIL] Missing SUPABASE_ACCESS_TOKEN (PAT, sbp_...).");
    console.error("       Create one: https://supabase.com/dashboard/account/tokens");
    console.error("       Add to apps/hub/.env.local: SUPABASE_ACCESS_TOKEN=sbp_xxx");
    process.exit(1);
  }

  const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MIGRATIONS;
  console.log(`Target project: ${ref}`);
  console.log(`Migrations: ${files.join(", ")}\n`);

  let failed = 0;
  for (const file of files) {
    const full = path.isAbsolute(file) ? file : path.join(root, "supabase/migrations", file);
    if (!existsSync(full)) {
      console.log(`[SKIP] ${file} (not found)`);
      failed += 1;
      continue;
    }
    const sql = readFileSync(full, "utf8");
    process.stdout.write(`[..] ${file} ... `);
    const result = await runSql(ref, token, sql);
    if (result.ok) {
      console.log("OK");
    } else {
      console.log(`FAIL (${result.status})`);
      console.log(`     ${result.body.slice(0, 500)}`);
      failed += 1;
    }
  }

  console.log("");
  if (failed) {
    console.log(`[FAIL] ${failed} migration(s) did not apply.`);
    process.exit(1);
  }
  console.log("[PASS] All migrations applied.");
}

await main();

#!/usr/bin/env node
// 리드 라벨 백필 2단계 — 승인된 제안 JSON을 라이브 leads.meta에 반영.
// 사용: node --env-file=.env.local scripts/apply-lead-labels.mjs --input <proposal.json> [--apply]
// 기본은 dry-run(쓰기 없음, 행별 판정 출력). --apply일 때만 PATCH.
// 안전장치: 행별 read-merge-write, operator/기존값 필드 스킵(core), workspace_id 이중 필터.
// 스펙: docs/superpowers/specs/2026-08-19-lead-subject-region-labels-design.md §3.1

import { readFile } from "node:fs/promises";

import { buildLabelApplyPatch } from "./lead-label-apply-core.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseArgs(argv) {
  const out = { input: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input") out.input = argv[++i] || null;
    else if (argv[i] === "--apply") out.apply = true;
  }
  if (!out.input) throw new Error("--input <proposal.json> is required");
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requiredEnv("SUPABASE_ANON_KEY");
  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() || requiredEnv("DEFAULT_WORKSPACE_ID");
  const headers = { apikey: key, authorization: `Bearer ${key}` };

  const { rows } = JSON.parse(await readFile(args.input, "utf8"));
  const candidates = rows.filter((r) => (r.proposedSubjects?.length || r.proposedRegion));
  let applied = 0;
  let skippedRows = 0;
  let failed = 0;

  for (const row of candidates) {
    const filter = `id=eq.${encodeURIComponent(row.id)}&workspace_id=eq.${encodeURIComponent(workspaceId)}`;
    const readResp = await fetch(`${url}/rest/v1/leads?${filter}&select=id,meta`, { headers });
    if (!readResp.ok) { failed += 1; console.error(`  read fail ${row.id} (${readResp.status})`); continue; }
    const [current] = await readResp.json();
    if (!current) { failed += 1; console.error(`  missing row ${row.id}`); continue; }

    const { patch, skipped } = buildLabelApplyPatch(current.meta, row);
    if (!patch) { skippedRows += 1; console.log(`  skip ${row.name} (${skipped.join(",") || "no-op"})`); continue; }

    if (!args.apply) {
      console.log(`  [dry] ${row.name} → subjects=${JSON.stringify(patch.subjects || null)} region=${patch.region || "—"}${skipped.length ? ` (skip:${skipped.join(",")})` : ""}`);
      applied += 1;
      continue;
    }
    const writeResp = await fetch(`${url}/rest/v1/leads?${filter}`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ meta: patch }),
    });
    if (!writeResp.ok) { failed += 1; console.error(`  PATCH fail ${row.name} (${writeResp.status})`); continue; }
    applied += 1;
    console.log(`  ok ${row.name}`);
  }
  console.log(`[apply-lead-labels] ${args.apply ? "APPLIED" : "dry-run"} candidates=${candidates.length} ${args.apply ? "written" : "would-write"}=${applied} skipped=${skippedRows} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

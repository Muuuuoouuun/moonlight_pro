#!/usr/bin/env node
// 리드 과목·지역 라벨 백필 1단계 — 제안 생성 (읽기 전용, 쓰기 없음).
// 사용: node --env-file=.env.local scripts/propose-lead-labels.mjs --out <path.json>
// 출력 JSON의 needsSearch 행을 네이버 조사로 채운 뒤 apply-lead-labels.mjs에 넘긴다.
// 스펙: docs/superpowers/specs/2026-08-19-lead-subject-region-labels-design.md §3.1

import { writeFile } from "node:fs/promises";

import { buildLabelProposal } from "../apps/hub/lib/sales-os/lead-labels.js";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseArgs(argv) {
  const out = { out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") out.out = argv[++i] || null;
  }
  if (!out.out) throw new Error("--out <path.json> is required");
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requiredEnv("SUPABASE_ANON_KEY");
  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() || requiredEnv("DEFAULT_WORKSPACE_ID");

  const query = new URLSearchParams({
    select: "id,name,meta,status",
    order: "created_at.asc",
    limit: "200",
  });
  query.append("workspace_id", `eq.${workspaceId}`);
  const response = await fetch(`${url}/rest/v1/leads?${query}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`leads read failed (${response.status})`);
  const rows = await response.json();

  const proposals = rows.map((row) => buildLabelProposal(row));
  const summary = {
    total: proposals.length,
    subjectsInferred: proposals.filter((p) => p.proposedSubjects.length).length,
    subjectsNeedSearch: proposals.filter((p) => p.needsSearch.subjects).length,
    regionNeedSearch: proposals.filter((p) => p.needsSearch.region).length,
  };
  await writeFile(args.out, `${JSON.stringify({ generatedAt: new Date().toISOString(), workspaceId, summary, rows: proposals }, null, 2)}\n`);
  console.log(`[propose-lead-labels] ${args.out}`);
  console.log(`  total=${summary.total} inferred=${summary.subjectsInferred} searchSubjects=${summary.subjectsNeedSearch} searchRegion=${summary.regionNeedSearch}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

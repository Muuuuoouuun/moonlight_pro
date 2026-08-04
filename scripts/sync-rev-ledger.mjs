#!/usr/bin/env node

// FY26-27 Sales Ledger "2. REV" 탭 → Moonlight 고객·기관 dry-run 대조.
//
// 시트 행을 7개 상태로 분류하고 source hash/revision을 계산한다.
// 이 단계는 Sheets와 Supabase를 읽기만 하며 고객·기관 데이터를 변경하지 않는다.
//
// 필요 env (apps/hub/.env.local 또는 셸):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY  — 시트 읽기 (뷰어 권한이면 충분)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / COM_MOON_DEFAULT_WORKSPACE_ID
//
// 실행:  node scripts/sync-rev-ledger.mjs          (사람이 읽는 요약)
//        node scripts/sync-rev-ledger.mjs --json   (기계 판독 JSON)
//        --apply는 Engine/RPC 적용 경로가 완성될 때까지 비활성화한다.

import { createSign, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { buildRevDryRunReport } from "./rev-ledger-sync-core.mjs";

const SHEET_ID = "1vBYyKc_pd5Kb2xyhDWG8lWMAd7fGsRcBoF_wK1wUc7Q";
const RANGE = "'2. REV'!A2:M500";
const APPLY = process.argv.includes("--apply");
const JSON_OUTPUT = process.argv.includes("--json");

if (APPLY) {
  console.error("[FAIL] 직접 DB 쓰기는 비활성화되었습니다. 승인된 Engine/RPC 적용 경로가 완성될 때까지 dry-run만 사용할 수 있습니다.");
  process.exit(1);
}

// --- env 로드 (apps/hub/.env.local 폴백) -----------------------------------

function loadEnvFile(filepath) {
  if (!existsSync(filepath)) return;
  for (const rawLine of readFileSync(filepath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(process.cwd(), "apps/hub/.env.local"));
// 서비스 계정 키가 다른 프로젝트 env에 있으면 경로로 주입: GOOGLE_ENV_FILE=/path/.env.local
if (process.env.GOOGLE_ENV_FILE) loadEnvFile(process.env.GOOGLE_ENV_FILE);

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
const SA_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const WORKSPACE_ID = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();

if (!SA_EMAIL || !SA_KEY) {
  console.error("[FAIL] GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY가 없습니다.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY || !WORKSPACE_ID) {
  console.error("[FAIL] SUPABASE_URL / key / COM_MOON_DEFAULT_WORKSPACE_ID가 없습니다.");
  process.exit(1);
}

// --- 서비스 계정 JWT → access token -----------------------------------------

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: SA_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(SA_KEY).toString("base64url");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(`token exchange failed: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.access_token;
}

async function main() {
  if (!JSON_OUTPUT) console.log(`[..] 시트 읽기: ${RANGE} (READ-ONLY DRY-RUN)`);
  const token = await getAccessToken();
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) throw new Error(`sheets read failed: http-${resp.status}`);
  const { values = [] } = await resp.json();
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` };
  const [leadsResp, companiesResp] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/leads?select=id,name,company_id,meta&workspace_id=eq.${WORKSPACE_ID}&limit=500`,
      { headers },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/companies?select=id,name,address,meta&workspace_id=eq.${WORKSPACE_ID}&limit=500`,
      { headers },
    ),
  ]);
  if (!leadsResp.ok) throw new Error(`leads read failed: http-${leadsResp.status}`);
  if (!companiesResp.ok) throw new Error(`companies read failed: http-${companiesResp.status}`);
  const [leads, companies] = await Promise.all([leadsResp.json(), companiesResp.json()]);

  const report = buildRevDryRunReport({
    values,
    companies,
    leads,
    sourceLinks: [],
    headerRowNumber: 2,
    fiscalPeriod: "FY26-27",
    batchId: randomUUID(),
  });

  const output = {
    mode: "read-only-dry-run",
    spreadsheetId: SHEET_ID,
    sheetId: 957802439,
    range: RANGE,
    ...report,
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const normalizedNote = report.normalizedInstitutionCount === report.institutionCount
    ? ""
    : ` (정규화 ${report.normalizedInstitutionCount})`;
  console.log(`[ok] 시트 업무 행 ${report.total}개 · 시트 기관 ${report.institutionCount}개${normalizedNote} · Moonlight 기관 ${companies.length}개 · 리드 ${leads.length}개`);
  console.log(`[ok] source revision ${report.sourceRevision.slice(0, 12)}… · stable ID ${report.identityReady ? "ready" : "missing"}`);
  for (const [classification, count] of Object.entries(report.counts)) {
    console.log(`     ${classification}: ${count}`);
  }
  console.log("\n[DRY-RUN] 읽기 전용 완료. 시트와 Moonlight 고객·기관 데이터는 변경되지 않았습니다.");
}

main().catch((e) => { console.error("[FAIL]", e.message); process.exit(1); });

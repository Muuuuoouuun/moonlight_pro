#!/usr/bin/env node

// FY26-27 Sales Ledger "2. REV" 탭 → leads.meta 보강 싱크.
//
// 시트의 Account(A)·Location(C)·Scale(D)·Manager(G)를 읽어 이름 매칭된 리드의
// meta에 scale(A/B/C/KA)·region(비어 있을 때만)·ka 플래그를 채운다.
// 시트는 읽기만 하고 DB가 정본 (docs 계약: 시트는 직접 upsert하지 않는다).
//
// 필요 env (apps/hub/.env.local 또는 셸):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY  — 시트 읽기 (뷰어 권한이면 충분)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / COM_MOON_DEFAULT_WORKSPACE_ID
//
// 실행:  node scripts/sync-rev-ledger.mjs          (dry-run, 기본)
//        node scripts/sync-rev-ledger.mjs --apply  (실제 반영)

import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const SHEET_ID = "1vBYyKc_pd5Kb2xyhDWG8lWMAd7fGsRcBoF_wK1wUc7Q";
const RANGE = "'2. REV'!A2:M500";
const APPLY = process.argv.includes("--apply");

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

// --- 매칭 정규화 -------------------------------------------------------------
// 보수적으로: 소문자화 + 공백/중점 제거만. "학원" 접미사 제거 같은 공격적 정규화는
// 오매칭(다른 학원끼리 병합)을 만들 수 있어 2차 패스로만 시도하고 리포트에 표시한다.

function normalize(name) {
  return String(name || "").toLowerCase().replace(/[\s·.\-()]/g, "");
}
function normalizeLoose(name) {
  return normalize(name).replace(/(어학원|학원|아카데미|academy|스쿨|school)$/i, "");
}

const SCALES = new Set(["A", "B", "C", "KA"]);

async function main() {
  console.log(`[..] 시트 읽기: ${RANGE} (${APPLY ? "APPLY" : "DRY-RUN"})`);
  const token = await getAccessToken();
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) throw new Error(`sheets read failed: http-${resp.status}`);
  const { values = [] } = await resp.json();

  // Account 단위 집계 — 같은 학원이 여러 행(HW/SW·New/Renew)로 나오므로 첫 유효값 우선
  const byAccount = new Map();
  for (const row of values) {
    const account = String(row[0] || "").trim();
    if (!account || account === "Account") continue;
    const location = String(row[2] || "").trim();
    const scale = String(row[3] || "").trim().toUpperCase();
    const manager = String(row[6] || "").trim();
    const cur = byAccount.get(account) || { account, location: "", scale: "", manager: "" };
    if (!cur.location && location && location !== "-") cur.location = location;
    if (!cur.scale && SCALES.has(scale)) cur.scale = scale;
    if (!cur.manager && manager && manager !== "-") cur.manager = manager;
    byAccount.set(account, cur);
  }
  console.log(`[ok] 시트 계정 ${byAccount.size}개 (행 ${values.length})`);

  // 리드 로드
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` };
  const leadsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?select=id,name,meta&workspace_id=eq.${WORKSPACE_ID}&limit=500`,
    { headers },
  );
  if (!leadsResp.ok) throw new Error(`leads read failed: http-${leadsResp.status}`);
  const leads = await leadsResp.json();
  console.log(`[ok] 리드 ${leads.length}개`);

  const strictIndex = new Map();
  const looseIndex = new Map();
  for (const item of byAccount.values()) {
    strictIndex.set(normalize(item.account), item);
    const loose = normalizeLoose(item.account);
    if (loose && !looseIndex.has(loose)) looseIndex.set(loose, item);
  }

  let matchedStrict = 0;
  let matchedLoose = 0;
  let patched = 0;
  let skippedSame = 0;
  const unmatchedSample = [];
  const plans = [];

  for (const lead of leads) {
    const meta = lead.meta && typeof lead.meta === "object" ? lead.meta : {};
    const strict = strictIndex.get(normalize(lead.name));
    const loose = strict || looseIndex.get(normalizeLoose(lead.name));
    const hit = strict || loose;
    if (!hit) {
      if (unmatchedSample.length < 8) unmatchedSample.push(lead.name);
      continue;
    }
    if (strict) matchedStrict += 1; else matchedLoose += 1;

    const patch = {};
    if (hit.scale && meta.scale !== hit.scale) patch.scale = hit.scale;
    if (hit.scale) {
      const ka = hit.scale === "KA";
      if (Boolean(meta.ka) !== ka) patch.ka = ka;
    }
    // region은 비어 있을 때만 — 운영자가 직접 넣은 세밀한 값("경기-안양")을 덮지 않는다
    if (hit.location && !meta.region) patch.region = hit.location;
    if (hit.manager && meta.rev_manager !== hit.manager) patch.rev_manager = hit.manager;

    if (!Object.keys(patch).length) { skippedSame += 1; continue; }
    plans.push({ id: lead.id, name: lead.name, matchKind: strict ? "strict" : "loose", patch, meta });
  }

  console.log(`[ok] 리드 매칭: strict ${matchedStrict} · loose ${matchedLoose} · 미매칭 ${leads.length - matchedStrict - matchedLoose}`);
  console.log(`[ok] 리드 변경 필요 ${plans.length} · 이미 동일 ${skippedSame}`);
  if (unmatchedSample.length) console.log(`     미매칭 예시: ${unmatchedSample.join(", ")}`);
  for (const p of plans.slice(0, 12)) {
    console.log(`     ${p.matchKind === "loose" ? "≈" : "="} ${p.name}: ${JSON.stringify(p.patch)}`);
  }
  if (plans.length > 12) console.log(`     … 외 ${plans.length - 12}건`);

  // 계약 고객(companies)도 같은 계약으로 매칭 — 히트맵 지역·KA 등급의 주 수혜자
  const compResp = await fetch(
    `${SUPABASE_URL}/rest/v1/companies?select=id,name,meta&workspace_id=eq.${WORKSPACE_ID}&limit=500`,
    { headers },
  );
  if (!compResp.ok) throw new Error(`companies read failed: http-${compResp.status}`);
  const companies = await compResp.json();
  const companyPlans = [];
  let compStrict = 0;
  let compLoose = 0;
  for (const comp of companies) {
    const meta = comp.meta && typeof comp.meta === "object" ? comp.meta : {};
    const strict = strictIndex.get(normalize(comp.name));
    const hit = strict || looseIndex.get(normalizeLoose(comp.name));
    if (!hit) continue;
    if (strict) compStrict += 1; else compLoose += 1;
    const patch = {};
    if (hit.scale && meta.scale !== hit.scale) patch.scale = hit.scale;
    if (hit.scale) {
      const ka = hit.scale === "KA";
      if (Boolean(meta.ka) !== ka) patch.ka = ka;
    }
    if (hit.location && !meta.region) patch.region = hit.location;
    if (hit.manager && meta.rev_manager !== hit.manager) patch.rev_manager = hit.manager;
    if (Object.keys(patch).length) companyPlans.push({ id: comp.id, name: comp.name, matchKind: strict ? "strict" : "loose", patch, meta });
  }
  console.log(`[ok] 회사 매칭: strict ${compStrict} · loose ${compLoose} / ${companies.length}개 · 변경 필요 ${companyPlans.length}`);
  for (const p of companyPlans.slice(0, 12)) {
    console.log(`     ${p.matchKind === "loose" ? "≈" : "="} ${p.name}: ${JSON.stringify(p.patch)}`);
  }
  if (companyPlans.length > 12) console.log(`     … 외 ${companyPlans.length - 12}건`);

  if (!APPLY) {
    console.log("\n[DRY-RUN] --apply로 실행하면 위 변경이 반영됩니다.");
    return;
  }

  for (const p of plans) {
    const merged = { ...p.meta, ...p.patch };
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?id=eq.${p.id}&workspace_id=eq.${WORKSPACE_ID}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ meta: merged }),
      },
    );
    if (r.ok) patched += 1;
    else console.error(`  [WARN] ${p.name}: http-${r.status}`);
  }
  let compPatched = 0;
  for (const p of companyPlans) {
    const merged = { ...p.meta, ...p.patch };
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?id=eq.${p.id}&workspace_id=eq.${WORKSPACE_ID}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ meta: merged }),
      },
    );
    if (r.ok) compPatched += 1;
    else console.error(`  [WARN] ${p.name}: http-${r.status}`);
  }
  console.log(`\n[PASS] 리드 ${patched}/${plans.length} · 회사 ${compPatched}/${companyPlans.length} meta 반영 완료.`);
}

main().catch((e) => { console.error("[FAIL]", e.message); process.exit(1); });

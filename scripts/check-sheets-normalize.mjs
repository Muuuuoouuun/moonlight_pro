#!/usr/bin/env node

// Unit checks for the pure Sheets intake normalization logic.
// No framework, no IO — mirrors the repo's other `check:*` scripts.

import process from "node:process";

import {
  computeMatchKey,
  mapRowToIntake,
  normalizeName,
  normalizePhone,
  rowsToObjects,
  toLeadStatus,
} from "../apps/hub/lib/sheets-normalize.js";

const failures = [];

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`[PASS] ${label}`);
  } else {
    console.log(`[FAIL] ${label}: expected ${e}, got ${a}`);
    failures.push(label);
  }
}

// --- normalizePhone (Korean-aware) ---
eq("phone landline", normalizePhone("02-1234-5678"), "0212345678");
eq("phone +82 mobile", normalizePhone("+82 10-1234-5678"), "01012345678");
eq("phone dotted", normalizePhone("010.1234.5678"), "01012345678");
eq("phone 82 prefix", normalizePhone("821012345678"), "01012345678");
eq("phone too short -> null", normalizePhone("123"), null);
eq("phone empty -> null", normalizePhone(""), null);

// --- normalizeName ---
eq("name collapse spaces", normalizeName("  강남  영어 학원 "), "강남 영어 학원");
eq("name empty -> null", normalizeName("   "), null);

// --- toLeadStatus (KR/EN -> enum) ---
eq("status 계약 -> won", toLeadStatus("계약"), "won");
eq("status 신규 -> new", toLeadStatus("신규"), "new");
eq("status passthrough qualified", toLeadStatus("qualified"), "qualified");
eq("status blank -> new", toLeadStatus(""), "new");

// --- computeMatchKey (phone > name+address > name) ---
eq("matchkey phone wins", computeMatchKey({ phone: "010-1234-5678", name: "강남학원" }), "phone:01012345678");
eq("matchkey name+address", computeMatchKey({ name: "강남학원", address: "서울 강남구" }), "na:강남학원|서울 강남구");
eq("matchkey name only", computeMatchKey({ name: "강남학원" }), "n:강남학원");
eq("matchkey empty -> null", computeMatchKey({}), null);

// --- rowsToObjects (header row + filter blanks) ---
const objs = rowsToObjects([
  ["상호", "전화"],
  ["강남학원", "010-1"],
  ["", ""],
]);
eq("rowsToObjects count (blank filtered)", objs.length, 1);
eq("rowsToObjects keys by header", { name: objs[0]["상호"], tel: objs[0]["전화"], row: objs[0].__row }, { name: "강남학원", tel: "010-1", row: 2 });

// --- mapRowToIntake (header map + normalize + match key) ---
const mapped = mapRowToIntake({
  __row: 5,
  상호: "강남학원",
  전화: "02-555-1234",
  주소: "서울 강남구",
  담당자: "김원장",
  상태: "신규",
  특이사항: "방문 예정",
});
eq("mapRowToIntake name", mapped.name, "강남학원");
eq("mapRowToIntake phone normalized", mapped.phone, "025551234");
eq("mapRowToIntake contact", mapped.contact_name, "김원장");
eq("mapRowToIntake status", mapped.status, "new");
eq("mapRowToIntake match_key", mapped.match_key, "phone:025551234");
eq("mapRowToIntake source_ref", mapped.source_ref, "row:5");
eq("mapRowToIntake unmapped -> extra", mapped.extra["특이사항"], "방문 예정");

const metaMapped = mapRowToIntake({
  __row: 7,
  full_name: "ClassIn 설명회",
  phone_number: "+82 10-9999-8888",
  leadgen_id: "LG-123",
  campaign_name: "Meta 설명회 캠페인",
  ad_name: "실사용 3초 영상",
  form_id: "FORM-9",
  created_time: "2026-06-20T10:00:00+09:00",
  대수: "3",
  매출: "60,000 CNY",
  유효: "유효",
});
eq("meta source inferred", metaMapped.source, "meta_ads");
eq("meta source_ref external id", metaMapped.source_ref, "LG-123");
eq("meta phone normalized", metaMapped.phone, "01099998888");
eq("meta campaign kept", metaMapped.campaign_name, "Meta 설명회 캠페인");
eq("meta unit count", metaMapped.unit_count, 3);
eq("meta revenue cny", metaMapped.revenue_cny, 60000);
eq("meta validity", metaMapped.validity, "유효");

console.log("");
if (failures.length) {
  console.log(`[FAIL] sheets-normalize: ${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("[PASS] sheets-normalize: all checks passed");
}

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

console.log("");
if (failures.length) {
  console.log(`[FAIL] sheets-normalize: ${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("[PASS] sheets-normalize: all checks passed");
}

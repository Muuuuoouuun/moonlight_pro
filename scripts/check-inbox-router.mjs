#!/usr/bin/env node

// Unit checks for the pure inbox capture classifier (capture-spine §2 routing).
// No framework, no live IO — mirrors the repo's other check:* scripts.

import process from "node:process";

import { KIND_DESTINATION, classifyCapture } from "../apps/hub/lib/sales-os/inbox-classify.js";

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

// --- hint precedence ---
eq("hint 리드 -> lead", classifyCapture("대치 학원", "리드").kind, "lead");
eq("hint 통화 -> outcome+phone", { k: classifyCapture("x", "통화").kind, c: classifyCapture("x", "통화").channel }, { k: "outcome", c: "phone" });
eq("hint DM -> dm", classifyCapture("뭐든", "DM").kind, "dm");
eq("hint 반응 -> engagement", classifyCapture("그 글", "반응").kind, "engagement");
eq("hint 메모 -> note", classifyCapture("x", "메모").kind, "note");
eq("unknown hint falls through to keyword/review", classifyCapture("그냥 잡담", "xyz").kind, "review");

// --- keyword inference (no hint) ---
eq("call outranks lead", classifyCapture("대치수학 원장 통화, 가격 비싸다, 화요일 재방문").kind, "outcome");
eq("call channel phone", classifyCapture("원장이랑 통화함").channel, "phone");
eq("visit channel", classifyCapture("강남학원 방문 다녀옴").channel, "visit");
eq("kakao channel", classifyCapture("카톡으로 견적 보냄, 방문 약속").channel, "kakao");
eq("dm capture", classifyCapture("인스타 디엠 옴, 도입 문의").kind, "dm");
eq("new lead via 명함", classifyCapture("세미나에서 명함 받음, 분당 영어학원").kind, "lead");
eq("idea capture", classifyCapture("릴스 소재 아이디어: 학원 원장 인터뷰").kind, "idea");
eq("engagement capture", classifyCapture("어제 카드뉴스 반응 좋았음, 저장 많이").kind, "engagement");
eq("note capture", classifyCapture("메모: 다음달 신학기 프로모션 준비").kind, "note");
eq("implicit todo stays note, never direct task", classifyCapture("todo 원장님께 다시 연락").kind, "note");
eq("implicit todo has no task destination", classifyCapture("할 일: 견적 다시 보내기").destination, "notes");

// --- ambiguous never drops ---
const amb = classifyCapture("음 그거 있잖아");
eq("ambiguous -> review", amb.kind, "review");
eq("review has no destination", amb.destination, null);
eq("review low confidence", amb.confidence, "low");

// --- destination map wiring ---
eq("outcome -> outreach_outcomes", KIND_DESTINATION.outcome, "outreach_outcomes");
eq("lead -> lead_intake_raw", KIND_DESTINATION.lead, "lead_intake_raw");
eq("idea -> content_items", KIND_DESTINATION.idea, "content_items");
eq("classify maps destination", classifyCapture("통화함").destination, "outreach_outcomes");

console.log("");
if (failures.length) {
  console.log(`[FAIL] inbox-router: ${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("[PASS] inbox-router: all checks passed");
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readSaveOutcome } from "./product-client.js";

// 문의에서 만든 일(프로젝트)에 고객이 빠지던 문제(2026-09-29). 동작은 product-catalog.test.mjs가
// workCreateBody·saveWork·inquiryWorkSeed로 고정하고, 이 파일은 화면이 그 함수들을 거치는 배선만 고정한다.
const page = readFileSync(new URL("./product-page.jsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("./product-inbox.jsx", import.meta.url), "utf8");
const drawer = page.slice(page.indexOf("export function WorkDrawer("), page.indexOf("function MonthDrawer("));

test("WorkDrawer saves through saveWork (→ workCreateBody) with the seed, and never hand-rolls entityRef", () => {
  assert.ok(drawer.length > 0, "WorkDrawer not found");
  assert.match(drawer, /await saveWork\(\{ createWork, linkInquiry \}, \{ product, draft, seed, id: newId\(\), createdId: created \}\)/);
  assert.ok(!/entityRef\s*:/.test(page), "고객 참조(entityRef)는 workCreateBody만 만든다");
  assert.ok(!/createWork\(|linkInquiry\(/.test(drawer), "쓰기 순서는 saveWork 하나가 가진다");
  assert.match(drawer, /subtitle=\{workDrawerSubtitle\(seed\)\}/);
  // 실패는 그대로 알리고 드로어를 연 채로 둔다 — 만든 일 id를 기억해 다시 누르면 문의만 붙인다.
  assert.match(drawer, /if \(!result\.ok\) \{ setCreated\(result\.createdId\); setState\(\{ saving: false, message: result\.message \}\); return; \}/);
  assert.ok(!/onSaved\(null\)/.test(drawer), "부분 실패에서 드로어를 닫으면 알림이 사라진다");
});

test("a partial create (work made, inquiry not linked) never closes silently: retry links only, closing leaves a danger toast", () => {
  assert.match(drawer, /<fieldset disabled=\{Boolean\(created\)\}/, "만든 뒤엔 입력을 잠근다");
  assert.match(drawer, /created \? "문의 다시 붙이기" : "일 만들기"/);
  assert.match(drawer, /const close = \(\) => \(created\s*\? onSaved\(`[^`]*문의는 붙지 않았어요[^`]*`, \{ tone: "danger" \}\)\s*: onClose\(\)\);/);
  assert.match(drawer, /onClose=\{state\.saving \? undefined : close\}/);
  assert.match(drawer, /<Button variant="ghost" size="sm" onClick=\{close\}/);
  // 부모는 토스트 옵션(tone)을 넘겨 받고, 닫은 뒤 새로 읽는다.
  assert.match(inbox, /onSaved=\{\(done, options\) => \{ setCreating\(null\); if \(done\) toast\(done, options\); onChanged\(\); \}\}/);
  assert.match(page, /const saved = \(message, options\) => \{\s*setDrawer\(null\);\s*if \(message\) toast\(message, options\);/);
});

test("the plain ＋ 일 drawer gets no seed, and the inbox seeds from the inquiry (its leadId becomes seed.customer)", () => {
  assert.match(page, /<WorkDrawer product=\{product\} areas=\{areas\} onClose=/);
  assert.match(inbox, /seed=\{inquiryWorkSeed\(inquiry, creating\.workType\)\}/);
  assert.ok(!/seed=\{\{/.test(inbox), "seed를 손으로 만들면 고객이 다시 빠진다");
  assert.match(inbox, /inquiryCustomer\(inquiry\) \? " · 고객 연결됨" : ""/);
});

test("an Engine rejection of the attached customer is a save failure with a named cause, never a success", () => {
  // 화면을 연 뒤 리드가 지워지면 Engine 관계 확인이 400 { status: "invalid-input", error: "invalid-reference" }로 거절한다.
  const gone = readSaveOutcome(400, { status: "invalid-input", error: "invalid-reference" });
  assert.equal(gone.ok, false);
  assert.match(gone.message, /고객 기록을 찾지 못했어요/);
  const malformed = readSaveOutcome(400, { status: "invalid-input", error: "invalid-entity-ref" });
  assert.equal(malformed.ok, false);
  assert.match(malformed.message, /고객 연결 값/);
});

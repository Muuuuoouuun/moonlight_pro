import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import { readSaveOutcome } from "./product-client.js";

// 문의에서 만든 일(프로젝트)에 고객이 빠지던 문제(2026-09-29). 동작은 product-catalog.test.mjs가
// workCreateBody·saveWork·inquiryWorkSeed로, 드로어 재시도는 product-work-retry.test.mjs로 고정한다.
// 이 파일은 화면이 그 함수들을 거치는 배선만 고정한다.
const page = readFileSync(new URL("./product-page.jsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("./product-inbox.jsx", import.meta.url), "utf8");
const drawer = page.slice(page.indexOf("export function WorkDrawer("), page.indexOf("function MonthDrawer("));

test("WorkDrawer saves through saveWork (→ workCreateBody) with the seed, and never hand-rolls entityRef", () => {
  assert.ok(drawer.length > 0, "WorkDrawer not found");
  assert.match(drawer, /workCreateBody\(product, draft, seed, newId\(\)\)/);
  assert.match(drawer, /await saveWork\(\{ createWork, linkInquiry \}, attempt\)/);
  assert.ok(!/entityRef\s*:/.test(page), "고객 참조(entityRef)는 workCreateBody만 만든다");
  assert.ok(!/createWork\(|linkInquiry\(/.test(drawer), "쓰기 순서는 saveWork 하나가 가진다");
  assert.match(drawer, /subtitle=\{workDrawerSubtitle\(seed\)\}/);
  // 실패는 그대로 알리고 드로어를 연 채로 둔다 — 만든 일 id를 기억해 다시 누르면 문의만 붙인다.
  assert.match(drawer, /setCreated\(result\.createdId\)/);
  assert.ok(!/onSaved\(null\)/.test(drawer), "부분 실패에서 드로어를 닫으면 알림이 사라진다");
});

test("a partial create (work made, inquiry not linked) never closes silently: retry links only, closing leaves a danger toast", () => {
  assert.match(drawer, /<fieldset disabled=\{[^}]*Boolean\(created\)/, "만든 뒤엔 입력을 잠근다");
  assert.match(drawer, /created \? "문의 다시 붙이기"/);
  // Execute the actual close callback: a synchronous pending guard may change
  // its syntax without changing the partial-success acknowledgement contract.
  const parsed = ts.createSourceFile("product-page.jsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "WorkDrawer");
  let closeNode;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "close") closeNode = node.initializer;
    ts.forEachChild(node, visit);
  }
  assert.ok(component, "WorkDrawer must exist");
  visit(component);
  assert.ok(closeNode, "close callback must exist");
  const instantiate = new Function("savingRef", "created", "onSaved", "onClose", "attemptRef", `return (${closeNode.getText(parsed)});`);
  const events = [];
  const savingRef = { current: true };
  const close = instantiate(savingRef, "saved-work", (...args) => events.push(["saved", ...args]), () => events.push(["closed"]), { current: { body: { title: "submitted title" } } });
  close();
  assert.deepEqual(events, [], "pending creation cannot close or acknowledge");
  savingRef.current = false;
  close();
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "saved");
  assert.match(events[0][1], /submitted title.*문의는 붙지 않았어요/);
  assert.deepEqual(events[0][2], { tone: "danger" });
  instantiate(savingRef, null, () => assert.fail("uncreated work cannot be acknowledged"), () => events.push(["closed"]), { current: null })();
  assert.deepEqual(events.at(-1), ["closed"]);
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

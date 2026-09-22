import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const customersSource = readFileSync(new URL("./customers.jsx", import.meta.url), "utf8");

test("SEGMENTS includes important customer segment with star label", () => {
  assert.match(customersSource, /\{ key: "important", label: "⭐ 중요 고객" \}/);
  assert.match(customersSource, /if \(seg === "important"\) return row\.focusOverride === "raise";/);
});

test("customer rows render 1-click star toggle button and 1px Moonstone accent stripe", () => {
  assert.match(customersSource, /icon="star"/);
  assert.match(customersSource, /className=\{r\.focusOverride === "raise" \? "hub-iconbtn--star-active" : ""\}/);
  assert.match(customersSource, /tooltip=\{r\.focusOverride === "raise" \? "중요 고객 해제" : "중요 고객으로 등록"\}/);
  assert.match(customersSource, /boxShadow: r\.focusOverride === "raise" \? "inset 1px 0 0 var\(--moon-300\)" : undefined/);
  assert.match(customersSource, /toggleImportant\(e, r\)/);
});

test("NewCustomerDrawer provides key customer checkbox and passes focusOverride", () => {
  assert.match(customersSource, /<CheckboxRow\s+checked=\{isImportant\}\s+onChange=\{setIsImportant\}\s+text="⭐ 중요 고객으로 등록 \(집중도 높임\)"/);
  assert.match(customersSource, /focusOverride: isImportant \? "raise" : "default"/);
});

test("Customer360Drawer provides 1-click VIP toggle button in header and syncs focus change", () => {
  assert.match(customersSource, /onFocusChange\?\.\(row\.key, next\)/);
  assert.match(customersSource, /\{focusOverride === "raise" \? "⭐ 중요 고객" : "중요 고객 지정"\}/);
  assert.match(customersSource, /\{ key: "raise", label: "올리기 \(중요\)" \}/);
});

test("CustomerDeleteAction announces 3.5s undo window and undoable deletion", () => {
  assert.match(customersSource, /삭제 후 3\.5초간 되돌릴 수 있습니다/);
  assert.match(customersSource, /삭제 \(되돌리기 지원\)/);
});

test("deleteNotice renders as a floating toast banner with undo action and DESIGN.md tokens", () => {
  assert.match(customersSource, /position:\s*"fixed"/);
  assert.match(customersSource, /bottom:\s*24/);
  assert.match(customersSource, /left:\s*"50%"/);
  assert.match(customersSource, /boxShadow:\s*"var\(--shadow-pop\)"/);
  assert.match(customersSource, /className="fade-up"/);
  assert.match(customersSource, /되돌리기 \(취소\)/);
});

test("ActivityTimeline supports activity deletion with undo notification in Customer360Drawer", () => {
  assert.match(customersSource, /onDeleteActivity=\{deleteActivity\}/);
  assert.match(customersSource, /saveRevenueRecord\("activity", "delete", \{ id: activity\.id \}\)/);
  assert.match(customersSource, /cust-act-delete-/);
  assert.match(customersSource, /actNotice && \(/);
});

test("Customer360Drawer integrates Guru strategic coaching (⌘J) and FloatingMentorWidget", () => {
  assert.match(customersSource, /Guru 전략 코칭 \(⌘J\)/);
  assert.match(customersSource, /FloatingMentorWidget/);
  assert.match(customersSource, /agent="guru"/);
  assert.match(customersSource, /contextType="customer"/);
  assert.match(customersSource, /onApplyText=\{/);
});

test("ContactOutcomeSheet provides AI Smart Autofill from conversation or call notes", () => {
  assert.match(customersSource, /✨ 대화·메모에서 폼 자동 채우기/);
  assert.match(customersSource, /parseContactOutcomeExtraction/);
  assert.match(customersSource, /handleAiExtract/);
  assert.match(customersSource, /추출 및 폼 채우기/);
  assert.match(customersSource, /personaId:\s*"sales"/);
  assert.match(customersSource, /mode:\s*"extract-contact-outcome"/);
});



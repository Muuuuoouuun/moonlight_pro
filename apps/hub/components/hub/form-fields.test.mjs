import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const primitivesSource = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const tokensSource = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");
const customersSource = await readFile(new URL("./pages/customers.jsx", import.meta.url), "utf8");
const followupsSource = await readFile(new URL("./pages/followups.jsx", import.meta.url), "utf8");
// 2026-09-22: 기록창이 페이지 두 곳(고객 DB 컨택 시트·고객 연락 인라인 폼)에서 공용 폼
// 하나로 합쳐졌다. 필드 계약을 지켜야 하는 "캡처 표면"은 이제 이 파일이다.
const contactRecordSource = await readFile(new URL("./contact-record-form.jsx", import.meta.url), "utf8");

const captureSurfaces = [
  ["contact-record-form", contactRecordSource],
];

test("labeled field primitives are exported from the shared primitive layer", () => {
  for (const component of ["TextField", "TextAreaField", "SelectField"]) {
    assert.match(primitivesSource, new RegExp(`export const ${component}\\b`));
  }
  assert.match(primitivesSource, /export function CheckboxRow\b/);
});

test("field chrome lives in the token layer, not in call sites", () => {
  assert.match(tokensSource, /\.hub-app \.hub-input \{/);
  assert.match(tokensSource, /\.hub-app \.hub-input:focus \{[^}]*border-color:\s*var\(--moon-300\)/);
  assert.match(tokensSource, /\.hub-app \.hub-input\[aria-invalid="true"\] \{[^}]*border-color:\s*var\(--danger\)/);
});

// Regression: every capture surface used to set `outline: none` inline on its inputs.
// Inline styles beat the stylesheet, so that one property removed the §11 :focus-visible
// ring from the whole form — keyboard users got no focus indicator at all.
test("capture surfaces never suppress the keyboard focus ring inline", () => {
  for (const [name, source] of captureSurfaces) {
    assert.doesNotMatch(source, /outline:\s*["']none["']/, `${name} must not disable the focus ring inline`);
  }
});

test("capture surfaces compose fields instead of re-declaring raw controls", () => {
  for (const [name, source] of captureSurfaces) {
    assert.doesNotMatch(source, /<input\b/, `${name} must use TextField, not a bare input`);
    assert.doesNotMatch(source, /<select\b/, `${name} must use SelectField, not a bare select`);
    assert.doesNotMatch(source, /<textarea\b/, `${name} must use TextAreaField, not a bare textarea`);
  }
});

// Regression: `<Checkbox label="기약 없음" />` beside a plain <span>기약 없음</span> shipped a
// dead text target and announced the same name twice.
test("checkbox text is part of the control, not a sibling span", () => {
  for (const [name, source] of captureSurfaces) {
    assert.match(source, /<CheckboxRow\b/, `${name} must use the single-control checkbox row`);
    assert.doesNotMatch(source, /<Checkbox\s/, `${name} must not pair a bare Checkbox with its own label text`);
  }
});

test("a checkbox carrying visible text keeps the coarse-pointer touch floor", () => {
  const coarse = tokensSource.slice(tokensSource.indexOf("@media (pointer: coarse), (max-width: 720px)"));
  assert.match(
    coarse,
    /\.hub-app button\[role="checkbox"\]\.hub-checkbox-row \{\s*min-height:\s*44px !important/,
  );
});

test("required fields announce themselves and errors are wired to the control", () => {
  assert.match(primitivesSource, /'aria-required':\s*required \? true : undefined/);
  assert.match(primitivesSource, /'aria-invalid':\s*error \? true : undefined/);
  assert.match(primitivesSource, /'aria-describedby':\s*\(hint \|\| error\) \? `\$\{fid\}-msg` : undefined/);
  assert.match(primitivesSource, /<label className="hub-label" htmlFor=\{id\}>/);
});

// The save button used to sit disabled with no explanation of what was missing.
test("the contact outcome save button stays pressable and names what is missing", () => {
  assert.doesNotMatch(contactRecordSource, /disabled=\{!can[A-Za-z]*\}/);
  assert.match(contactRecordSource, /setAttempted\(true\);/);
  assert.match(contactRecordSource, /reactionRef\.current\?\.querySelector\("button"\)\?\.focus\(\)/);
});

// 두 페이지가 각자 그리던 기록 폼은 사라졌다 — 다시 생기면 진입점마다 필수 필드·되돌리기가
// 갈라진다(그게 원래 문제였다).
test("the capture form lives in exactly one place", () => {
  for (const [name, source] of [["customers", customersSource], ["followups", followupsSource]]) {
    assert.doesNotMatch(source, /function (ContactOutcomeSheet|LogForm)\b/, `${name} must not re-grow its own capture form`);
  }
  assert.match(customersSource, /<ContactRecordForm\b/);
  assert.match(followupsSource, /<ContactRecordDrawer\b/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSignedWon, formatSignedWonShort, formatWon, formatWonShort, parseWon } from "./won-format.js";

test("formatWon keeps every won in 만·억 groups", () => {
  assert.equal(formatWon(0), "0원");
  assert.equal(formatWon(9900), "9,900원");
  assert.equal(formatWon(10000), "1만원");
  assert.equal(formatWon(1200000), "120만원");
  assert.equal(formatWon(1234567), "123만 4,567원");
  assert.equal(formatWon(120000000), "1억 2,000만원");
  assert.equal(formatWon(300000000), "3억원");
  assert.equal(formatWon(100000500), "1억 500원");
  assert.equal(formatWon(-52300), "−5만 2,300원");
  assert.equal(formatWon(null), "—");
  assert.equal(formatWon(undefined, { empty: "미확인" }), "미확인");
  assert.equal(formatWon("nope"), "—");
});

test("formatWonShort rounds for headers, charts, and chips", () => {
  assert.equal(formatWonShort(0), "0원");
  assert.equal(formatWonShort(500), "500원");
  assert.equal(formatWonShort(15000), "1.5만원");
  assert.equal(formatWonShort(30000), "3만원");
  assert.equal(formatWonShort(99960), "10만원");
  assert.equal(formatWonShort(600000), "60만원");
  assert.equal(formatWonShort(1234567), "123만원");
  assert.equal(formatWonShort(12345678), "1,235만원");
  assert.equal(formatWonShort(99_995_000), "1억원");
  assert.equal(formatWonShort(123456789), "1.2억원");
  assert.equal(formatWonShort(15_000_000_000), "150억원");
  assert.equal(formatWonShort(2400000, { unit: false }), "240만");
  assert.equal(formatWonShort(-200000), "−20만원");
  assert.equal(formatWonShort(null), "—");
});

test("formatSignedWon keeps the exact difference", () => {
  assert.equal(formatSignedWon(34000), "+3만 4,000원");
  assert.equal(formatSignedWon(-200000), "−20만원");
  assert.equal(formatSignedWon(0), "0원");
  assert.equal(formatSignedWon("nope"), "0원");
});

test("formatSignedWonShort marks the direction of a difference", () => {
  assert.equal(formatSignedWonShort(300000), "+30만원");
  assert.equal(formatSignedWonShort(-200000), "−20만원");
  assert.equal(formatSignedWonShort(0), "0원");
  assert.equal(formatSignedWonShort("nope"), "0원");
});

test("parseWon reads the new notation, typed shorthand, and legacy labels", () => {
  assert.equal(parseWon("120만원"), 1200000);
  assert.equal(parseWon("123만 4,567원"), 1234567);
  assert.equal(parseWon("1억 2,000만원"), 120000000);
  assert.equal(parseWon("1.2억"), 120000000);
  assert.equal(parseWon("2천만원"), 20000000);
  assert.equal(parseWon("1억2천만"), 120000000);
  assert.equal(parseWon("5천"), 5000);
  assert.equal(parseWon("1.5만"), 15000);
  assert.equal(parseWon("9,900원"), 9900);
  assert.equal(parseWon("−20만원"), -200000);
  assert.equal(parseWon("+30만원"), 300000);
  assert.equal(parseWon("₩1.2M"), 1200000);
  assert.equal(parseWon("₩900K"), 900000);
  assert.equal(parseWon("1200000"), 1200000);
  assert.equal(parseWon(1200000.4), 1200000);
  assert.equal(parseWon("—"), null);
  assert.equal(parseWon(""), null);
  assert.equal(parseWon("만"), null);
  assert.equal(parseWon("abc"), null);
});

test("formatWon round-trips through parseWon without losing won", () => {
  for (const n of [0, 9900, 1200000, 1234567, 120000000, 100000500, 987654321]) {
    assert.equal(parseWon(formatWon(n)), n);
  }
});

test("parseWon preserves the signs of legacy currency-prefixed amounts", () => {
  for (const label of ["₩-1200000", "₩-1.2M", "-₩1,200,000", "₩ −120만원"]) {
    assert.equal(parseWon(label), -1_200_000, label);
  }
  assert.equal(parseWon("₩+900K"), 900_000);
  assert.equal(parseWon("₩-0.5"), -1, "retain existing signed text rounding");
});

test("parseWon rejects overflow in plain, legacy and Korean amounts", () => {
  for (const label of ["9".repeat(309), `${"9".repeat(309)}M`, `${"9".repeat(308)}억`, `-${"9".repeat(308)}만`]) {
    assert.equal(parseWon(label), null, `overflow ${label.slice(-12)}`);
  }
});

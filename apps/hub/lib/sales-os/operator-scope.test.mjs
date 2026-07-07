import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  DEFAULT_EEOCRM_OWNER_ID,
  DEFAULT_OPERATOR_EMAIL,
  assertEeocrmOwnerId,
  assertOperatorEmail,
  assertPersonalLeadsSpreadsheetId,
  resolveOperatorAlias,
} from "./operator-scope.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.COM_MOON_PERSONAL_LEADS_SPREADSHEET_ID = "sheet-personal";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("operator scope defaults to Mun Junhyuk's ClassIn account", () => {
  assert.equal(assertOperatorEmail(DEFAULT_OPERATOR_EMAIL).ok, true);
  assert.equal(assertOperatorEmail("JUNHYUK.MUN@CLASSIN.COM").ok, true);
  assert.equal(resolveOperatorAlias(), "junhyuk");
});

test("operator scope rejects non-Junhyuk Google accounts", () => {
  const result = assertOperatorEmail("someone@classin.com", "google_sheets");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "operator-email-mismatch");
  assert.equal(result.expected, DEFAULT_OPERATOR_EMAIL);
  assert.equal(result.actual, "someone@classin.com");
});

test("personal leads sheet scope accepts only the configured sheet id", () => {
  assert.equal(assertPersonalLeadsSpreadsheetId("sheet-personal").ok, true);

  const result = assertPersonalLeadsSpreadsheetId("other-sheet");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "personal-leads-spreadsheet-mismatch");
  assert.equal(result.expected, "sheet-personal");
  assert.equal(result.actual, "other-sheet");
});

test("eeoCRM scope stays pinned to the current operator ownerId", () => {
  assert.equal(assertEeocrmOwnerId(DEFAULT_EEOCRM_OWNER_ID).ok, true);

  const result = assertEeocrmOwnerId("other-owner");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "eeocrm-owner-mismatch");
});

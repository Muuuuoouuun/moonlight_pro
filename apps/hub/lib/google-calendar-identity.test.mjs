import assert from "node:assert/strict";
import { test } from "node:test";

import { extractGoogleCalendarAccountIdentity } from "./google-calendar-identity.js";

test("uses an email-shaped Calendar API summary as the connected account identity", () => {
  assert.equal(
    extractGoogleCalendarAccountIdentity({ summary: " Junhyuk.Mun@ClassIn.com " }),
    "junhyuk.mun@classin.com",
  );
});

test("does not mistake a human calendar title for an account identity", () => {
  assert.equal(extractGoogleCalendarAccountIdentity({ summary: "Moonlight company calendar" }), null);
  assert.equal(extractGoogleCalendarAccountIdentity(null), null);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCalendarCapabilities } from "./calendar-capabilities.js";

test("treats a live iCal source as real data with read-only controls", () => {
  assert.deepEqual(
    resolveCalendarCapabilities({ status: "live", source: "ical", readOnly: true }),
    {
      isLive: true,
      canCreate: false,
      shouldShowEvents: true,
      badge: "iCal · read only",
    },
  );
});

test("does not show mock events or write controls when calendar is disconnected", () => {
  assert.deepEqual(
    resolveCalendarCapabilities({ status: "preview", source: null, readOnly: false }),
    {
      isLive: false,
      canCreate: false,
      shouldShowEvents: false,
      badge: "connection required",
    },
  );
});

test("keeps OAuth live calendars writable", () => {
  assert.deepEqual(
    resolveCalendarCapabilities({ status: "live", source: "oauth", readOnly: false }),
    {
      isLive: true,
      canCreate: true,
      shouldShowEvents: true,
      badge: "Google Calendar · live",
    },
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCalendarCapabilities } from "./calendar-capabilities.js";

test("partial OAuth/iCal reads preserve known source capabilities without claiming complete data", () => {
  for (const source of ["oauth", "ical"]) {
    const capability = resolveCalendarCapabilities({ status: "partial", source, readOnly: source === "ical" });
    assert.equal(capability.shouldShowEvents, true);
    assert.equal(capability.canCreate, source === "oauth");
    assert.match(capability.badge, /일부 일정만 확인/);
  }
  assert.equal(resolveCalendarCapabilities({ status: "partial", source: "oauth", readOnly: true }).canCreate, false);
});

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

test("a read failure is unverified, not proof of disconnection or write permission", () => {
  assert.deepEqual(resolveCalendarCapabilities({ status: "error", source: "oauth", readOnly: false }), {
    isLive: false, canCreate: false, shouldShowEvents: false, badge: "read failed",
  });
  assert.equal(resolveCalendarCapabilities({ status: "loading", source: "oauth" }).canCreate, false);
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

test("shows merged Personal+Company feeds as live read-only when both sources are up", () => {
  assert.deepEqual(
    resolveCalendarCapabilities({ status: "live", source: "multi", readOnly: true }),
    {
      isLive: true,
      canCreate: false,
      shouldShowEvents: true,
      badge: "Personal + Company · read only",
    },
  );
});

test("still shows events when only one of Personal/Company is reachable", () => {
  assert.deepEqual(
    resolveCalendarCapabilities({ status: "partial", source: "multi", readOnly: true }),
    {
      isLive: true,
      canCreate: false,
      shouldShowEvents: true,
      badge: "Personal/Company · 일부 연결",
    },
  );
});

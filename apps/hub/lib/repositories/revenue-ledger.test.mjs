import assert from "node:assert/strict";
import { test } from "node:test";

import { mapDeal } from "./revenue-ledger.js";

test("mapDeal reads back the next-meeting breadcrumb and rejects a non-object", () => {
  const breadcrumb = {
    eventId: "evt-1",
    summary: "갈무리학원 미팅",
    startAt: "2026-08-15T05:00:00.000Z",
    htmlLink: "https://calendar.google.com/event?eid=evt-1",
  };

  assert.deepEqual(
    mapDeal({ id: "deal-1", title: "갈무리 SW", meta: { next_meeting: breadcrumb } }, new Map()).nextMeeting,
    breadcrumb,
  );
  assert.equal(mapDeal({ id: "deal-2", title: "미예약", meta: {} }, new Map()).nextMeeting, null);
  // 과거 문자열 값이 남아 있어도 UI가 .startAt을 읽다 깨지지 않게 막는다.
  assert.equal(
    mapDeal({ id: "deal-3", title: "구형", meta: { next_meeting: "2026-08-15" } }, new Map()).nextMeeting,
    null,
  );
});

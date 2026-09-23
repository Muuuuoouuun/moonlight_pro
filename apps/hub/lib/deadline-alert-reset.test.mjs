import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectLegacyDeadlines,
  deadlineDayKey,
  isDeadlineAlertSuppressed,
  readDeadlineAlertReset,
  weekStartDayKey,
} from "./deadline-alert-reset.js";

test("legacy alert reset uses the operator's Monday and excludes current-week deadlines", () => {
  assert.equal(deadlineDayKey("2026-09-20T16:00:00Z"), "2026-09-21");
  assert.equal(weekStartDayKey(new Date("2026-09-22T23:30:00Z")), "2026-09-21");
  const beforeDay = "2026-09-21";
  const items = collectLegacyDeadlines({
    tasks: [
      { id: "old-task", status: "todo", due_at: "2026-09-20" },
      { id: "done-task", status: "done", due_at: "2026-09-19" },
      { id: "new-task", status: "todo", due_at: "2026-09-21" },
    ],
    deals: [
      { id: "old-deal", stage: "proposal", expected_close_at: "2026-08-26T16:00:00Z" },
      { id: "won-deal", stage: "won", meta: { stage_detail: "final" }, expected_close_at: "2026-06-03T00:00:00Z" },
    ],
    projects: [
      { id: "old-project", status: "active", due_at: "2026-05-08T07:20:52Z" },
      { id: "archived-project", status: "archived", due_at: "2026-05-08T07:20:52Z" },
    ],
  }, beforeDay);
  assert.deepEqual(items.map(({ kind, id }) => `${kind}:${id}`), ["task:old-task", "deal:old-deal", "project:old-project"]);
  const reset = readDeadlineAlertReset({ deadline_alert_reset: { resetAt: "2026-09-23T00:00:00Z", beforeDay, items } });
  assert.equal(isDeadlineAlertSuppressed(reset, "deal", "old-deal", "2026-08-26T16:00:00Z"), true);
  assert.equal(isDeadlineAlertSuppressed(reset, "deal", "old-deal", "2026-09-21T16:00:00Z"), false);
});

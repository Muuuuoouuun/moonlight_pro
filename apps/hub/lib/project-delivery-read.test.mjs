import assert from "node:assert/strict";
import { test } from "node:test";
import { mapProjects } from "./repositories/operating-ledger.js";
import { buildProjectTimeline } from "./pms-ui.js";

test("project reads retain planned and actual dates, conditions and the canonical next action", () => {
  const row = { id: "p", name: "Prototype", status: "active", started_at: "2026-09-10T00:00:00Z", completed_at: null, due_at: "2026-09-15T00:00:00Z", next_action: "새로 저장한 다음 행동", meta: { delivery: { plannedStart: "2026-09-09", prototypeDate: "2026-09-11", nextAction: "이전 행동", criteria: [{ id: "one", text: "저장", done: true }], history: [{ reason: "범위 조정" }] } } };
  const project = mapProjects([row], new Map(), new Map(), new Map())[0];
  assert.equal(project.delivery.nextAction, row.next_action);
  assert.equal(project.startedAt, row.started_at);
  assert.deepEqual(project.delivery.criteria, row.meta.delivery.criteria);
  assert.equal(project.delivery.history[0].reason, "범위 조정");
  assert.equal(project.completedAt, null);
});

test("planned start supplies a timeline period before actual work begins", () => {
  const project = { id: "p", delivery: { plannedStart: "2026-09-09" }, dueAt: "2026-09-15", startedAt: null };
  const timeline = buildProjectTimeline([project], { today: new Date("2026-09-09T00:00:00Z") });
  assert.equal(timeline.items[0].kind, "range");
  assert.equal(project.startedAt, null, "a planned start never fabricates an actual timestamp");
});

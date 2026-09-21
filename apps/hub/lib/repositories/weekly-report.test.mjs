import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function withWorkspaceFilter(filters = []) { return [["workspace_id", "eq.workspace-1"], ...filters]; }
export async function fetchSupabaseRows(table, options = {}) {
  globalThis.__weeklyReportState.calls.push({ table, options });
  return globalThis.__weeklyReportState.rows[table];
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/server-read") {
      return { url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__weeklyReportState = { calls: [], rows: {} };
const { getWeeklyReport } = await import("./weekly-report.js?campaign-scorecard-contract");

beforeEach(() => {
  state.calls = [];
  state.rows = {
    tasks: [{ id: "task-1", title: "제안서 발송", status: "done", completed_at: "2026-09-20T01:00:00Z" }],
    // 0a: 연락 기록의 단일 원천은 crm_activities — note는 대화가 아니라 "연락"에 세지 않는다.
    crm_activities: [{ id: "act-1", kind: "call" }, { id: "act-2", kind: "note" }, { id: "act-3", kind: "kakao" }],
    deals: [{ id: "deal-1", title: "개인 진단", stage: "proposal", meta: { type: "personal" } }],
    publish_logs: [{ id: "publish-1" }],
    campaigns: [{
      id: "campaign-1",
      name: "Founder OS 론칭",
      status: "active",
      meta: {
        business_truth: {
          primary_metric: "유료 진단 예약",
          weekly_target: 5,
          weekly_actual: 2,
        },
      },
    }],
  };
});

test("personal weekly report adds the active campaign target-versus-actual scorecard", async () => {
  const report = await getWeeklyReport({ scope: "personal" });

  assert.deepEqual(state.calls.map((call) => call.table), [
    "tasks",
    "crm_activities",
    "deals",
    "publish_logs",
    "campaigns",
  ]);
  assert.deepEqual(report.scorecard, {
    campaignId: "campaign-1",
    campaignName: "Founder OS 론칭",
    metric: "유료 진단 예약",
    target: 5,
    actual: 2,
    gap: -3,
    progress: 40,
  });
});

test("company weekly report does not read or report personal campaign strategy", async () => {
  const report = await getWeeklyReport({ scope: "company" });

  assert.deepEqual(state.calls.map((call) => call.table), [
    "tasks",
    "crm_activities",
    "deals",
    "publish_logs",
  ]);
  assert.equal(report.scorecard, null);
});

test("campaign read failure is named as a partial personal report", async () => {
  state.rows.campaigns = null;

  const report = await getWeeklyReport({ scope: "personal" });

  assert.equal(report.source, "supabase");
  assert.equal(report.partial, true);
  assert.deepEqual(report.failedSources, ["campaigns"]);
  assert.equal(report.scorecard, null);
});

test("contacts count only conversation kinds from crm_activities, and done tasks by completed_at", async () => {
  const report = await getWeeklyReport({ scope: "personal" });

  assert.equal(report.stats.contacts, 2);
  const tasksCall = state.calls.find((call) => call.table === "tasks");
  assert.ok(tasksCall.options.filters.some(([column, value]) => column === "completed_at" && String(value).startsWith("gte.")));
  assert.ok(!tasksCall.options.filters.some(([column]) => column === "updated_at"));
  const activityCall = state.calls.find((call) => call.table === "crm_activities");
  assert.ok(activityCall.options.filters.some(([column, value]) => column === "occurred_at" && String(value).startsWith("gte.")));
});

test("activity read failure is named as crm_activities, not outreach_outcomes", async () => {
  state.rows.crm_activities = null;

  const report = await getWeeklyReport({ scope: "company" });

  assert.equal(report.partial, true);
  assert.deepEqual(report.failedSources, ["crm_activities"]);
  assert.equal(report.stats.contacts, 0);
});

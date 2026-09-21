import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

// 같은 테이블을 다른 필터로 두 번 읽는다(tasks: 완료/오늘 3개, journal_entries: 메모/하루 리뷰).
// 스텁은 필터로 슬라이스를 고른다 — 실제 원장이 그 필터로 갈라지는 것을 테스트가 흉내낸다.
const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function withWorkspaceFilter(filters = []) { return [["workspace_id", "eq.workspace-1"], ...filters]; }
function sliceKey(table, filters = []) {
  if (table === "tasks" && filters.some(([key]) => key === "meta->>focus_dates")) return "tasks:focus";
  if (table === "journal_entries") {
    const kind = filters.find(([key]) => key === "entry_kind")?.[1] || "";
    return kind.endsWith("daily_review") ? "journal_entries:daily_review" : "journal_entries:note";
  }
  return table;
}
export async function fetchSupabaseRows(table, options = {}) {
  const key = sliceKey(table, options.filters);
  globalThis.__weeklyReportState.calls.push({ table, key, options });
  return globalThis.__weeklyReportState.rows[key];
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
const { getWeeklyReport, summarizeFocusWindow } = await import("./weekly-report.js?campaign-scorecard-contract");

// 2026-09-21(월) 12:00 KST — 창은 09-14 12:00 KST부터.
const NOW = new Date("2026-09-21T03:00:00.000Z");

beforeEach(() => {
  state.calls = [];
  state.rows = {
    tasks: [{ id: "task-1", title: "제안서 발송", status: "done", completed_at: "2026-09-19T02:00:00.000Z" }],
    "tasks:focus": [
      // 오늘 골라 오늘 끝냄 → picked 1 · done 1
      { id: "task-1", status: "done", completed_at: "2026-09-21T01:00:00.000Z", meta: { focus_dates: ["2026-09-21"] } },
      // 금요일에 골랐지만 안 끝냄 → picked 1 · done 0
      { id: "task-2", status: "todo", completed_at: null, meta: { focus_dates: ["2026-09-18"] } },
      // 창 밖(3주 전) 선택은 세지 않는다
      { id: "task-3", status: "done", completed_at: "2026-09-01T01:00:00.000Z", meta: { focus_dates: ["2026-09-01"] } },
    ],
    crm_activities: [
      { id: "act-1", kind: "call", occurred_at: "2026-09-18T01:00:00.000Z" },
      { id: "act-2", kind: "kakao", occurred_at: "2026-09-19T01:00:00.000Z" },
      // 내부 기록은 연락이 아니다
      { id: "act-3", kind: "note", occurred_at: "2026-09-19T02:00:00.000Z" },
      // 딜 단계 이동(6.3) — 연락이 아니라 이동 딜로 센다
      { id: "act-4", kind: "deal", occurred_at: "2026-09-20T02:00:00.000Z", meta: { from: "quote", to: "final" } },
    ],
    deals: [{ id: "deal-1", title: "개인 진단", stage: "proposal", meta: { type: "personal" } }],
    publish_logs: [{ id: "publish-1" }],
    "journal_entries:note": [{ id: "memo-1", entry_kind: "note" }, { id: "memo-2", entry_kind: "note" }],
    "journal_entries:daily_review": [{ id: "review-1", entry_kind: "daily_review", review_date: "2026-09-19" }],
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
  const report = await getWeeklyReport({ scope: "personal", now: NOW });

  assert.deepEqual(state.calls.map((call) => call.key), [
    "tasks",
    "tasks:focus",
    "crm_activities",
    "deals",
    "publish_logs",
    "journal_entries:note",
    "journal_entries:daily_review",
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

test("done tasks are counted by completed_at, never by updated_at", async () => {
  await getWeeklyReport({ scope: "personal", now: NOW });

  const taskCall = state.calls.find((call) => call.key === "tasks");
  const filterKeys = taskCall.options.filters.map(([key]) => key);
  assert.ok(filterKeys.includes("completed_at"), "완료 시각으로 창을 자른다");
  assert.ok(!filterKeys.includes("updated_at"), "옛 할 일의 제목 수정이 이번 주 완료로 잡히지 않는다");
});

test("contacts come from crm_activities contact kinds, not the dead outreach_outcomes table", async () => {
  const report = await getWeeklyReport({ scope: "personal", now: NOW });

  assert.ok(!state.calls.some((call) => call.table === "outreach_outcomes"));
  assert.equal(report.stats.contacts, 2, "call·kakao만 연락, note·deal은 제외");
});

test("personal stats carry focus, memo and review counts for the Action KPI card", async () => {
  const report = await getWeeklyReport({ scope: "personal", now: NOW });

  assert.equal(report.stats.doneTasks, 1);
  assert.equal(report.stats.focusPicked, 2);
  assert.equal(report.stats.focusDone, 1);
  assert.equal(report.stats.focusRate, 50);
  assert.equal(report.stats.focusDays, 2);
  assert.equal(report.stats.memos, 2);
  assert.equal(report.stats.reviewDays, 1);
});

test("company weekly report counts stage moves and does not read personal sources", async () => {
  const report = await getWeeklyReport({ scope: "company", now: NOW });

  assert.deepEqual(state.calls.map((call) => call.key), [
    "tasks",
    "crm_activities",
    "deals",
    "publish_logs",
  ]);
  assert.equal(report.stats.movedDeals, 1, "kind='deal' + meta.from/to 행만 이동 딜");
  assert.equal(report.stats.contacts, 2);
  assert.equal(report.scorecard, null);
});

test("campaign read failure is named as a partial personal report", async () => {
  state.rows.campaigns = null;

  const report = await getWeeklyReport({ scope: "personal", now: NOW });

  assert.equal(report.source, "supabase");
  assert.equal(report.partial, true);
  assert.deepEqual(report.failedSources, ["campaigns"]);
  assert.equal(report.scorecard, null);
});

test("summarizeFocusWindow treats a reopened task as not done and ignores out-of-window picks", () => {
  const summary = summarizeFocusWindow([
    { completed_at: null, meta: { focus_dates: ["2026-09-18", "2026-09-19"] } },
    { completed_at: "2026-09-19T05:00:00.000Z", meta: { focus_dates: ["2026-09-19"] } },
    { completed_at: "2026-09-10T05:00:00.000Z", meta: { focus_dates: ["2026-09-10"] } },
  ], { since: "2026-09-14T03:00:00.000Z", until: "2026-09-21T03:00:00.000Z" });

  assert.deepEqual(summary, { picked: 3, done: 1, days: 2, rate: 33 });
});

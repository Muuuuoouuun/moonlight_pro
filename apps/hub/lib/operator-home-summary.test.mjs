import assert from "node:assert/strict";
import { test } from "node:test";

let homeSummary = null;

try {
  homeSummary = await import("./operator-home-summary.js");
} catch {
  // First red run: the compact home summary contract does not exist yet.
}

test("operator home summary module exists", () => {
  assert.ok(homeSummary, "operator-home-summary.js must exist");
});

test("builds deterministic PMS and content summaries from live ledgers", () => {
  assert.deepEqual(
    homeSummary.buildOperatorHomeSummary({
      projects: {
        source: "supabase",
        projects: [
          { id: "p1", status: "Planning" },
          { id: "p2", status: "In progress" },
          { id: "p3", status: "Blocked" },
          { id: "p4", status: "Done" },
        ],
        todos: [
          { id: "t1", done: false, bucket: "오늘" },
          { id: "t2", done: false, bucket: "이번주" },
          { id: "t3", done: true, bucket: "오늘" },
        ],
      },
      content: {
        source: "supabase",
        items: [
          { id: "c1", status: "idea" },
          { id: "c2", status: "draft" },
          { id: "c3", status: "review" },
          { id: "c4", status: "scheduled" },
          { id: "c5", status: "published" },
        ],
        publishLogs: [{ id: "l1", status: "failed" }],
      },
    }),
    {
      state: "live",
      sources: { projects: "live", content: "live" },
      pms: {
        totalProjects: 4,
        activeProjects: 3,
        blockedProjects: 1,
        openTasks: 2,
        dueOrOverdueTasks: 1,
        completedTasks: 1,
        taskCompletionRate: 33,
        projectStatusSeries: [
          { key: "planning", label: "계획", value: 1 },
          { key: "active", label: "진행", value: 1 },
          { key: "review", label: "검토", value: 0 },
          { key: "blocked", label: "막힘", value: 1 },
          { key: "done", label: "완료", value: 1 },
          { key: "backlog", label: "보관", value: 0 },
        ],
        taskStatusSeries: [
          { key: "open", label: "열림", value: 2 },
          { key: "done", label: "완료", value: 1 },
        ],
      },
      content: {
        totalItems: 5,
        ideas: 1,
        inProduction: 2,
        scheduled: 1,
        published: 1,
        failed: 1,
        pipelineSeries: [
          { key: "idea", label: "아이디어", value: 1 },
          { key: "draft", label: "제작", value: 1 },
          { key: "review", label: "검토", value: 1 },
          { key: "scheduled", label: "대기", value: 1 },
          { key: "published", label: "발행", value: 1 },
        ],
      },
    },
  );
});

test("does not mix preview records into a partially live home summary", () => {
  const summary = homeSummary.buildOperatorHomeSummary({
    projects: {
      source: "preview",
      projects: [{ id: "fake-project", status: "Blocked" }],
      todos: [{ id: "fake-task", done: false, bucket: "오늘" }],
    },
    content: {
      source: "supabase",
      items: [{ id: "live-content", status: "idea" }],
      publishLogs: [],
    },
  });

  assert.equal(summary.state, "partial");
  assert.deepEqual(summary.sources, { projects: "preview", content: "live" });
  assert.equal(summary.pms, null);
  assert.equal(summary.content.ideas, 1);
});

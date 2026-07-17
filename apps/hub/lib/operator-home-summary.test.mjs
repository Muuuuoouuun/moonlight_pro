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

test("keeps core PMS counts from a partial project ledger while naming the partial source", () => {
  const summary = homeSummary.buildOperatorHomeSummary({
    projects: {
      source: "supabase",
      partial: true,
      failedSources: ["project_updates"],
      projects: [{ id: "project-1", status: "In progress" }],
      todos: [{ id: "task-1", done: false, bucket: "오늘" }],
    },
    content: { source: "supabase", items: [], publishLogs: [] },
  });

  assert.equal(summary.state, "partial");
  assert.equal(summary.sources.projects, "partial");
  assert.equal(summary.pms.activeProjects, 1);
  assert.equal(summary.pms.openTasks, 1);
});

test("keeps readable content counts from a partial content ledger", () => {
  const summary = homeSummary.buildOperatorHomeSummary({
    projects: { source: "supabase", projects: [], todos: [] },
    content: {
      source: "supabase",
      partial: true,
      failedSources: ["publish_logs"],
      items: [{ id: "content-1", status: "draft" }],
      publishLogs: [],
    },
  });

  assert.equal(summary.state, "partial");
  assert.equal(summary.sources.content, "partial");
  assert.notEqual(summary.content, null);
  assert.equal(summary.content.totalItems, 1);
  assert.equal(summary.content.inProduction, 1);
  assert.equal(summary.content.failed, null);
  assert.deepEqual(summary.content.pipelineSeries.find((item) => item.key === "draft"), {
    key: "draft",
    label: "제작",
    value: 1,
  });
});

test("withholds definitive task counts and rates when task aggregation is partial", () => {
  const summary = homeSummary.buildOperatorHomeSummary({
    projects: {
      source: "supabase",
      partial: true,
      partialSources: ["tasks"],
      failedSources: [],
      taskAggregation: { loaded: 2, total: 3, partial: true },
      projects: [{ id: "project-1", status: "In progress" }],
      todos: [
        { id: "task-1", done: false, bucket: "오늘" },
        { id: "task-2", done: true, bucket: "오늘" },
      ],
    },
    content: { source: "supabase", items: [], publishLogs: [] },
  });

  assert.equal(summary.sources.projects, "partial");
  assert.equal(summary.pms.totalProjects, 1);
  assert.equal(summary.pms.activeProjects, 1);
  assert.equal(summary.pms.openTasks, null);
  assert.equal(summary.pms.dueOrOverdueTasks, null);
  assert.equal(summary.pms.completedTasks, null);
  assert.equal(summary.pms.taskCompletionRate, null);
  assert.deepEqual(summary.pms.taskStatusSeries, [
    { key: "open", label: "열림", value: null },
    { key: "done", label: "완료", value: null },
  ]);
});

test("withholds definitive project counts when the bounded project slice is partial", () => {
  const summary = homeSummary.buildOperatorHomeSummary({
    projects: {
      source: "supabase",
      partial: true,
      partialSources: ["projects"],
      failedSources: [],
      taskAggregation: { loaded: 0, total: 0, partial: false },
      projects: [{ id: "project-1", status: "In progress" }],
      todos: [],
    },
    content: { source: "supabase", items: [], publishLogs: [] },
  });

  assert.equal(summary.sources.projects, "partial");
  assert.equal(summary.pms.totalProjects, null);
  assert.equal(summary.pms.activeProjects, null);
  assert.equal(summary.pms.blockedProjects, null);
  assert.equal(summary.pms.projectStatusSeries.every((item) => item.value === null), true);
  assert.equal(summary.pms.openTasks, 0);
});

test("keeps the combined home state partial when the other ledger is only preview", () => {
  const summary = homeSummary.buildOperatorHomeSummary({
    projects: {
      source: "supabase",
      partial: true,
      failedSources: ["notes"],
      projects: [{ id: "project-1", status: "Planning" }],
      todos: [],
    },
    content: { source: "preview", items: [], publishLogs: [] },
  });

  assert.equal(summary.state, "partial");
  assert.deepEqual(summary.sources, { projects: "partial", content: "preview" });
  assert.equal(summary.pms.totalProjects, 1);
  assert.equal(summary.content, null);
});

test("withholds PMS KPIs when the configured project ledger failed", () => {
  const summary = homeSummary.buildOperatorHomeSummary({
    projects: {
      source: "error",
      configured: true,
      error: "project-ledger-core-read-failed",
      projects: [],
      todos: [],
    },
    content: { source: "supabase", items: [], publishLogs: [] },
  });

  assert.equal(summary.state, "partial");
  assert.equal(summary.sources.projects, "error");
  assert.equal(summary.pms, null);
});

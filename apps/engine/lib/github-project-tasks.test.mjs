import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nextImportedThrough,
  planPullRequestTasks,
  prKey,
  pullRequestState,
  resolveProjectRepoTargets,
  syncProjectPullRequestTasks,
} from "./github-project-tasks.ts";

const WS = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-10-18T01:00:00.000Z";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "11111111-1111-4111-8111-111111111112";
const P3 = "11111111-1111-4111-8111-111111111113";
const PRODUCT = "22222222-2222-4222-8222-222222222222";

const pr = (number, overrides = {}) => ({
  number,
  title: `PR ${number}`,
  state: "open",
  draft: false,
  html_url: `https://github.com/Muuuuoouuun/moonlight_pro/pull/${number}`,
  updated_at: "2026-10-17T00:00:00Z",
  merged_at: null,
  closed_at: null,
  ...overrides,
});

const target = { repo: "Muuuuoouuun/moonlight_pro", key: "muuuuoouuun/moonlight_pro", projectId: P1, source: "project" };

test("a project's own repo link wins; a product repo goes to its only open project and is never guessed", () => {
  const projects = [
    { id: P1, status: "active", meta: { github: { repo: "Muuuuoouuun/22th_nomad" } } },
    { id: P2, status: "active", product_id: PRODUCT, meta: {} },
    { id: P3, status: "completed", product_id: PRODUCT, meta: { github: { repo: "Muuuuoouuun/edb_make" } } },
  ];
  const { targets, skipped } = resolveProjectRepoTargets(projects, [
    { full_name: "Muuuuoouuun/omr_maker", product_id: PRODUCT, status: "connected" },
    // 직접 연결과 같은 저장소(대소문자 무관)는 제품 경로로 다시 잡지 않는다.
    { full_name: "muuuuoouuun/22TH_NOMAD", product_id: PRODUCT, status: "connected" },
    { full_name: "Muuuuoouuun/landing_bigs", product_id: "99999999-9999-4999-8999-999999999999", status: "connected" },
    { full_name: "Muuuuoouuun/off", product_id: PRODUCT, status: "disabled" },
  ]);
  assert.deepEqual(targets, [
    { repo: "Muuuuoouuun/22th_nomad", key: "muuuuoouuun/22th_nomad", projectId: P1, source: "project" },
    { repo: "Muuuuoouuun/omr_maker", key: "muuuuoouuun/omr_maker", projectId: P2, source: "product" },
  ]);
  // 완료된 프로젝트의 연결은 쓰지 않고, 열린 프로젝트가 없는 제품 저장소는 이유와 함께 건너뛴다.
  assert.deepEqual(skipped, [{ repo: "Muuuuoouuun/landing_bigs", reason: "no-open-project" }]);
});

test("one repo linked by two projects, or a product with two open projects, is skipped instead of duplicated", () => {
  const linkedTwice = resolveProjectRepoTargets([
    { id: P1, status: "active", meta: { github: { repo: "a/b" } } },
    { id: P2, status: "blocked", meta: { github: { repo: "A/B" } } },
  ]);
  assert.deepEqual(linkedTwice.targets, []);
  assert.deepEqual(linkedTwice.skipped, [{ repo: "a/b", reason: "several-projects" }]);

  const productTwice = resolveProjectRepoTargets(
    [{ id: P1, status: "active", product_id: PRODUCT, meta: {} }, { id: P2, status: "draft", product_id: PRODUCT, meta: {} }],
    [{ full_name: "a/c", product_id: PRODUCT, status: "connected" }],
  );
  assert.deepEqual(productTwice.skipped, [{ repo: "a/c", reason: "several-projects" }]);
});

test("open PRs become tasks (draft → todo, ready → doing); merged or closed PRs are not imported as history", () => {
  const plan = planPullRequestTasks({
    target,
    pulls: [pr(38, { draft: true, title: "fix(desktop): Windows Office 동기화" }), pr(37), pr(36, { state: "closed", merged_at: "2026-10-14T10:00:00Z" }), pr(35, { state: "closed" })],
    now: NOW,
  });
  assert.deepEqual(plan.creates.map(({ number, status, title }) => ({ number, status, title })), [
    { number: 38, status: "todo", title: "fix(desktop): Windows Office 동기화" },
    { number: 37, status: "doing", title: "PR 37" },
  ]);
  assert.equal(plan.creates[0].githubPr.key, "muuuuoouuun/moonlight_pro#38");
  assert.equal(plan.creates[0].githubPr.state, "open");
  assert.equal(plan.creates[0].githubPr.draft, true);
  assert.deepEqual(plan.updates, []);
  assert.equal(pullRequestState(pr(1, { state: "closed", merged_at: "x" })), "merged");
  assert.equal(pullRequestState(pr(1, { state: "closed" })), "closed");
});

test("a merged PR only rewrites the task's github_pr meta — status stays with the operator, other meta survives", () => {
  const key = prKey(target.repo, 37);
  const existing = {
    id: "task-37",
    status: "doing",
    updated_at: "2026-10-17T00:00:00.123456+00:00",
    meta: { source: "github", checklist: [{ id: "c1", title: "리뷰", done: true }], github_pr: { key, state: "open", draft: false, title: "PR 37", url: pr(37).html_url, mergedAt: null, closedAt: null } },
  };
  const plan = planPullRequestTasks({
    target,
    pulls: [pr(37, { state: "closed", merged_at: "2026-10-18T00:30:00Z", closed_at: "2026-10-18T00:30:00Z" })],
    existingTasks: [existing],
    now: NOW,
  });
  assert.deepEqual(plan.creates, []);
  assert.equal(plan.updates.length, 1);
  const [update] = plan.updates;
  assert.equal(update.id, "task-37");
  assert.equal(update.updatedAt, existing.updated_at);
  assert.equal(update.meta.github_pr.state, "merged");
  assert.equal(update.meta.github_pr.mergedAt, "2026-10-18T00:30:00Z");
  assert.deepEqual(update.meta.checklist, existing.meta.checklist);
  assert.equal("status" in update, false);

  const unchanged = planPullRequestTasks({ target, pulls: [pr(37)], existingTasks: [existing], now: NOW });
  assert.deepEqual(unchanged.updates, [], "only syncedAt/updatedAt differ — no write");
});

test("the imported-through watermark keeps a deleted PR task from coming back", () => {
  const plan = planPullRequestTasks({ target, pulls: [pr(40), pr(38), pr(37)], importedThrough: 38, now: NOW });
  assert.deepEqual(plan.creates.map((create) => create.number), [40]);
  assert.equal(nextImportedThrough(null, [37, 38], false), 38);
  assert.equal(nextImportedThrough(38, [40], false), 40);
  assert.equal(nextImportedThrough(38, [37], false), 38);
  assert.equal(nextImportedThrough(38, [40], true), 38, "a failed create keeps the old watermark so it retries");
  assert.equal(nextImportedThrough(null, [], false), null);
});

function fakeDeps({ projects, tasks = [], pulls = { ok: true, status: 200, data: [] }, insertResult = { persisted: true }, updateResult = { persisted: true } }) {
  const calls = { fetch: [], insert: [], update: [] };
  let next = 0;
  return {
    calls,
    deps: {
      fetchRows: async (table, options) => {
        calls.fetch.push({ table, options });
        if (table === "projects") return projects;
        if (table === "tasks") return tasks;
        return [];
      },
      fetchPulls: async () => pulls,
      insert: async (table, record) => { calls.insert.push({ table, record }); return typeof insertResult === "function" ? insertResult(record) : insertResult; },
      update: async (table, filters, patch) => { calls.update.push({ table, filters, patch }); return typeof updateResult === "function" ? updateResult(table) : updateResult; },
      newId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++next).padStart(12, "0")}`,
      quotedIn: (values) => `in.(${values.map((value) => `"${value}"`).join(",")})`,
    },
  };
}

test("sync creates canonical task rows, rewrites changed PR meta under the read version, and raises the watermark", async () => {
  const project = { id: P1, status: "active", updated_at: "2026-10-17T09:00:00.5+00:00", meta: { org_scope: "personal", github: { repo: "Muuuuoouuun/moonlight_pro" } } };
  const existing = { id: "task-37", updated_at: "2026-10-17T01:00:00+00:00", meta: { source: "github", github_pr: { key: prKey(target.repo, 37), state: "open", draft: false, title: "PR 37", url: pr(37).html_url, mergedAt: null, closedAt: null } } };
  const { calls, deps } = fakeDeps({
    projects: [project],
    tasks: [existing],
    pulls: { ok: true, status: 200, data: [pr(38, { draft: true }), pr(37, { state: "closed", merged_at: "2026-10-18T00:00:00Z" })] },
  });

  const result = await syncProjectPullRequestTasks({ workspaceId: WS, now: NOW, deps });

  assert.equal(result.status, "synced");
  assert.deepEqual(result.repositories, [{ repo: target.repo, projectId: P1, source: "project", created: 1, updated: 1, failed: 0, status: "synced" }]);
  // 프로젝트는 닫힌 상태를 빼고 읽고, 할 일은 PR 키로만 찾는다.
  assert.deepEqual(calls.fetch[0].options.filters, [["workspace_id", `eq.${WS}`], ["status", "not.in.(completed,archived)"]]);
  // product_id를 이름으로 고르지 않는다 — 0049가 없는 DB에서도 직접 연결은 돌아야 한다.
  assert.equal(calls.fetch[0].options.select, "*");
  assert.deepEqual(calls.fetch[1].options.filters[1], ["meta->github_pr->>key", `in.("muuuuoouuun/moonlight_pro#38","muuuuoouuun/moonlight_pro#37")`]);

  const [{ table, record }] = calls.insert;
  assert.equal(table, "tasks");
  assert.equal(record.workspace_id, WS);
  assert.equal(record.project_id, P1);
  assert.equal(record.status, "todo");
  assert.equal(record.priority, "medium");
  assert.equal(record.completed_at, null);
  assert.equal(record.meta.source, "github");
  assert.equal(record.meta.github_pr.number, 38);

  const taskUpdate = calls.update.find((call) => call.table === "tasks");
  assert.deepEqual(taskUpdate.filters, [["id", "eq.task-37"], ["workspace_id", `eq.${WS}`], ["updated_at", `eq.${existing.updated_at}`]]);
  assert.equal(taskUpdate.patch.meta.github_pr.state, "merged");
  assert.equal("status" in taskUpdate.patch, false);

  const projectUpdate = calls.update.find((call) => call.table === "projects");
  assert.deepEqual(projectUpdate.filters, [["id", `eq.${P1}`], ["workspace_id", `eq.${WS}`], ["updated_at", `eq.${project.updated_at}`]]);
  assert.deepEqual(projectUpdate.patch.meta, { ...project.meta, github_imports: { "muuuuoouuun/moonlight_pro": 38 } });
});

test("a task changed meanwhile is retried next sync, not reported as a failure; a failed create holds the watermark", async () => {
  const project = { id: P1, status: "active", updated_at: "v1", meta: { github: { repo: target.repo }, github_imports: { "muuuuoouuun/moonlight_pro": 30 } } };
  const existing = { id: "task-31", updated_at: "t1", meta: { github_pr: { key: prKey(target.repo, 31), state: "open", draft: false, title: "PR 31", url: pr(31).html_url, mergedAt: null, closedAt: null } } };
  const { calls, deps } = fakeDeps({
    projects: [project],
    tasks: [existing],
    pulls: { ok: true, status: 200, data: [pr(32), pr(31, { title: "renamed" })] },
    insertResult: { persisted: false, reason: "http-error" },
    updateResult: { persisted: false, reason: "no-matching-row" },
  });
  const result = await syncProjectPullRequestTasks({ workspaceId: WS, now: NOW, deps });
  assert.equal(result.repositories[0].status, "error");
  assert.equal(result.repositories[0].failed, 1, "only the failed create counts");
  assert.equal(result.repositories[0].updated, 0);
  assert.equal(calls.update.some((call) => call.table === "projects"), false, "watermark stays at 30 so #32 retries");
});

test("a GitHub read failure is reported per repository; no linked repos means nothing to do", async () => {
  const failing = fakeDeps({
    projects: [{ id: P1, status: "active", updated_at: "v1", meta: { github: { repo: "Muuuuoouuun/22th_nomad" } } }],
    pulls: { ok: false, status: 404, data: null, error: "Not Found" },
  });
  const result = await syncProjectPullRequestTasks({ workspaceId: WS, now: NOW, deps: failing.deps });
  assert.equal(result.status, "error");
  assert.equal(result.repositories[0].error, "404 · Not Found");
  assert.equal(failing.calls.insert.length, 0);

  const empty = fakeDeps({ projects: [{ id: P1, status: "active", meta: {} }] });
  assert.deepEqual(await syncProjectPullRequestTasks({ workspaceId: WS, now: NOW, deps: empty.deps }), { status: "synced", repositories: [], skipped: [] });

  const unreadable = fakeDeps({ projects: null });
  assert.equal((await syncProjectPullRequestTasks({ workspaceId: WS, now: NOW, deps: unreadable.deps })).error, "project-read-failed");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { devSummary, orderDevRows, productDevRow, recentDevEvents, shortDay, shortTime, sinceLabel } from "./product-dev-summary.js";

const NOW = Date.parse("2026-10-21T03:00:00Z"); // 서울 10/21 12:00
const repo = (id, summary, extra = {}) => ({ id, fullName: `owner/${id}`, role: "app", status: "connected", summary, lastSyncedAt: "2026-10-21T01:42:00Z", ...extra });
const product = (id, opsStatus, repositories = [], signals = []) => ({ id, name: id, opsStatus, stage: "growth", repositories, signals });

test("a product without an active repository is not connected and carries no numbers", () => {
  assert.deepEqual(productDevRow(product("p", "live")), { connected: false, repositories: 0 });
  assert.equal(productDevRow(product("p", "live", [repo("old", {}, { status: "disabled" })])).connected, false);
});

test("several repositories: worst CI wins, counts add up, times take the latest", () => {
  const row = productDevRow(product("p", "live", [
    repo("web", { ci: { state: "success" }, openPullRequests: 2, reviewRequests: 1, openIssues: 5, lastPushAt: "2026-10-21T00:00:00Z", latestRelease: { tag: "v1.4", at: "2026-10-18T07:00:00Z" } }),
    repo("api", { ci: { state: "failure", failed: ["lint", "test"], url: "https://ci" }, openPullRequests: 1, openIssues: 2, blockedIssues: 1, lastPushAt: "2026-10-20T00:00:00Z", latestRelease: { tag: "v0.9", at: "2026-09-30T00:00:00Z" } }, { role: "api" }),
  ]));
  assert.equal(row.repoLabel, "web");
  assert.equal(row.extraRepositories, 1);
  assert.equal(row.ci.state, "failure");
  assert.deepEqual(row.ci.failed, ["lint", "test"]);
  assert.equal(row.ci.repository, "owner/api");
  assert.equal(row.openPullRequests, 3);
  assert.equal(row.reviewRequests, 1, "a repository that never reported review requests does not turn the sum unknown");
  assert.equal(row.openIssues, 7);
  assert.equal(row.lastPushAt, "2026-10-21T00:00:00Z");
  assert.equal(row.release.tag, "v1.4");
});

test("a repository that was never synced stays unknown instead of zero", () => {
  const row = productDevRow(product("p", "dev", [repo("fresh", {})]));
  assert.equal(row.connected, true);
  assert.equal(row.ci, null);
  assert.equal(row.openPullRequests, null);
  assert.equal(row.lastPushAt, null);
  const summary = devSummary([product("p", "dev", [repo("fresh", {})])]);
  assert.equal(summary.ci.unknown, 1);
  assert.equal(summary.openPullRequests, null);
});

test("the summary counts products, CI states and open work across connected products", () => {
  const products = [
    product("a", "live", [repo("a", { ci: { state: "failure" }, openPullRequests: 1, openIssues: 3 })]),
    product("b", "live", [repo("b", { ci: { state: "success" }, openPullRequests: 2, reviewRequests: 1, openIssues: 5, staleBugIssues: 1 })]),
    product("c", "dev", [repo("c", { ci: { state: "pending" }, openPullRequests: 1, openIssues: 7, blockedIssues: 1 })]),
    product("d", "dev"),
  ];
  const summary = devSummary(products);
  assert.equal(summary.products, 4);
  assert.equal(summary.connected, 3);
  assert.equal(summary.notConnected, 1);
  assert.deepEqual(summary.ci, { failure: 1, pending: 1, success: 1, none: 0, unknown: 0 });
  assert.equal(summary.openPullRequests, 4);
  assert.equal(summary.reviewRequests, 1);
  assert.equal(summary.openIssues, 15);
  assert.equal(summary.blockedIssues, 1);
  assert.equal(summary.lastSyncedAt, "2026-10-21T01:42:00Z");
});

test("rows put broken CI first, then blocked issues, then the rest, and unconnected products last", () => {
  const products = [
    product("quiet", "live"),
    product("fine", "live", [repo("fine", { ci: { state: "success" } })]),
    product("blocked", "dev", [repo("blocked", { ci: { state: "pending" }, blockedIssues: 2 })]),
    product("broken", "live", [repo("broken", { ci: { state: "failure" } })]),
    product("sync", "paused", [repo("sync", {}, { status: "error", lastError: "401 · Bad credentials" })]),
  ];
  assert.deepEqual(orderDevRows(products).map(({ product }) => product.id), ["broken", "sync", "blocked", "fine", "quiet"]);
  assert.equal(productDevRow(products[4]).syncError, "401 · Bad credentials");
});

test("recent activity keeps GitHub events from the last seven days, newest first, and marks only CI failure urgent", () => {
  const products = [
    product("a", "live", [], [
      { id: "1", eventType: "github.pr_merged", title: "PR 병합 · #41", happenedAt: "2026-10-21T00:12:00Z" },
      { id: "2", eventType: "github.ci_failed", title: "CI 실패 · owner/a", happenedAt: "2026-10-20T09:03:00Z" },
      { id: "3", eventType: "github.release", title: "릴리스 · v1.0", happenedAt: "2026-10-10T00:00:00Z" },
      { id: "4", eventType: "stage", title: "단계 변경", happenedAt: "2026-10-21T01:00:00Z" },
    ]),
    product("b", "dev", [], [{ id: "5", eventType: "github.pr_opened", title: "PR 열림 · #12", happenedAt: "2026-10-20T05:30:00Z" }]),
  ];
  const events = recentDevEvents(products, { now: NOW });
  assert.deepEqual(events.map((event) => event.id), ["1", "2", "5"]);
  assert.deepEqual(events.map((event) => event.urgent), [false, true, false]);
  assert.equal(events[2].productName, "b");
});

test("time labels follow the Seoul calendar", () => {
  assert.equal(sinceLabel("2026-10-21T02:59:40Z", NOW), "방금");
  assert.equal(sinceLabel("2026-10-21T02:20:00Z", NOW), "40분 전");
  assert.equal(sinceLabel("2026-10-21T00:00:00Z", NOW), "3시간 전");
  assert.equal(sinceLabel("2026-10-20T09:00:00Z", NOW), "어제");
  assert.equal(sinceLabel("2026-08-01T00:00:00Z", NOW), "81일 전");
  assert.equal(sinceLabel(null, NOW), null);
  assert.equal(shortDay("2026-10-18T16:00:00Z"), "10/19", "서울 날짜로 읽는다");
  assert.equal(shortTime("2026-10-21T00:12:00Z"), "10/21 09:12");
});

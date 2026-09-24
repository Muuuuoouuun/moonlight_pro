import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { ciTransitionUpdate, mapGitHubWebhookEvent, summarizeCheckRuns, verifyGitHubSignature } from "./github-signals.ts";
import { handleGitHubWebhook } from "./github-webhook.ts";

const SECRET = "whsec-test";
const WS = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-25T02:00:00.000Z";
const repo = { id: "33333333-3333-4333-8333-333333333333", product_id: PRODUCT, full_name: "owner/omr", default_branch: "main", last_summary: {} };

const sign = (body, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function deps({ repoRow = { ...repo, status: "connected" }, eventInsert = { persisted: true, reason: "ok" }, lookup } = {}) {
  const calls = { insert: [], update: [] };
  return {
    calls,
    deps: {
      fetchRows: async (table, options) => lookup ? lookup(table, options) : (repoRow ? [repoRow] : []),
      insert: async (table, record) => {
        calls.insert.push({ table, record });
        return table === "webhook_events" ? eventInsert : { persisted: true, reason: "ok" };
      },
      update: async (table, filters, patch) => { calls.update.push({ table, filters, patch }); return { persisted: true, reason: "ok", records: [{}] }; },
    },
  };
}

function input(event, payload, overrides = {}) {
  const rawBody = JSON.stringify(payload);
  return { secret: SECRET, workspaceId: WS, rawBody, now: NOW, headers: { signature: sign(rawBody), event, delivery: "delivery-1" }, ...overrides };
}

const failedRun = { action: "completed", repository: { full_name: "Owner/OMR" }, workflow_run: { head_branch: "main", conclusion: "failure", name: "test", html_url: "https://github.com/owner/omr/actions/runs/1", updated_at: NOW } };

test("signature check is constant-time HMAC and closed without a secret", () => {
  assert.equal(verifyGitHubSignature(SECRET, "{}", sign("{}")), true);
  assert.equal(verifyGitHubSignature(SECRET, "{}", sign("{}", "other")), false);
  assert.equal(verifyGitHubSignature(SECRET, "{}", null), false);
  assert.equal(verifyGitHubSignature("", "{}", sign("{}", "")), false);
});

test("bad signature writes nothing; missing secret closes with 503", async () => {
  const { deps: d, calls } = deps();
  const bad = await handleGitHubWebhook({ ...input("workflow_run", failedRun), headers: { signature: "sha256=00", event: "workflow_run", delivery: "d" } }, d);
  assert.equal(bad.httpStatus, 401);
  assert.equal(calls.insert.length, 0);
  const closed = await handleGitHubWebhook({ ...input("workflow_run", failedRun), secret: "" }, d);
  assert.equal(closed.httpStatus, 503);
});

test("default-branch CI failure becomes one blocked signal on the product and updates the repo summary", async () => {
  const { deps: d, calls } = deps();
  const result = await handleGitHubWebhook(input("workflow_run", failedRun), d);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.status, "processed");
  const [event, update] = calls.insert;
  assert.equal(event.table, "webhook_events");
  assert.equal(event.record.provider_event_id, "delivery-1");
  assert.equal(event.record.source, "github");
  assert.equal(update.table, "project_updates");
  assert.equal(update.record.product_id, PRODUCT);
  assert.equal(update.record.project_id, null);
  assert.equal(update.record.status, "blocked");
  assert.equal(update.record.event_type, "github.ci_failed");
  assert.equal(calls.update[0].patch.last_summary.ci.state, "failure");
});

test("a redelivered event is recorded once", async () => {
  const { deps: d, calls } = deps({ eventInsert: { persisted: false, reason: "duplicate" } });
  const result = await handleGitHubWebhook(input("workflow_run", failedRun), d);
  assert.equal(result.body.status, "duplicate");
  assert.equal(calls.insert.length, 1, "project_updates는 쓰지 않는다");
  assert.equal(calls.update.length, 0);
});

test("an unconnected repository is stored as ignored without guessing a product", async () => {
  const { deps: d, calls } = deps({ repoRow: null });
  const result = await handleGitHubWebhook(input("workflow_run", failedRun), d);
  assert.equal(result.body.status, "ignored");
  assert.equal(calls.insert.length, 1);
  assert.equal(calls.insert[0].record.status, "ignored");
  assert.deepEqual(calls.insert[0].record.payload, { repository: "owner/omr", action: "completed", matched: false, productId: null, ignored: "unconnected-repository" });
});

test("event mapping: non-default branches, PR review requests, bug labels, releases and pushes", () => {
  assert.deepEqual(mapGitHubWebhookEvent("workflow_run", { ...failedRun, workflow_run: { ...failedRun.workflow_run, head_branch: "feature" } }, repo, NOW), { ignored: "non-default-branch" });
  const review = mapGitHubWebhookEvent("pull_request", { action: "review_requested", pull_request: { number: 42, title: "채점 속도" } }, repo, NOW);
  assert.equal(review.update.event_type, "github.pr_review_requested");
  assert.equal(review.update.title, "리뷰 요청 · #42 채점 속도");
  assert.deepEqual(mapGitHubWebhookEvent("pull_request", { action: "opened", pull_request: { number: 1, draft: true } }, repo, NOW), { ignored: "pull-request-opened" });
  assert.equal(mapGitHubWebhookEvent("issues", { action: "opened", issue: { number: 3, labels: [{ name: "bug" }] } }, repo, NOW).update.event_type, "github.bug_opened");
  assert.deepEqual(mapGitHubWebhookEvent("issues", { action: "opened", issue: { labels: [{ name: "feature" }] } }, repo, NOW), { ignored: "issue-not-bug" });
  assert.equal(mapGitHubWebhookEvent("release", { action: "published", release: { tag_name: "v1.2.0" } }, repo, NOW).summaryPatch.latestRelease.tag, "v1.2.0");
  const push = mapGitHubWebhookEvent("push", { ref: "refs/heads/main", head_commit: { timestamp: NOW, message: "secret message" } }, repo, NOW);
  assert.deepEqual(push, { summaryPatch: { lastPushAt: NOW }, update: null }, "커밋 메시지는 저장하지 않는다");
});

test("CI success after a failure records recovery; repeated states record nothing", () => {
  const failing = { ...repo, last_summary: { ci: { state: "failure" } } };
  assert.equal(ciTransitionUpdate(failing, { state: "success", failed: [], url: null }).event_type, "github.ci_recovered");
  assert.equal(ciTransitionUpdate(failing, { state: "failure", failed: ["test"], url: null }), null);
  assert.equal(ciTransitionUpdate(repo, { state: "success", failed: [], url: null }), null);
  assert.equal(ciTransitionUpdate(repo, { state: "failure", failed: ["lint"], url: null }).status, "blocked");
  const recovered = mapGitHubWebhookEvent("workflow_run", { ...failedRun, workflow_run: { ...failedRun.workflow_run, conclusion: "success" } }, failing, NOW);
  assert.equal(recovered.update.event_type, "github.ci_recovered");
});

test("check runs summarize to failure > pending > success > none", () => {
  assert.equal(summarizeCheckRuns([]).state, "none");
  assert.equal(summarizeCheckRuns([{ status: "completed", conclusion: "success" }, { status: "in_progress" }]).state, "pending");
  const failed = summarizeCheckRuns([{ status: "completed", conclusion: "success" }, { status: "completed", conclusion: "timed_out", name: "e2e", html_url: "https://x" }]);
  assert.deepEqual(failed, { state: "failure", failed: ["e2e"], url: "https://x" });
  assert.equal(summarizeCheckRuns([{ status: "completed", conclusion: "skipped" }]).state, "success");
});

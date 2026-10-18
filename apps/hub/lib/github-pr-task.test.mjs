import assert from "node:assert/strict";
import { test } from "node:test";

import { githubPrStatus, readTaskGitHubPr } from "./github-pr-task.js";

const meta = (patch = {}) => ({
  meta: {
    github_pr: {
      key: "muuuuoouuun/moonlight_pro#38",
      repo: "Muuuuoouuun/moonlight_pro",
      number: 38,
      url: "https://github.com/Muuuuoouuun/moonlight_pro/pull/38",
      state: "open",
      draft: true,
      ...patch,
    },
  },
});

test("reads the PR a task came from, and only links real GitHub pull request URLs", () => {
  assert.deepEqual(readTaskGitHubPr(meta()), {
    repo: "Muuuuoouuun/moonlight_pro",
    number: 38,
    url: "https://github.com/Muuuuoouuun/moonlight_pro/pull/38",
    state: "open",
    draft: true,
  });
  assert.equal(readTaskGitHubPr(meta({ url: "javascript:alert(1)" })).url, null);
  assert.equal(readTaskGitHubPr(meta({ url: "https://evil.example/pull/38" })).url, null);
  // 모르는 상태는 열린 PR로 읽고, 병합된 PR은 초안일 수 없다.
  assert.equal(readTaskGitHubPr(meta({ state: "weird" })).state, "open");
  assert.equal(readTaskGitHubPr(meta({ state: "merged" })).draft, false);
  assert.equal(readTaskGitHubPr({ meta: {} }), null);
  assert.equal(readTaskGitHubPr(meta({ number: "38" })), null);
  assert.equal(readTaskGitHubPr(null), null);
});

test("merged or closed PRs offer a completion button until the operator completes the task — never automatically", () => {
  const merged = readTaskGitHubPr(meta({ state: "merged", draft: false }));
  assert.deepEqual(githubPrStatus(merged, false), { label: "GitHub에서 병합됨", lifecycle: "done", offerComplete: true });
  assert.equal(githubPrStatus(merged, true).offerComplete, false);
  const closed = readTaskGitHubPr(meta({ state: "closed", draft: false }));
  assert.deepEqual(githubPrStatus(closed, false), { label: "GitHub에서 닫힘", lifecycle: "cancelled", offerComplete: true });
  assert.deepEqual(githubPrStatus(readTaskGitHubPr(meta()), false), { label: "PR 초안", lifecycle: null, offerComplete: false });
  assert.equal(githubPrStatus(readTaskGitHubPr(meta({ draft: false })), false).label, "PR 열림");
  assert.equal(githubPrStatus(null), null);
});

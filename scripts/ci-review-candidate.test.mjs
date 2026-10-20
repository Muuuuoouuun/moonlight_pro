import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("Windows packaging is limited to the approved review pushes on the public repository", () => {
  const expression = workflow.match(/windows-desktop:\n\s+if: ([^\n]+)/)?.[1];
  assert.ok(expression);
  const eligible = new Function("github", `return (${expression});`);
  const event = (branch, eventName = "push", isPrivate = false) => ({
    event_name: eventName, ref: `refs/heads/${branch}`, event: { repository: { private: isPrivate } },
  });
  for (const branch of ["codex/office-connection-20261002", "codex/moonlight-r18-review-20261020"]) {
    assert.equal(eligible(event(branch)), true);
    assert.equal(eligible(event(branch, "pull_request")), false);
    assert.equal(eligible(event(branch, "push", true)), false);
  }
  for (const branch of ["main", "codex/unrelated", "codex/moonlight-r18-review-20261020-extra"]) {
    assert.equal(eligible(event(branch)), false);
  }
  assert.match(workflow, /npm --workspace @com-moon\/desktop run build -- --publish never/);
});

test("Mac stale-cookie audit is bounded and supplements the ordinary native contracts", () => {
  assert.match(workflow, /macos-pet:\n\s+runs-on: macos-26\n\s+timeout-minutes: 30/);
  assert.match(workflow, /^\s+\.\/script\/test_hub_transport\.sh$/m);
  assert.match(workflow, /name: Native stale-cookie and session-intent audit\n\s+timeout-minutes: 5\n\s+working-directory: prototypes\/moonlight-pet-macos\n\s+run: \.\/script\/test_hub_transport\.sh --audit-stale-cookie/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("Windows packaging is limited to release/review pushes and opted-in manual runs on the public repository", () => {
  const expression = workflow.match(/windows-desktop:\n\s+if: ([^\n]+)/)?.[1];
  assert.ok(expression);
  const evaluate = new Function("github", "startsWith", `return (${expression});`);
  const eligible = github => evaluate(github, (value, prefix) => value.startsWith(prefix));
  const event = (branch, eventName = "push", isPrivate = false, windowsDesktop = "false") => ({
    event_name: eventName, ref: `refs/heads/${branch}`,
    event: { repository: { private: isPrivate }, inputs: { windows_desktop: windowsDesktop } },
  });
  for (const branch of ["codex/office-connection-20261002", "codex/moonlight-r18-review-20261020", "codex/desktop-release-20261023", "codex/desktop-release-next"]) {
    assert.equal(eligible(event(branch)), true);
    assert.equal(eligible(event(branch, "pull_request")), false);
    assert.equal(eligible(event(branch, "push", true)), false);
  }
  for (const branch of ["main", "codex/unrelated", "codex/moonlight-r18-review-20261020-extra", "codex/desktop-release", "codex/unrelated-desktop-release-20261023"]) {
    assert.equal(eligible(event(branch)), false);
  }
  assert.equal(eligible(event("main", "workflow_dispatch", false, "true")), true);
  assert.equal(eligible(event("codex/unrelated", "workflow_dispatch", false, "true")), true);
  assert.equal(eligible(event("main", "workflow_dispatch")), false);
  const missingInput = event("main", "workflow_dispatch");
  missingInput.event.inputs = {};
  assert.equal(eligible(missingInput), false);
  assert.equal(eligible(event("main", "workflow_dispatch", true, "true")), false);
  assert.equal(eligible(event("codex/unrelated", "pull_request", false, "true")), false);
  assert.match(workflow, /workflow_dispatch:\n\s+inputs:\n\s+windows_desktop:\n(?:\s+[^\n]+\n)*?\s+type: boolean\n\s+default: false/);
  assert.match(workflow, /npm --workspace @com-moon\/desktop run build -- --publish never/);
  assert.match(workflow, /name: windows-desktop-\$\{\{ github.sha \}\}\n\s+retention-days: 7/);
});

test("Mac safety-blocked audit stays skipped without disabling ordinary native contracts", () => {
  assert.match(workflow, /macos-pet:\n\s+runs-on: macos-26\n\s+timeout-minutes: 30/);
  assert.match(workflow, /^\s+\.\/script\/test_hub_transport\.sh$/m);
  assert.match(workflow, /name: Native stale-cookie audit \(safety-blocked, not passed\)\n\s+if: \$\{\{ false \}\}\n\s+timeout-minutes: 5\n\s+working-directory: prototypes\/moonlight-pet-macos\n\s+run: \.\/script\/test_hub_transport\.sh --audit-stale-cookie/);
  assert.match(workflow, /unresolved stale-cookie defect at 34debac2/);
});

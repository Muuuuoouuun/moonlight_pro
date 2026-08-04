import assert from "node:assert/strict";
import { test } from "node:test";

let policy = null;

try {
  policy = await import("./enrich-eeocrm-policy.mjs");
} catch {
  // Red phase: apply currently permits public-evidence omission.
}

test("rejects an apply run that would erase public evidence inputs", () => {
  assert.ok(policy, "enrich-eeocrm-policy.mjs must exist");
  assert.throws(
    () => policy.assertEnrichmentApplyPolicy({ apply: true, evidencePath: null }),
    /--evidence is required with --apply/,
  );
});

test("allows evidence-free comparison dry-runs and evidence-backed apply runs", () => {
  assert.ok(policy, "enrich-eeocrm-policy.mjs must exist");
  assert.doesNotThrow(() => policy.assertEnrichmentApplyPolicy({ apply: false, evidencePath: null }));
  assert.doesNotThrow(() => policy.assertEnrichmentApplyPolicy({
    apply: true,
    evidencePath: "deliverables/junhyuk-eeocrm-public-evidence.json",
  }));
});

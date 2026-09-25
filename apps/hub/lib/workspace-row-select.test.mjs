import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { WORKSPACE_ROW_SELECT } from "./workspace-row-select.js";

// Every single-row `workspaces` read (id filter, limit 1) across these four call sites must ask
// for the exact same `select` so packages/supabase-rest's dedupedRead() (URL match) can coalesce
// them into one network call when more than one lands inside the same request (2026-09-25 db
// optimization). This is a source scan, not a network assertion — the actual network-level
// dedup is already covered by packages/supabase-rest/index.test.mjs:86; this test only pins that
// each call site imports and uses the shared constant instead of drifting back to its own
// literal `select` string.
const SITES = [
  { path: "apps/hub/lib/repositories/work-ledger.js", importPath: "@/lib/workspace-row-select" },
  { path: "apps/hub/lib/repositories/revenue-ledger.js", importPath: "@/lib/workspace-row-select" },
  { path: "apps/hub/lib/sales-os/contact-tracking.js", importPath: "../workspace-row-select.js" },
  { path: "apps/hub/lib/repositories/deadline-alert-settings.js", importPath: "@/lib/workspace-row-select" },
];

async function readSource(path) {
  return readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
}

test("WORKSPACE_ROW_SELECT is the shared select for single-row workspaces reads (id filter, limit 1)", () => {
  assert.equal(WORKSPACE_ROW_SELECT, "id,meta,timezone,updated_at");
});

for (const { path, importPath } of SITES) {
  test(`${path} imports WORKSPACE_ROW_SELECT and its workspaces read uses it (no literal select)`, async () => {
    const src = await readSource(path);

    // 1) Imports the shared constant from the expected specifier.
    const importRe = new RegExp(
      String.raw`import\s*\{\s*WORKSPACE_ROW_SELECT\s*\}\s*from\s*["']${importPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    );
    assert.match(src, importRe, `${path} should import WORKSPACE_ROW_SELECT from "${importPath}"`);

    // 2) Every fetchSupabaseRows(Detailed)("workspaces", { ... }) call site's `select` uses the
    // imported identifier, not a hardcoded string.
    const callRe = /fetchSupabaseRows(?:Detailed)?\(\s*["']workspaces["']\s*,\s*\{([\s\S]*?)\n\s*\}\)/g;
    let match;
    let workspacesCallCount = 0;
    while ((match = callRe.exec(src))) {
      workspacesCallCount += 1;
      const optionsBlock = match[1];
      assert.match(
        optionsBlock,
        /select:\s*WORKSPACE_ROW_SELECT\b/,
        `${path}: a "workspaces" read's options should set select: WORKSPACE_ROW_SELECT — got:\n${optionsBlock}`,
      );
      assert.doesNotMatch(
        optionsBlock,
        /select:\s*["']/,
        `${path}: a "workspaces" read must not use a hardcoded select string — got:\n${optionsBlock}`,
      );
    }
    assert.ok(workspacesCallCount >= 1, `${path} should contain at least one "workspaces" read`);
  });
}

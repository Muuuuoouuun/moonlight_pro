import assert from "node:assert/strict";
import { test } from "node:test";

let routing = null;

try {
  routing = await import("./content-studio-routing.js");
} catch {
  // Red phase: explicit new-draft routes do not yet bypass the active local draft.
}

test("restores an active local draft only for an unqualified Studio visit", () => {
  assert.ok(routing, "content-studio-routing.js must exist");
  assert.equal(
    routing.shouldRestoreActiveStudioDraft({ itemParam: null, newParam: null }),
    true,
  );
  assert.equal(
    routing.shouldRestoreActiveStudioDraft({ itemParam: "item-1", newParam: null }),
    false,
  );
  assert.equal(
    routing.shouldRestoreActiveStudioDraft({ itemParam: null, newParam: "draft" }),
    false,
  );
});

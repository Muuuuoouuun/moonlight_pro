import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearExpandedSegments,
  toggleExpandedSegment,
} from "./segments-state.mjs";

test("segments remain expanded independently", () => {
  let expanded = new Set();

  expanded = toggleExpandedSegment(expanded, "Contact");
  expanded = toggleExpandedSegment(expanded, "Customer");

  assert.deepEqual([...expanded], ["Contact", "Customer"]);
});

test("toggling an expanded segment closes only that segment", () => {
  const expanded = toggleExpandedSegment(
    new Set(["Contact", "Customer"]),
    "Contact",
  );

  assert.deepEqual([...expanded], ["Customer"]);
});

test("changing the dimension can collapse every segment", () => {
  assert.equal(clearExpandedSegments().size, 0);
});

test("Segments uses independent expansion state and non-stretching cards", () => {
  const source = readFileSync(new URL("./segments.jsx", import.meta.url), "utf8");

  assert.match(source, /toggleExpandedSegment/);
  assert.match(source, /expanded\.has\(seg\.label\)/);
  assert.match(source, /alignItems:\s*['"]start['"]/);
  assert.match(source, /overflowY:\s*['"]auto['"]/);
});

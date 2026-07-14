import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(
  new URL("../components/hub/hub-tokens.css", import.meta.url),
  "utf8",
);

test("mobile workspace sidebar hiding does not hide edit drawers", () => {
  assert.match(css, /\.hub-workspace-shell\s*>\s*aside:not\(\.hub-drawer\)/);
  assert.doesNotMatch(css, /\.hub-workspace-shell\s*>\s*aside\s*\{/);
});

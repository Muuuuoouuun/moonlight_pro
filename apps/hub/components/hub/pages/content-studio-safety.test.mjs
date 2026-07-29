import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const studioSource = await readFile(new URL("./content.jsx", import.meta.url), "utf8");
const paletteSource = await readFile(new URL("../hub-command-palette.jsx", import.meta.url), "utf8");

test("Studio preserves edits made while an autosave request is in flight", () => {
  assert.match(studioSource, /const editRevisionRef = React\.useRef\(0\)/);
  assert.match(studioSource, /const savedRevision = editRevisionRef\.current/);
  assert.match(studioSource, /editRevisionRef\.current === savedRevision/);
  assert.match(studioSource, /setSaveState\("dirty"\)/);
  assert.match(studioSource, /saveState === 'saving' \|\| saveState === 'error'/);
});

test("Studio keeps one carousel slide and blocks stale handoffs", () => {
  assert.match(studioSource, /if \(slides\.length <= 1\)/);
  assert.match(studioSource, /disabled=\{slides\.length <= 1\}/);
  assert.match(studioSource, /saved\?\.studioRevision !== editRevisionRef\.current/);
});

test("command palette keeps active-descendant options visible and out of the Tab order", () => {
  assert.match(paletteSource, /scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(paletteSource, /data-command-index=\{i\}/);
  assert.match(paletteSource, /tabIndex=\{-1\}/);
});

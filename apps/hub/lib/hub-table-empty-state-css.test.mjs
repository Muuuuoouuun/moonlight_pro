import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(
  new URL("../components/hub/hub-tokens.css", import.meta.url),
  "utf8",
);

test("mobile table width rules exclude next-action empty states", () => {
  for (const width of [720, 640]) {
    assert.match(
      css,
      new RegExp(
        `\\.hub-table-card\\s*>\\s*div:not\\(\\[class\\]\\):not\\(\\[data-empty=["']true["']\\]\\)\\s*\\{\\s*min-width:\\s*${width}px;`,
      ),
    );
    assert.doesNotMatch(
      css,
      new RegExp(
        `\\.hub-table-card\\s*>\\s*div:not\\(\\[class\\]\\)\\s*\\{\\s*min-width:\\s*${width}px;`,
      ),
    );
  }
});

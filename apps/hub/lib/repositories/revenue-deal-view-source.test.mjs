import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("./revenue-ledger.js", import.meta.url), "utf8");
const dealProjection = source.slice(
  source.indexOf("function mapDeal"),
  source.indexOf("function mapAccount"),
);

test("the deal read model preserves an explicit next action for action-first revenue views", () => {
  assert.match(
    dealProjection,
    /nextAction:\s*row\.next_action\s*\|\|\s*row\.meta\?\.next_action\s*\|\|\s*["']["']/,
  );
});

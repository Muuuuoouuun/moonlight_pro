import assert from "node:assert/strict";
import { test } from "node:test";

import { isBrandRow } from "./brand-ledger.js";

test("product containers live in brands but never appear in the Brand tab", () => {
  assert.equal(isBrandRow({ slug: "sinabro", meta: { category: "sns-channel" } }), true);
  assert.equal(isBrandRow({ slug: "ka", meta: { category: "ka-deal" } }), true);
  assert.equal(isBrandRow({ slug: "legacy", meta: {} }), true);
  assert.equal(isBrandRow({ slug: "no-meta" }), true);
  assert.equal(isBrandRow({ slug: "omr-maker", meta: { category: "product" } }), false);
});

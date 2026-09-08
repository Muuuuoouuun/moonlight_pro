import assert from "node:assert/strict";
import { test } from "node:test";
import { advisorRunResult } from "./advisor-result.js";

test("only a completed generation counts as a successful advisor run", () => {
  assert.equal(advisorRunResult(202, { status: "preview" }), "needs_human");
  assert.equal(advisorRunResult(200, { status: "preview" }), "needs_human");
  assert.equal(advisorRunResult(200, { status: "generated", text: "advice" }), "ok");
  assert.equal(advisorRunResult(200, { status: "error" }), "error");
  assert.equal(advisorRunResult(200, { status: "generated", text: "" }), "error");
  assert.equal(advisorRunResult(502, { status: "generated", text: "partial" }), "error");
});

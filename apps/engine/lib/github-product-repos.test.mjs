import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_PRODUCT_REPOSITORIES, mergeRepositoryConfigs, parseProductRepositories } from "./github-product-repos.ts";

const PRODUCT_A = "77777777-7777-4777-8777-777777777777";
const PRODUCT_B = "88888888-8888-4888-8888-888888888888";

test("parseProductRepositories keeps well-formed repos owned by a product id", () => {
  assert.deepEqual(parseProductRepositories(null), []);
  assert.deepEqual(parseProductRepositories({ fullName: "acme/app" }), []);
  assert.deepEqual(parseProductRepositories([
    { fullName: "https://github.com/acme/omr.git", productId: PRODUCT_A },
    { fullName: "acme/omr", productId: PRODUCT_B },
    { fullName: "no-slash", productId: PRODUCT_A },
    { fullName: "acme/word", productId: "not-a-uuid" },
    "junk",
  ]), [{ fullName: "acme/omr", productId: PRODUCT_A }], "a repo belongs to the first product that names it");
});

test("parseProductRepositories caps the list the Hub can hand over", () => {
  const many = Array.from({ length: MAX_PRODUCT_REPOSITORIES + 5 }, (_, i) => ({ fullName: `acme/r${i}`, productId: PRODUCT_A }));
  assert.equal(parseProductRepositories(many).length, MAX_PRODUCT_REPOSITORIES);
});

test("mergeRepositoryConfigs joins env repos with product repos without duplicating", () => {
  const projectMap = new Map([["acme/omr", "project-1"]]);
  const merged = mergeRepositoryConfigs(" acme/omr, acme/legacy ,bad", projectMap, [
    { fullName: "ACME/omr", productId: PRODUCT_A },
    { fullName: "acme/word", productId: PRODUCT_B },
  ]);
  assert.deepEqual(merged, [
    { fullName: "acme/omr", projectId: "project-1", productId: PRODUCT_A },
    { fullName: "acme/legacy", projectId: null, productId: null },
    { fullName: "acme/word", projectId: null, productId: PRODUCT_B },
  ]);
  assert.deepEqual(mergeRepositoryConfigs("", new Map(), []), []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { filterBrandDirectory } from "./brand-directory-view.js";

test("search combines words across criteria without reordering the source directory", () => {
  const records = [
    { key: "beta", name: "두 번째", promise: "기록을 연결", currentFocus: "글쓰기" },
    { key: "alpha", name: "첫 번째", description: "기록을 연결", keywords: ["글쓰기"] },
    { key: "gamma", name: "글쓰기", promise: "일상" },
  ];
  assert.deepEqual(filterBrandDirectory(records, { query: "  기록   글쓰기 " }).map(({ key }) => key), ["beta", "alpha"]);
  assert.equal(filterBrandDirectory(records, { query: "ALPHA" })[0], records[1]);
  assert.deepEqual(records.map(({ key }) => key), ["beta", "alpha", "gamma"]);
});

test("focus and operating filters use declared state and intersect with search", () => {
  const records = [
    { key: "empty", name: "기록", operatingState: "" },
    { key: "focused", name: "기록", isFocused: true, operatingState: "resting" },
    { key: "active", name: "작업", operatingState: "active" },
    { key: "experiment", name: "실험", operatingState: "experimenting" },
  ];
  assert.deepEqual(filterBrandDirectory(records, { filter: "resting" }).map(({ key }) => key), ["focused"]);
  assert.deepEqual(filterBrandDirectory(records, { filter: "focused", query: "기록" }).map(({ key }) => key), ["focused"]);
  assert.deepEqual(filterBrandDirectory(records, { filter: "focused", query: "작업" }), []);
  assert.deepEqual(filterBrandDirectory(records, { filter: "active" }).map(({ key }) => key), ["active"]);
  assert.deepEqual(filterBrandDirectory(records, { filter: "experimenting" }).map(({ key }) => key), ["experiment"]);
  assert.equal(filterBrandDirectory(records).length, records.length);
});

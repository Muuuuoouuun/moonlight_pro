import assert from "node:assert/strict";
import { test } from "node:test";

import { createLedgerCache } from "./module-ledger-cache.js";

test("a fresh entry is served and a stale one is treated as absent", () => {
  const cache = createLedgerCache(50);
  assert.equal(cache.read(), null);

  cache.write({ rows: [1, 2] });
  assert.deepEqual(cache.read(), { rows: [1, 2] });

  // 소비처가 더 좁은 신선도를 요구하면(팔레트 60초 등) 그 창을 따른다.
  assert.equal(cache.read(0), null);
});

test("clear removes the entry so the next read forces a live fetch", () => {
  const cache = createLedgerCache();
  cache.write({ rows: [1] });
  assert.notEqual(cache.read(), null);

  cache.clear();
  assert.equal(cache.read(), null);
});

test("caches are independent per surface", () => {
  const overview = createLedgerCache();
  const content = createLedgerCache();

  overview.write({ surface: "overview" });

  assert.deepEqual(overview.read(), { surface: "overview" });
  // 표면끼리 스냅샷이 새면 한 화면이 다른 화면의 원장을 사실로 렌더한다.
  assert.equal(content.read(), null);
});

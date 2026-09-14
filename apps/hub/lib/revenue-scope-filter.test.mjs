import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { resolveScopeFilter, scopeFilterForQuery } from "@/lib/revenue-scope-filter";

const revenueSource = await readFile(
  new URL("../components/hub/pages/revenue.jsx", import.meta.url),
  "utf8",
);

test("?scope=personal maps to the Personal toolbar filter, everything else to All", () => {
  assert.equal(scopeFilterForQuery("personal"), "personal");
  assert.equal(scopeFilterForQuery(null), "all");
  assert.equal(scopeFilterForQuery(undefined), "all");
  assert.equal(scopeFilterForQuery(""), "all");
  // ClassIn 스코프는 revenue 표면에 쿼리로 도착하지 않는다(별도 라우트) — 잘못 들어와도
  // 조용히 company로 좁히지 않고 전체를 보여준다.
  assert.equal(scopeFilterForQuery("classin"), "all");
});

test("the filter re-syncs when the scope query changes", () => {
  assert.equal(
    resolveScopeFilter({ previousQueryScope: null, queryScope: "personal", current: "all" }),
    "personal",
  );
  assert.equal(
    resolveScopeFilter({ previousQueryScope: "personal", queryScope: null, current: "personal" }),
    "all",
  );
});

test("a manual toolbar choice survives while the scope query is unchanged", () => {
  assert.equal(
    resolveScopeFilter({ previousQueryScope: "personal", queryScope: "personal", current: "company" }),
    "company",
  );
  assert.equal(
    resolveScopeFilter({ previousQueryScope: null, queryScope: null, current: "company" }),
    "company",
  );
  // 빈 문자열과 null은 같은 "쿼리 없음" 상태 — 재동기화로 선택을 날리지 않는다.
  assert.equal(
    resolveScopeFilter({ previousQueryScope: "", queryScope: null, current: "company" }),
    "company",
  );
});

test("Leads, Deals, and Accounts all subscribe to the scope query instead of reading it once", () => {
  assert.match(revenueSource, /import\s+\{[^}]*resolveScopeFilter[^}]*\}\s+from\s+["']@\/lib\/revenue-scope-filter["']/);
  // 마운트 1회 지연 초기화(window.location.search)는 스코프 전환에 반응하지 않았다.
  assert.doesNotMatch(revenueSource, /new URLSearchParams\(window\.location\.search\)\.get\(['"]scope['"]\)/);
  const hookUses = revenueSource.match(/useScopeFilter\(/g) || [];
  assert.equal(hookUses.length, 4, "정의 1 + Leads·Deals·Accounts 3개 호출");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const revenueSource = await readFile(
  new URL("../components/hub/pages/revenue.jsx", import.meta.url),
  "utf8",
);

test("RevenueOverview defines the live-ledger flag used by its empty state", () => {
  assert.match(
    revenueSource,
    /const\s+isLiveLedger\s*=\s*ledger\.source\s*===\s*['"]supabase['"]/,
  );
  assert.match(
    revenueSource,
    /description=\{isLiveLedger\s*\?\s*['"]Supabase deals 기록에 표시할 딜이 없습니다\./,
  );
});

// TopBar New·⌘K 생성 딥링크의 착지 계약(22차) — 각 표면이 ?new=<kind>를 1회 소비하고
// 쿼리를 소거한다. 소비가 없으면 셸의 New는 다시 팔레트 위장 버튼으로 퇴행한다.
test("revenue surfaces consume their ?new= create deep links exactly once", () => {
  for (const kind of ["lead", "deal", "case"]) {
    assert.match(
      revenueSource,
      new RegExp(`searchParams\\.get\\('new'\\) !== '${kind}'`),
      `?new=${kind} 소비 이펙트가 있어야 한다`,
    );
  }
  assert.match(revenueSource, /accountSearchParams\.get\('new'\) !== 'account'/);
  // 소비 후 쿼리 소거(새로고침 재실행 금지) — 각 이펙트가 replace로 정리한다.
  const consumeBlocks = revenueSource.match(/searchParams\.get\('new'\) !== '(?:lead|deal|case)'[\s\S]{0,420}?router\.replace\(pathname\)/g) || [];
  assert.equal(consumeBlocks.length, 3, "lead/deal/case 소비 이펙트가 전부 replace로 쿼리를 소거해야 한다");
});

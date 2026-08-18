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
  // 빈 상태는 readFailureEmpty(error 분기) 뒤의 기본값 객체로 옮겨졌다 —
  // isLiveLedger가 여전히 그 카피를 가르는지 확인한다.
  assert.match(
    revenueSource,
    /description:\s*isLiveLedger\s*\?\s*['"]Supabase deals 기록에 표시할 딜이 없습니다\./,
  );
  // 읽기 실패는 "딜이 없습니다"가 아니라 실패로 렌더돼야 한다.
  assert.match(
    revenueSource,
    /readFailureEmpty\(syncState, '딜', reloadLedger\)/,
  );
});

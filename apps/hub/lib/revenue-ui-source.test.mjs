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
    /description=\{isLiveLedger\s*\?\s*['"]Supabase deals 원장에 표시할 딜이 없습니다\./,
  );
});

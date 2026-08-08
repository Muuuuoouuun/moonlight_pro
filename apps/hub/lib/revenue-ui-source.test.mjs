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

// BulkBar 첫 실채택(25차) — 기준선 §2.8부터 미배선. x 다중 선택 → 하단 바 → 단계 일괄
// 변경(건별 영속 + 부분 실패 건수 명명 + 적용 후 선택 해제).
test("Leads wires the bulk bar with per-record persistence and named partial failure", () => {
  assert.match(revenueSource, /import \{ BulkBar \} from "\.\.\/crm-bulk-bar"/);
  assert.match(revenueSource, /onToggleSelect: selection\.toggleSelected/);
  assert.match(revenueSource, /<BulkBar count=\{selection\.selectedIds\.size\} onClear=\{selection\.clearSelected\}>/);
  const bulkBlock = revenueSource.match(/const applyBulkStage[\s\S]*?\n  \};/);
  assert.ok(bulkBlock, "applyBulkStage가 있어야 한다");
  assert.match(bulkBlock[0], /Promise\.all\(ids\.map\(\(id\) => saveRevenueRecord\('lead', 'update', \{ id, stage \}\)\)\)/);
  assert.match(bulkBlock[0], /건 실패/);
  assert.match(bulkBlock[0], /selection\.clearSelected\(\)/);
});

// 스테이지 변경 되돌리기(24차) — 최고 빈도 뮤테이션의 마지막 undo 공백. 지연 쓰기 계약:
// 창이 닫힌 뒤에만 PATCH, 되돌리기는 네트워크 없는 진짜 취소, 연속 이동은 최초 원위치 복원.
test("deal stage moves defer the PATCH behind a 3.5s undo window", () => {
  const moveBlock = revenueSource.match(/const pendingStageRef[\s\S]*?\n  \};/);
  assert.ok(moveBlock, "지연 쓰기 move 블록이 있어야 한다");
  assert.match(moveBlock[0], /scheduleUndoable\(key, \(\) => \{/);
  // PATCH는 예약 콜백 안에서만 — 즉시 실행 경로가 남으면 undo가 역연산이 돼버린다.
  const immediatePersist = moveBlock[0].split('scheduleUndoable')[0];
  assert.doesNotMatch(immediatePersist, /saveRevenueRecord/);
  assert.match(moveBlock[0], /const undoBase = pendingStageRef\.current\.get\(key\) \?\? prevStage;/);
  assert.match(moveBlock[0], /if \(cancelUndoable\(key\)\)/);
  // 창 종료 시 알림 소거(19차 수명 계약) + 실패 롤백 명명.
  assert.match(moveBlock[0], /setBoardNotice\(cur => \(cur\?\.key === key \? null : cur\)\)/);
  assert.match(moveBlock[0], /스테이지 이동 저장 실패/);
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

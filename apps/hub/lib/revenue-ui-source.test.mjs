import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

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
  // Find the actual move initializer; adjacent helpers are not its boundary.
  const parsed = ts.createSourceFile("revenue.jsx", revenueSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "Deals");
  let moveNode;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "move") moveNode = node.initializer;
    ts.forEachChild(node, visit);
  }
  assert.ok(component, "Deals must exist");
  visit(component);
  assert.ok(moveNode, "지연 쓰기 move 블록이 있어야 한다");
  const moveBlock = moveNode.getText(parsed);
  assert.match(moveBlock, /scheduleUndoable\(key, \(\) => \{/);
  // PATCH는 예약 콜백 안에서만 — 즉시 실행 경로가 남으면 undo가 역연산이 돼버린다.
  const immediatePersist = moveBlock.split('scheduleUndoable')[0];
  assert.doesNotMatch(immediatePersist, /saveRevenueRecord/);
  assert.match(moveBlock, /const undoBase = pendingStageRef\.current\.get\(key\) \?\? prevStage;/);
  assert.match(moveBlock, /if \(cancelUndoable\(key\)\)/);
  // 창 종료 시 알림 소거(19차 수명 계약) + 실패 롤백 명명.
  assert.match(moveBlock, /setBoardNotice\(cur => \(cur\?\.key === key \? null : cur\)\)/);
  assert.match(moveBlock, /스테이지 이동 저장 실패/);
});

// 딜 backlink 노출 — create_project가 이미 쓰고 있던 meta.origin_deal_id를 되읽는다.
// 생성 드로어에 딜 필드를 추가하는 방향(07-17 스펙이 뺀 것)으로 드리프트하지 않는지 함께 고정.
function sourceBlock(startMarker, endMarker) {
  const start = revenueSource.indexOf(startMarker);
  const end = revenueSource.indexOf(endMarker, start);
  assert.ok(start !== -1 && end > start, `${startMarker} 블록이 있어야 한다`);
  return revenueSource.slice(start, end);
}

test("deal drawer surfaces linked projects from the existing origin_deal_id backlink", () => {
  assert.match(revenueSource, /p\.originDealId === dealId/);
  assert.match(revenueSource, /<DealLinkedProjectsPanel deal=\{editingDeal\} onNavigate=\{onNavigate\} \/>/);
  // 읽기 실패를 0건으로 뭉개지 않는다 — 체크리스트와 같은 정직성 계약.
  const panel = sourceBlock("function DealLinkedProjectsPanel", "function DealNextMeetingPanel");
  assert.match(panel, /setLoadError\(/);
  assert.match(panel, /role="alert"/);
});

// 다음 미팅 — 캘린더 능력 판정은 공용 헬퍼 재사용, 실패는 항상 가시화,
// 그리고 결과를 deals에 병합하지 않는다(EditDrawer dirty 오탐 방지).
test("다음 미팅 잡기 reuses the shared calendar capability check and stays out of deal state", () => {
  assert.match(revenueSource, /import \{ resolveCalendarCapabilities \} from "@\/lib\/calendar-capabilities"/);
  const panel = sourceBlock("function DealNextMeetingPanel", "export function Deals");
  assert.match(panel, /resolveCalendarCapabilities\(/);
  assert.match(panel, /fetch\('\/api\/calendar\/google\/event'/);
  assert.match(panel, /saveRevenueRecord\('deal', 'update', \{ id: dealId, next_meeting: breadcrumb \}\)/);
  // 저장 성공 경로가 editingDeal의 JSON 모양을 바꾸면 닫을 때 미저장 경고가 오탐한다.
  assert.doesNotMatch(panel, /setDeals\(/);
  assert.doesNotMatch(panel, /setDealDrafts\(/);
  // 캘린더 생성 성공 + breadcrumb 저장 실패 시 캘린더에 재POST하지 않는다(중복 일정 방지).
  const retryStart = panel.indexOf("const saveBreadcrumb");
  const retry = panel.slice(retryStart, panel.indexOf("const createMeeting", retryStart));
  assert.ok(retryStart !== -1 && retry.length > 0, "saveBreadcrumb 재시도 경로가 있어야 한다");
  assert.doesNotMatch(retry, /\/api\/calendar\/google\/event/);
});

// TopBar New·⌘K 생성 딥링크의 착지 계약(22차) — 각 표면이 ?new=<kind>를 1회 소비하고
// 쿼리를 소거한다. 소비가 없으면 셸의 New는 다시 팔레트 위장 버튼으로 퇴행한다.
test("revenue surfaces consume their ?new= create deep links exactly once", () => {
  const parsed = ts.createSourceFile("revenue.jsx", revenueSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  for (const [componentName, kind] of [["Leads", "lead"], ["Deals", "deal"], ["Cases", "case"], ["Accounts", "account"]]) {
    const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === componentName);
    assert.ok(component);
    const paramsName = kind === "account" ? "accountSearchParams" : "searchParams";
    let consumer;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(parsed) === "React.useEffect"
        && node.arguments[0]?.getText(parsed).includes(`${paramsName}.get('new') !== '${kind}'`)) consumer = node.arguments[0];
      ts.forEachChild(node, visit);
    }
    visit(component); assert.ok(consumer, `?new=${kind} has an actual consumer effect`);
    for (const scope of [null, "personal", "classin"]) {
      let creates = 0, ledgerUnavailable = false;
      const replacements = [], ref = { current: false }, pathname = `/dashboard/revenue/${kind}s`;
      const base = new URLSearchParams(scope ? `scope=${scope}&view=stage` : "");
      const consume = params => new Function("searchParams", "accountSearchParams", "pathname", "accountPathname",
        "router", "accountRouter", "ledgerUnavailable", `created${kind[0].toUpperCase() + kind.slice(1)}FromQueryRef`,
        `create${kind[0].toUpperCase() + kind.slice(1)}`, `return (${consumer.getText(parsed)});`)(
          params, params, pathname, pathname,
          { replace: url => replacements.push(url) }, { replace: url => replacements.push(url) },
          ledgerUnavailable, ref, () => { creates++; },
        )();
      consume(base); assert.equal(creates, 0, "a plain visit does not create a row");
      const incoming = new URLSearchParams(base); incoming.set("new", kind);
      if (kind === "deal") {
        ledgerUnavailable = true; consume(incoming);
        assert.equal(creates, 0, "an unavailable ledger does not consume the creation request");
        ledgerUnavailable = false;
      }
      consume(incoming); consume(incoming);
      assert.equal(creates, 1, `${kind}: the same unconsumed query creates exactly once`);
      assert.equal(replacements.length, 1);
      const destination = new URL(replacements[0], "https://synthetic.invalid/");
      assert.equal(destination.pathname, pathname);
      assert.equal(destination.searchParams.has("new"), false, "refresh cannot replay creation");
      assert.equal(destination.searchParams.get("scope"), scope);
      assert.equal(destination.searchParams.get("view"), scope ? "stage" : null, "unrelated query context survives");
      consume(destination.searchParams); assert.equal(creates, 1, "the cleaned URL has no creation side effect");
      consume(incoming); consume(incoming);
      assert.equal(creates, 2, "a later explicit New request works again on the mounted page");
      assert.equal(replacements.length, 2);
    }
  }
});

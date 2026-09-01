import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const revenue = await readFile(new URL("./pages/revenue.jsx", import.meta.url), "utf8");
const primitives = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");

// 리드 표면에는 편집 폼만 있었고 접촉 이력은 고객 DB/팔로업으로 나가야 볼 수 있었다.
// Accounts DetailPanel과 같은 원장(crm_activities)을 리드 드로어 안에서 읽고 쓴다.
test("the lead drawer ships an activity panel wired to the crm_activities ledger", () => {
  assert.match(revenue, /function LeadActivityPanel\(\{ lead, onCountChange \}\)/);
  assert.match(revenue, /<LeadActivityPanel lead=\{editingLead\} onCountChange=\{setLeadActivityCount\} \/>/);
  assert.match(revenue, /label: '기록',/);
});

// 라이브 crm_activities는 회사 기준으로 쌓여 왔다(110행 중 company_id 109 · lead_id 1).
// 리드 id로만 조인하면 사실상 전 리드가 "기록 없음"으로 보인다 — Customer 360·팔로업과 같은 규칙.
test("lead activity reads join on the company first and fall back to the lead id", () => {
  const panel = revenue.slice(revenue.indexOf("function LeadActivityPanel"), revenue.indexOf("function DetailPanel"));
  assert.match(panel, /companyId\s*\?\s*`companyId=\$\{encodeURIComponent\(companyId\)\}`\s*:\s*`leadId=\$\{encodeURIComponent\(leadId\)\}`/);
  // 쓰기는 두 링크를 함께 남긴다 — 이후 회사 단위 조회에도 걸리도록.
  assert.match(panel, /saveRevenueRecord\('activity', 'create', \{\s*leadId,\s*\.\.\.\(companyId \? \{ companyId \} : \{\}\),/);
});

// 읽기 실패를 preview로 강등하면 "연락한 적 없음"으로 오독된다(§5.3 source truth).
test("a failed activity read stays an error instead of a proven empty state", () => {
  const panel = revenue.slice(revenue.indexOf("function LeadActivityPanel"), revenue.indexOf("function DetailPanel"));
  assert.match(panel, /if \(!r\.ok\) throw new Error\(`activity \$\{r\.status\}`\)/);
  assert.match(panel, /syncState === 'error' \? \(\s*<EmptyState[\s\S]*?title="활동 기록을 읽지 못했습니다"/);
  assert.match(panel, /<SyncBadge state=\{syncState\} \/>/);
  // 건수 배지는 읽기 전·실패에 0을 주장하지 않는다.
  assert.match(panel, /syncState === 'loading' \|\| syncState === 'error' \? null : activities\.length/);
});

// 저장 실패한 낙관 행을 남겨두면 다음 로드에 소리 없이 사라진다(무언 롤백 금지).
test("a failed activity write is named and the input is preserved", () => {
  const panel = revenue.slice(revenue.indexOf("function LeadActivityPanel"), revenue.indexOf("function DetailPanel"));
  assert.match(panel, /setActivities\(prev => prev\.filter\(a => a\.id !== tempId\)\)/);
  assert.match(panel, /message: r\.status === 'preview'/);
  // 삭제는 Accounts와 같은 지연-undo 계약.
  assert.match(panel, /scheduleUndoable\(key, \(\) => \{/);
  assert.match(panel, /<Button variant="ghost" size="xs" onClick=\{deleteNotice\.undo\}>되돌리기<\/Button>/);
});

// `panels`를 넘기지 않는 기존 call site(딜·케이스·프로젝트…)는 단일 폼 그대로여야 한다.
test("EditDrawer panels are opt-in and keep field focus on open", () => {
  assert.match(primitives, /export function EditDrawer\(\{[^}]*panels, infoLabel = '정보', children \}\)/s);
  assert.match(primitives, /const hasPanels = Array\.isArray\(panels\) && panels\.length > 0;/);
  assert.match(primitives, /\{!hasPanels \? fieldsPanel : \(/);
  assert.match(primitives, /initialFocusRef=\{hasPanels \? firstFieldRef : undefined\}/);
  assert.match(primitives, /setPanelKey\(FIELD_PANEL_KEY\);/);
});

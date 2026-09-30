import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./agents.jsx', import.meta.url), 'utf8');
const start = source.indexOf('export function AgentsOrders(');
const orders = source.slice(start);

test('work orders open on proposed and preserve the filter across code jobs navigation', () => {
  assert.match(orders, /search\.get\('status'\) \|\| 'proposed'/);
  assert.match(orders, /<SegmentedControl label="작업 지시 상태"/);
  assert.match(orders, /scope=proposals&status=/);
  assert.match(orders, /summary=1&scope=proposals/);
  assert.match(orders, /view=jobs&status=/);
});

test('work order controls are reversible and do not imply an unrecorded outcome', () => {
  assert.match(orders, /useUndoableAction\(\)/);
  assert.match(orders, /<Checkbox /);
  assert.match(orders, /<LifecycleBadge /);
  assert.match(orders, /제안 삭제/);
  assert.match(orders, /다시 열기/);
  assert.match(orders, /완료로 표시/);
  assert.doesNotMatch(orders, /<span>Personas<\/span>|리드로 등록|Studio 초안 생성|WO_EXECUTE_ACTIONS/);
});

test('the record drawer opened from a work order confirms only after the server acknowledges', () => {
  const drawer = orders.slice(orders.indexOf('<ContactRecordDrawer'));
  assert.ok(drawer.length > 0);
  // 폼은 서버가 답하기 전까지 "기록 중"·"저장 중"이라고만 말한다 — 확인은 onPersisted(saved 뒤)에서 띄운다.
  assert.match(drawer, /onPersisted=\{\(\) => toast\.success\(`기록됨 · \$\{recordTarget\.name \|\| '고객'\}`\)\}/);
  assert.match(orders, /const toast = useToast\(\);/);
  // 늦은 실패는 말하고, 드로어가 이미 닫혔으면 입력과 원인을 얹어 다시 연다(무언 소실 금지).
  assert.match(drawer, /onFailed=\{\(\{ message, form \}\) => \{[\s\S]*?toast\.error\(`기록하지 못했습니다 · [\s\S]*?setRecordTarget\(\(cur\) => cur \|\| \{ \.\.\.target, draft: form, error: message \}\);/);
  assert.match(drawer, /draft=\{recordTarget\.draft \|\| null\}\s*initialError=\{recordTarget\.error \|\| ''\}/);
  // 저장 전에 완료를 말하는 자리는 없다 — "기록됨"은 onPersisted 한 곳뿐이다.
  assert.equal((orders.match(/기록됨/g) || []).length, 1);
});

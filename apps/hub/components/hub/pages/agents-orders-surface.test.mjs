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

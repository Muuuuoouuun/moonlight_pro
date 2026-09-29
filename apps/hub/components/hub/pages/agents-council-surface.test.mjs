import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// 2026-09-26 운영자 지시: 브랜드 자문 화면(AgentsCouncil, dashboard/agents/council)에서
// 6월 Sales-OS 시절의 5인 로스터(order/sales/content/production/review, /api/hub/agents)
// 표시를 제거했다. 그 API 라우트·persona-chat·agents 테이블은 다른 소비자(MCP list_agents,
// 코칭·대화 딥링크)가 여전히 쓰므로 그대로 남아 있다 — 이 테스트는 화면(AgentsCouncil)이
// 그 데이터를 다시 불러오는 회귀만 고정한다.
const source = readFileSync(new URL('./agents.jsx', import.meta.url), 'utf8');
const start = source.indexOf('export function AgentsCouncil(');
const end = source.indexOf('function shortWhen(');
assert.ok(start > -1, 'AgentsCouncil export not found');
assert.ok(end > start, 'shortWhen boundary not found after AgentsCouncil');
const council = source.slice(start, end);

test('brand advisory screen no longer loads the 5-persona roster', () => {
  assert.doesNotMatch(source, /useAgentRoster/);
  assert.doesNotMatch(source, /\/api\/hub\/agents/);
  assert.doesNotMatch(council, /roster/i);
  assert.doesNotMatch(council, /페르소나 로스터/);
  assert.doesNotMatch(council, /dashboard\/agents\/chat\?agent=\$\{a\.id\}/);
});

test('brand advisory screen keeps the Council coach panel and its existing entry points', () => {
  assert.match(council, /<CouncilCoachPanel onNavigate={onNavigate} \/>/);
  assert.match(council, /자문 대화 열기/);
  assert.match(council, /dashboard\/agents\/chat\?prompt=council/);
  assert.match(council, /코드 작업 열기/);
  assert.match(council, /dashboard\/agents\/orders\?view=jobs/);
});

test('brand advisory screen does not add a replacement panel or button in the roster\'s place', () => {
  // 표면 예산(CLAUDE.md): 로스터가 빠진 자리에 새 Card 그리드·EmptyState를 다시 채우지 않는다.
  assert.doesNotMatch(council, /EmptyState/);
  assert.doesNotMatch(council, /hub-card-grid/);
});

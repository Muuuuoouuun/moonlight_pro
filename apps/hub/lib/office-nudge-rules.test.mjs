import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTaskOverload,
  detectDealStagnation,
  detectExpenseSpike,
  detectScopeCreep,
  detectHomeMorningBrief,
  resolveActiveOfficeNudge,
  NUDGE_PRIORITIES,
} from './office-nudge-rules.js';

test('detectTaskOverload triggers Eevee when 5+ overdue tasks exist', () => {
  const tasks = [
    { id: '1', title: 'Task 1', dueDate: '2026-09-10', completed: false },
    { id: '2', title: 'Task 2', dueDate: '2026-09-11', completed: false },
    { id: '3', title: 'Task 3', dueDate: '2026-09-12', completed: false },
    { id: '4', title: 'Task 4', dueDate: '2026-09-13', completed: false },
    { id: '5', title: 'Task 5', dueDate: '2026-09-14', completed: false },
  ];
  const nudge = detectTaskOverload({ tasks, today: '2026-09-20' });
  assert.ok(nudge);
  assert.equal(nudge.agentId, 'eevee');
  assert.equal(nudge.type, 'severe_overload');
  assert.equal(nudge.suggestedAction, 'cutoff_80');
  assert.equal(nudge.priority, NUDGE_PRIORITIES.severe_overload);
});

test('detectTaskOverload triggers Vaporeon when 3-4 overdue tasks exist', () => {
  const tasks = [
    { id: '1', title: 'Task 1', dueDate: '2026-09-10', completed: false },
    { id: '2', title: 'Task 2', dueDate: '2026-09-11', completed: false },
    { id: '3', title: 'Task 3', dueDate: '2026-09-12', completed: false },
    { id: '4', title: 'Task 4', dueDate: '2026-09-25', completed: false }, // future
  ];
  const nudge = detectTaskOverload({ tasks, today: '2026-09-20' });
  assert.ok(nudge);
  assert.equal(nudge.agentId, 'vaporeon');
  assert.equal(nudge.type, 'task_overdue');
  assert.equal(nudge.suggestedAction, 'cutoff_wbs');
});

test('detectTaskOverload triggers Vaporeon when today tasks > 7', () => {
  const tasks = Array.from({ length: 8 }, (_, i) => ({
    id: `t-${i}`,
    title: `Today Task ${i}`,
    dueDate: '2026-09-20',
    completed: false,
  }));
  const nudge = detectTaskOverload({ tasks, today: '2026-09-20' });
  assert.ok(nudge);
  assert.equal(nudge.agentId, 'vaporeon');
  assert.equal(nudge.type, 'task_too_many');
});

test('detectDealStagnation triggers Flareon for inactive active deals >= 5 days', () => {
  const deals = [
    { id: 'd1', name: '아카데미 연간 계약', stage: 'proposal', updatedAt: '2026-09-10', amount: 5000000 },
    { id: 'd2', name: '종료된 딜', stage: 'won', updatedAt: '2026-09-01', amount: 10000000 },
  ];
  const nudge = detectDealStagnation({ deals, today: '2026-09-20' });
  assert.ok(nudge);
  assert.equal(nudge.agentId, 'flareon');
  assert.equal(nudge.type, 'deal_stagnation');
  assert.equal(nudge.suggestedAction, 'followup_cta');
  assert.ok(nudge.message.includes('아카데미 연간 계약'));
});

test('detectExpenseSpike triggers Leafeon when budget ratio >= 85%', () => {
  const expenses = { spent: 860000, budget: 1000000 };
  const nudge = detectExpenseSpike({ expenses });
  assert.ok(nudge);
  assert.equal(nudge.agentId, 'leafeon');
  assert.equal(nudge.type, 'expense_spike');
  assert.equal(nudge.suggestedAction, 'expense_cap');
});

test('detectScopeCreep triggers Glaceon when todos >= 10 or DoD missing', () => {
  const project1 = { id: 'p1', title: '신규 기능', todos: new Array(11).fill({}) };
  const nudge1 = detectScopeCreep({ project: project1 });
  assert.ok(nudge1);
  assert.equal(nudge1.agentId, 'glaceon');
  assert.equal(nudge1.type, 'scope_creep');

  const project2 = { id: 'p2', title: '작은 기능', todos: [{}], definitionOfDone: '테스트 통과' };
  const nudge2 = detectScopeCreep({ project: project2 });
  assert.equal(nudge2, null);
});

test('detectHomeMorningBrief triggers Eevee when signals >= 4', () => {
  const signals = [
    { title: '신호 1' },
    { title: '신호 2' },
    { title: '신호 3' },
    { title: '신호 4' },
  ];
  const nudge = detectHomeMorningBrief({ signals });
  assert.ok(nudge);
  assert.equal(nudge.agentId, 'eevee');
  assert.equal(nudge.type, 'home_morning_brief');
});

test('resolveActiveOfficeNudge selects the highest priority candidate and respects suppression', () => {
  const tasks = [
    { id: '1', dueDate: '2026-09-10', completed: false },
    { id: '2', dueDate: '2026-09-11', completed: false },
    { id: '3', dueDate: '2026-09-12', completed: false },
  ];
  const deals = [
    { id: 'd1', name: '정체 딜', stage: 'proposal', updatedAt: '2026-09-10', amount: 5000000 },
  ];
  const expenses = { spent: 900000, budget: 1000000 };

  // Task Overdue (priority 90) > Deal Stagnation (70) > Expense Spike (60)
  const topNudge = resolveActiveOfficeNudge({
    surface: 'home',
    tasks,
    deals,
    expenses,
    today: '2026-09-20',
  });
  assert.ok(topNudge);
  assert.equal(topNudge.type, 'task_overdue');
  assert.equal(topNudge.agentId, 'vaporeon');

  // If task_overdue is snoozed, deal_stagnation should become active
  const suppressed = new Set(['nudge:task_overdue']);
  const secondNudge = resolveActiveOfficeNudge({
    surface: 'home',
    tasks,
    deals,
    expenses,
    today: '2026-09-20',
    suppressedKeys: suppressed,
  });
  assert.ok(secondNudge);
  assert.equal(secondNudge.type, 'deal_stagnation');
  assert.equal(secondNudge.agentId, 'flareon');
});

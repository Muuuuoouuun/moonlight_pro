import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { createOfficeBreakdownStore, runOfficeAuto } from './office-breakdown-session.js';
import { createOfficeSessionStore } from './office-session.js';
import { officeBreakdownResult, parseOfficeBreakdownProposal } from '@com-moon/agent-contracts/office-harness';

test('the retained discussion receives whether its surface is visible', () => {
  const page = readFileSync(new URL('./pages/office-council.jsx', import.meta.url), 'utf8');
  const source = page.slice(page.indexOf('export function OfficeCouncil('), page.indexOf('function OfficeCouncilDiscussion(')).replace('export ', '');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText;
  const Discussion = () => null;
  for (const surface of ['discussion', 'commander']) {
    let slot = 0;
    const hooks = { ...React, useState: () => [[surface, true, false][slot++], () => {}], useEffect: () => {} };
    const council = new Function('React', 'SegmentedControl', 'OfficeCommander', 'OfficeCouncilDiscussion', 'styles', 'useSearchParams', 'OfficeMeetingSessionProvider', 'OfficeMeetingRoom', `${code};return OfficeCouncil;`)(hooks, 'segmented', 'commander', Discussion, { shell: 'shell' }, () => new URLSearchParams(), 'provider', 'meeting-room');
    const tree = council({ scope: 'classin' });
    function find(node) {
      if (node?.type === Discussion) return node;
      return React.Children.toArray(node?.props?.children).map(find).find(Boolean);
    }
    assert.equal(find(tree)?.props.active, surface === 'discussion');
  }
});

test('leaving the discussion stops generation, restores its draft and leaves a late answer unmarked', async () => {
  const file = new URL('./office-auto-lifecycle.js', import.meta.url);
  const source = existsSync(file) ? readFileSync(file, 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '') : '';
  let previous, cleanup;
  const hooks = { useEffect(effect, deps) {
    if (previous && deps.every((value, index) => value === previous[index])) return;
    cleanup?.(); previous = deps; cleanup = effect();
  } };
  const lifecycle = new Function('React', `${source};return typeof useOfficeAutoLifecycle === 'function' ? useOfficeAutoLifecycle : null;`)(hooks);
  assert.equal(typeof lifecycle, 'function');
  const breakdowns = createOfficeBreakdownStore(), store = createOfficeSessionStore();
  const begun = breakdowns.begin('classin', '확인할 계산');
  const proposal = parseOfficeBreakdownProposal({ summary: '계산 확인', decisionNeeded: null, packets: [{ key: 'p1', kind: 'cost_compare', scope: 'classin', ask: '비용 확인', inputs: [], deliverable: '비교', doneWhen: '비교 작성', dependsOn: [], reviewerIds: [], exit: 'office' }], holds: [], questions: [] }, begun.request);
  breakdowns.resolve('classin', begun.readId, { ...officeBreakdownResult(proposal), businessWrites: false });
  breakdowns.apply('classin');
  store.update('classin', { draft: '보내지 않은 회사 메모' });
  store.update('personal', { draft: '다른 범위의 메모' });
  const controller = new AbortController(), abortRef = { current: controller };
  lifecycle({ active: true, scope: 'classin', store, breakdowns, abortRef });
  breakdowns.startAuto('classin', { savedDraft: store.get('classin').draft });
  let finish;
  const running = runOfficeAuto({ scope: 'classin', sessions: store, breakdowns, signal: controller.signal,
    newId: () => '10000000-0000-4000-8000-000000000001', request: () => new Promise(resolve => { finish = resolve; }) });
  assert.ok(store.get('classin').pending);
  lifecycle({ active: false, scope: 'classin', store, breakdowns, abortRef });
  assert.equal(controller.signal.aborted, true);
  assert.equal(breakdowns.get('classin').auto.reason, 'left');
  assert.equal(store.get('classin').draft, '보내지 않은 회사 메모');
  lifecycle({ active: true, scope: 'personal', store, breakdowns, abortRef });
  finish({ status: 'generated', answer: '늦게 도착한 계산', nextAction: '추가 행동 없음.' });
  await running;
  assert.deepEqual(breakdowns.get('classin').marks, {});
  assert.equal(store.get('classin').turns.length, 1);
  assert.equal(store.get('classin').draft, '보내지 않은 회사 메모');
  assert.equal(store.get('personal').draft, '다른 범위의 메모');
  assert.equal(store.get('personal').turns.length, 0);
  cleanup?.();
});

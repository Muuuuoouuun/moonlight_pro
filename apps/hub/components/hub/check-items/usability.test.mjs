import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { toCheckItem } from '../../../lib/check-items/catalog.js';
import { linkDecision, saveDecisionWithFollowup } from '../decision-actions.js';

// 확인할 것 사용성 다듬기(2026-09-30 스펙 §13): 카드 안에서 결정 남기기, 남은 목록에서 골라 보기,
// 오늘 → 홈 딥링크, 보류 되돌리기 토스트. 결정 저장은 결정 일지·막힘 풀기와 같은 한 경로다.
const { FocusCard, RemainingList, decisionSeedFor } = await import(new URL('./focus-card.jsx', import.meta.url).href);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const DEAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ids = { decisionId: '44444444-4444-4444-8444-444444444444', taskId: '55555555-5555-4555-8555-555555555555', decidedAt: '2026-10-08T01:00:00.000Z' };
const deal = toCheckItem({ id: `revenue-stale-${DEAL}`, title: '거래 A — 16일째 정체', tone: 'danger', source: { from: 'Deals', ref: DEAL }, subject: { type: 'deal', id: DEAL, name: '거래 A' } });
const group = toCheckItem({ id: 'leads', title: '새 리드 3건', subject: { type: 'lead-group', ids: ['l1', 'l2', 'l3'], name: '새 리드 3건' } });

function fakeFetch(responses = []) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift() || { status: 200, body: { status: 'saved' } };
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { impl, calls };
}

test('결정 + 그래서 할 일: 결정 → 할 일 순서, 할 일 실패는 결정이 남았다고 말하고 다시 하면 할 일만', async () => {
  const input = { title: '가격 A안', rationale: '', source: 'check-items', sourceRef: { type: 'deal', id: DEAL }, taskTitle: '견적 보내기', taskDueAt: '2026-10-10', signalKey: `revenue-stale:${DEAL}` };
  const ok = fakeFetch();
  const saved = await saveDecisionWithFollowup(ok.impl, input, { ids });
  assert.equal(saved.ok, true);
  assert.equal(saved.taskId, ids.taskId);
  assert.deepEqual(ok.calls.map((call) => `${call.method} ${call.url}`), ['POST /api/hub/decisions', 'POST /api/hub/tasks']);
  assert.deepEqual(ok.calls[0].body, { id: ids.decisionId, title: '가격 A안', rationale: null, projectId: null, decidedAt: ids.decidedAt, source: 'check-items', sourceRef: { type: 'deal', id: DEAL } });
  assert.equal(ok.calls[1].body.decisionId, ids.decisionId);
  assert.equal(ok.calls[1].body.signalKey, `revenue-stale:${DEAL}`);

  const draft = fakeFetch();
  await saveDecisionWithFollowup(draft.impl, { ...input, decidedAt: '', taskTitle: '' }, { ids });
  assert.equal(draft.calls.length, 1);
  assert.equal(draft.calls[0].body.decidedAt, '', '미정은 결정일 없이');

  const taskDown = fakeFetch([{ status: 200, body: { status: 'saved' } }, { status: 502, body: { status: 'error' } }]);
  const partial = await saveDecisionWithFollowup(taskDown.impl, input, { ids });
  assert.equal(partial.stage, 'task');
  assert.match(partial.message, /^결정은 남았습니다 · 할 일을 만들지 못했습니다/);
  const resumed = fakeFetch();
  await saveDecisionWithFollowup(resumed.impl, input, { ids, progress: partial.progress });
  assert.deepEqual(resumed.calls.map((call) => call.url), ['/api/hub/tasks']);

  const nothing = fakeFetch();
  assert.equal((await linkDecision(nothing.impl, ids.decisionId, {})).status, 'skipped');
  assert.equal(nothing.calls.length, 0);
});

test('카드의 결정으로 남기기는 카드 안에서 펼친다 — 대상 이름·출처를 채우고, 펼치면 확정 버튼이 유일한 primary', () => {
  assert.deepEqual(decisionSeedFor(deal), { title: '거래 A · ', projectId: null, sourceRef: { type: 'deal', id: DEAL } });
  assert.deepEqual(decisionSeedFor(toCheckItem({ id: 'p', title: 'C', subject: { type: 'project', id: PROJECT, name: 'C' } })).projectId, PROJECT);
  assert.equal(decisionSeedFor(group).sourceRef, null);

  const closed = renderToStaticMarkup(React.createElement(FocusCard, { item: deal, panel: null }));
  assert.match(closed, /aria-expanded="false"><kbd[^>]*>D<\/kbd> 결정으로 남기기/);
  assert.doesNotMatch(closed, /무엇을 정했나/);

  const open = renderToStaticMarkup(React.createElement(FocusCard, { item: deal, panel: 'decide' }));
  assert.match(open, /aria-label="결정으로 남기기"/);
  assert.match(open, /value="거래 A · "/);
  assert.match(open, /지금 확정/);
  assert.match(open, /그래서 할 일 \(선택\)/);
  assert.equal((open.match(/ci-outcome--primary/g) || []).length, 0);
  assert.equal((open.match(/fx-pill-btn--primary/g) || []).length, 1);
});

test('결정을 남기면 decision_logged 영수증, 할 일까지 만들었으면 task_created도 — 그 할 일이 열린 동안 카드는 숨는다', () => {
  const source = read('./focus-card.jsx');
  assert.match(source, /outcome: 'decision_logged', recordRef: \{ table: 'decisions', id: result\.decisionId \}/);
  assert.match(source, /if \(result\.taskId\) await postReceipt\(fetchImpl, item, \{ outcome: 'task_created', recordRef: \{ table: 'tasks', id: result\.taskId \} \}\)/);
});

test('남은 목록: 접힌 채로, 지금 카드는 표시만, 긴급은 글리프 + 이름, 상태는 글로', () => {
  const deck = [
    { ...deal },
    { ...group, returnedFromSnooze: { until: '2026-10-08' } },
    { ...toCheckItem({ id: 'c', title: '원고 D', subject: { type: 'content', id: 'c1', name: '원고 D' } }), scheduled: { state: 'now' } },
  ];
  const html = renderToStaticMarkup(React.createElement(RemainingList, { deck, currentKey: deck[0].signalKey }));
  assert.match(html, /^<details class="ci-remaining">/);
  assert.match(html, /남은 <span class="mono">3<\/span>건 한눈에 보기/);
  assert.match(html, /aria-current="true" disabled="">.*지금 보는 카드/);
  assert.match(html, /role="img" aria-label="긴급"/);
  assert.match(html, /보류했던 것/);
  assert.match(html, /잡아 둔 시간/);
  assert.equal(renderToStaticMarkup(React.createElement(RemainingList, { deck: [deal], currentKey: deal.signalKey })), '');
});

test('홈: 남은 목록에서 고르면 맨 앞으로, D로 결정, ?check= 딥링크는 한 번 열고 지운다, 보류는 토스트에서 되돌린다', () => {
  const home = read('../pages/home.jsx');
  const deckSource = read('./focus-card.jsx');
  assert.match(deckSource, /const focus = React\.useCallback\(\(key\) => \{\s*if \(!key\) return;\s*setPinned\(key\);/);
  assert.match(home, /<RemainingList deck=\{deck\} currentKey=\{activeKey\} onFocus=\{focus\} \/>/);
  assert.match(home, /e\.key === 'd' \|\| e\.key === 'D'/);
  assert.match(home, /params\.get\('check'\)/);
  assert.match(home, /window\.history\.replaceState/);
  assert.match(home, /그 카드는 이미 끝났거나 보류 중입니다/);
  assert.match(home, /result\.outcome === 'snoozed' && result\.receipt\?\.id/);
  assert.match(read('./focus-card.jsx'), /receiptMissing: !receipt\.ok, receipt: receipt\.receipt \}\)/);
});

test('오늘의 맨 위 카드는 홈과 같은 끝내기 1번 — 누르면 홈에서 그 카드의 입력이 열린다', () => {
  const brief = read('../pages/daily-brief.jsx');
  assert.match(brief, /`dashboard\/home\?check=\$\{encodeURIComponent\(s\.signalKey\)\}&do=1`/);
  assert.match(brief, /다른 방법으로 끝내기/);
  assert.match(brief, /\) : s\.decisions\.map\(/, '확인할 것 카드가 아닌 신호는 예전 이동 버튼 그대로');
});

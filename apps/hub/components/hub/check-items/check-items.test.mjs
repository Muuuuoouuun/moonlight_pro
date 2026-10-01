import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { toCheckItem } from '../../../lib/check-items/catalog.js';
import {
  createTaskForItem,
  postReceipt,
  receiptLine,
  snoozePresets,
  snoozeSubject,
  undoReceipt,
} from './check-item-actions.js';

const { CheckItemProgress, FinishedTodayList, FocusCard } = await import(new URL('./focus-card.jsx', import.meta.url).href);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const DEAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const deal = toCheckItem({ id: `revenue-stale-${DEAL}`, title: '거래 A — 16일째 정체', tone: 'danger', meta: 'Deal', source: { from: 'Deals', ref: DEAL }, subject: { type: 'deal', id: DEAL, name: '거래 A' } });
const project = toCheckItem({ id: `work-blocked-${PROJECT}`, title: '프로젝트 C blocked', tone: 'danger', source: { from: 'Projects', ref: PROJECT }, subject: { type: 'project', id: PROJECT, name: '프로젝트 C' } });

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift() || { status: 200, body: { status: 'saved' } };
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { impl, calls };
}

test('the card says what each row leaves behind and never calls navigation finishing', () => {
  const html = renderToStaticMarkup(React.createElement(FocusCard, { item: deal, nextItem: project, panel: null }));
  assert.match(html, /어떻게 끝낼까요/);
  assert.match(html, /남는 기록 · 고객 활동 1건, 다음 연락일/);
  assert.match(html, /보류 · 다시 볼 날/);
  assert.match(html, /건너뛰기 — 끝내지 않고 다음으로/);
  assert.match(html, /다음 · 프로젝트 C blocked/);
  assert.equal((html.match(/ci-outcome--primary/g) || []).length, 1, 'one primary per view');

  const content = toCheckItem({ id: 'content-x', title: '원고 D', subject: { type: 'content', id: 'item-1', name: '원고 D' } });
  const contentHtml = renderToStaticMarkup(React.createElement(FocusCard, { item: content, panel: null }));
  assert.match(contentHtml, /화면을 엽니다 · 대상이 바뀌면 빠집니다/);
});

test('an open input panel takes the primary from the first row (DESIGN.md §5.2)', () => {
  const html = renderToStaticMarkup(React.createElement(FocusCard, { item: deal, panel: 'snooze' }));
  assert.equal((html.match(/ci-outcome--primary/g) || []).length, 0);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /언제 다시 볼까요/);
  assert.match(html, /fx-pill-btn--primary/);
});

test('returned and still-flagged cards say so in words, not colour', () => {
  const html = renderToStaticMarkup(React.createElement(FocusCard, {
    item: { ...deal, returnedFromSnooze: { until: '2026-10-01' }, stillFlagged: true }, panel: null,
  }));
  assert.match(html, /보류했던 것 · 10월 1일 목에 다시/);
  assert.match(html, /오늘 기록은 남았지만 규칙이 여전히 이 항목을 잡아/);
});

test('progress counts finished, held and remaining separately and never celebrates', () => {
  const html = renderToStaticMarkup(React.createElement(CheckItemProgress, {
    finished: [{ outcome: 'contact_logged' }, { outcome: 'snoozed' }], remaining: 3,
  }));
  assert.match(html, /끝냄 <span class="mono">1<\/span>/);
  assert.match(html, /보류 <span class="mono">1<\/span>/);
  assert.match(html, /남음 <span class="mono">3<\/span>/);
  assert.equal((html.match(/data-state="now"/g) || []).length, 1);
  assert.doesNotMatch(html, /✦|completed/);
});

test('finished-today list offers undo only for snoozes and admits a read failure', () => {
  const receipts = [
    { id: 'r1', title: '거래 A', outcome: 'contact_logged', createdAt: '2026-10-01T01:05:00Z' },
    { id: 'r2', title: '원고 D', outcome: 'snoozed', snoozedUntil: '2026-10-05', createdAt: '2026-10-01T01:10:00Z' },
  ];
  const html = renderToStaticMarkup(React.createElement(FinishedTodayList, { receipts, onUndo: () => {} }));
  assert.equal((html.match(/되돌리기/g) || []).length, 1);
  assert.match(html, /보류 · 10월 5일 월에 다시/);
  const failed = renderToStaticMarkup(React.createElement(FinishedTodayList, { receipts: [], state: 'error' }));
  assert.match(failed, /읽지 못했습니다/);
});

test('receipts count only saved/duplicate; preview is not finished', async () => {
  const ok = fakeFetch([{ status: 200, body: { status: 'saved', receipt: { id: 'x' } } }]);
  const saved = await postReceipt(ok.impl, deal, { outcome: 'contact_logged', recordRef: { table: 'crm_activities' } });
  assert.equal(saved.ok, true);
  assert.equal(ok.calls[0].url, '/api/hub/signal-outcomes');
  assert.equal(ok.calls[0].body.signalKey, `revenue-stale:${DEAL}`);
  assert.deepEqual(ok.calls[0].body.subject, { type: 'deal', id: DEAL });

  const preview = fakeFetch([{ status: 202, body: { status: 'preview' } }]);
  const notSaved = await postReceipt(preview.impl, deal, { outcome: 'contact_logged' });
  assert.equal(notSaved.ok, false);
  assert.match(notSaved.message, /끝낸 것으로 세지 않았습니다/);
});

test('tasks hang off the deal or project and keep a client id so retries never duplicate', async () => {
  const dealFetch = fakeFetch([{ status: 200, body: { status: 'saved', task: { id: 'task-1' } } }]);
  const created = await createTaskForItem(dealFetch.impl, deal, { title: '거래 A 다음 연락', dueAt: '2026-10-01', taskId: 'fixed-id' });
  assert.equal(created.ok, true);
  assert.equal(dealFetch.calls[0].body.id, 'fixed-id');
  assert.equal(dealFetch.calls[0].body.dealId, DEAL);
  assert.equal(dealFetch.calls[0].body.source, 'check-items');

  const projectFetch = fakeFetch([{ status: 200, body: { status: 'duplicate', task: { id: 'task-2' } } }]);
  const again = await createTaskForItem(projectFetch.impl, project, { title: '막힌 점 풀기' });
  assert.equal(again.ok, true);
  assert.equal(projectFetch.calls[0].body.projectId, PROJECT);
});

test('CRM snoozes go to the subject (nudge store); others skip straight to the receipt', async () => {
  const crm = fakeFetch([]);
  assert.equal((await snoozeSubject(crm.impl, deal, { until: '2026-10-05' })).ok, true);
  assert.deepEqual(crm.calls[0].body, { subjectType: 'deal', subjectId: DEAL, action: 'snooze', until: '2026-10-05' });
  const other = fakeFetch([]);
  assert.equal((await snoozeSubject(other.impl, project, { until: '2026-10-05' })).status, 'skipped');
  assert.equal(other.calls.length, 0);

  const undo = fakeFetch([{ status: 200, body: { status: 'saved' } }, { status: 200, body: { status: 'saved' } }]);
  const result = await undoReceipt(undo.impl, { id: 'r2', outcome: 'snoozed', subject: { type: 'deal', id: DEAL } });
  assert.equal(result.ok, true);
  assert.equal(undo.calls[1].body.action, 'resume', 'undoing a CRM snooze also resumes the subject');
});

test('snooze presets are tomorrow, the day after and next Monday in Seoul time', () => {
  // 2026-10-01 10:20 KST is a Thursday.
  const presets = snoozePresets(Date.parse('2026-10-01T01:20:00Z'));
  assert.deepEqual(presets.map((p) => p.until), ['2026-10-02', '2026-10-03', '2026-10-05']);
  assert.equal(presets[2].label, '다음 주 월요일');
  assert.equal(receiptLine({ outcome: 'task_created' }), '할 일 1건을 만들었습니다');
});

test('Home drives the deck from the keyboard without firing inside fields or dialogs', () => {
  const home = read('../pages/home.jsx');
  assert.match(home, /useCheckItemDeck\(signals/);
  assert.match(home, /\/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(t\.tagName\)/);
  assert.match(home, /\[role="dialog"\]/);
  assert.match(home, /\/\^\[1-4\]\$\/\.test\(e\.key\)/);
  assert.match(home, /e\.key === 'j' \|\| e\.key === 'ArrowRight'/);
  assert.match(home, /outcome\.key === 'contact'[\s\S]*?setRecordTarget/);
  assert.match(home, /if \(!session \|\| session\.receipted\) return;/, 'one receipt per contact record');
  assert.doesNotMatch(home, /setResolved|fx-triage/);
});

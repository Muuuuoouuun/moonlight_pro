import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { normalizePmsCommand } from '../../../../engine/lib/pms-command.ts';
import {
  addOption, buildDecisionQueue, deferUntilKey, deskFilterOptions, deskFormFor, deskStats, outcomePreview, recentDecisions, removeOption,
} from '../../../lib/decision-desk.js';
import { decideDeskItem, deferDeskItems, saveDeskDraft } from '../decision-desk-actions.js';

// 결정 데스크(docs/superpowers/specs/2026-10-15-decision-desk-design.md) — 정할 것 큐의 갈래·순서,
// 정하기 저장 순서(결정 → 할 일 → 막힘 → 링크), 미정 저장과 한 번에 미루기, 패널의 한 primary.
const { DeskPanel, DecisionDesk, deskContext } = await import(new URL('./decision-desk.jsx', import.meta.url).href);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DRAFT = '66666666-6666-4666-8666-666666666666';
const ids = { decisionId: '44444444-4444-4444-8444-444444444444', taskId: '55555555-5555-4555-8555-555555555555', decidedAt: '2026-10-15T01:00:00.000Z' };
const NOW = Date.parse('2026-10-15T03:00:00.000Z'); // 목요일 KST 12:00

const blocked = (over = {}) => ({
  id: PROJECT, name: '프로젝트 C', dueAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000000+00:00',
  delivery: { blocker: '범위를 어디까지로 할지', blockerKind: 'decision', pausedAt: '2026-10-06T00:00:00.000Z', remainingHours: 12, availableHours: 8 },
  ...over,
});
const draft = (over = {}) => ({
  id: DRAFT, title: '가격 정책 — 연 결제 할인 여부', decidedAt: '', createdAt: '2026-10-03T00:00:00.000Z', rationale: '',
  question: '', options: [], chosenOptionId: null, deferUntil: null, source: 'manual', sourceRef: null, projectName: '', followups: [],
  ...over,
});
const options = [
  { id: 'a', title: '핵심 기능만 이번에', gain: '목표일 지킴', loss: '보고서는 다음 버전' },
  { id: 'b', title: '전체 범위', gain: '한 번에 끝', loss: '목표일 2주 밀림' },
];

test('정할 것 큐: 막힘(의사결정·미분류)이 먼저, 그 프로젝트의 초안은 합치고, 미뤄 둔 것과 다른 병목은 뺀다', () => {
  const queue = buildDecisionQueue({
    now: NOW,
    blockedProjects: [
      blocked(),
      blocked({ id: OTHER, name: '프로젝트 D', delivery: { blocker: '고객 회신', blockerKind: 'customer' } }),
    ],
    decisions: [
      draft(),
      draft({ id: 'linked', question: '범위를 어디까지로 할지', options, sourceRef: { type: 'project', id: PROJECT } }),
      draft({ id: 'later', deferUntil: '2026-10-20' }),
      draft({ id: 'back', title: '고객 B 재계약 조건', deferUntil: '2026-10-15', createdAt: '2026-10-13T00:00:00.000Z' }),
      draft({ id: 'done', decidedAt: '2026-10-14T00:00:00.000Z' }),
    ],
  });
  assert.deepEqual(queue.map((item) => item.key), [`project:${PROJECT}`, `decision:${DRAFT}`, 'decision:back']);
  assert.equal(queue[0].meta, '막힘 · 의사결정 · 9일');
  assert.equal(queue[0].draft.id, 'linked', '막힌 프로젝트에 걸린 초안은 한 줄로');
  assert.deepEqual(queue[0].options, options);
  assert.equal(queue[1].meta, '미정 · 12일째');
  assert.equal(queue[2].title, '고객 B 재계약 조건', '미룬 날이 오늘이면 다시 보인다');

  const unclassified = buildDecisionQueue({ now: NOW, blockedProjects: [blocked({ delivery: { blocker: '', blockerKind: '' } })] });
  assert.equal(unclassified[0].meta, '막힘', '분류 안 한 막힘도 정할 것');
  assert.equal(unclassified[0].question, '무엇을 정해야 다시 진행되나');
  assert.deepEqual(deskFilterOptions(queue).map((option) => [option.key, option.count]), [['all', 3], ['blocked', 1], ['draft', 2]]);
});

test('머리 줄: 이번 주(월요일부터) 정한 것, 남은 그래서 할 일, 가장 오래 미정 — 할 일을 못 읽었으면 모름', () => {
  const decisions = [
    draft({ id: 'w1', decidedAt: '2026-10-13T00:00:00.000Z', followups: [{ status: 'todo' }, { status: 'done' }] }),
    draft({ id: 'w2', decidedAt: '2026-10-15T00:00:00.000Z', followups: [{ status: 'in_progress' }] }),
    draft({ id: 'old', decidedAt: '2026-10-11T00:00:00.000Z', followups: [] }),
  ];
  const queue = buildDecisionQueue({ now: NOW, decisions: [draft()], blockedProjects: [blocked()] });
  assert.deepEqual(deskStats({ decisions, queue, now: NOW }), { decidedThisWeek: 2, openFollowups: 2, oldestDays: 12 });
  assert.equal(deskStats({ decisions: [draft({ decidedAt: '2026-10-14', followups: null })], queue: [], now: NOW }).openFollowups, null);
  assert.deepEqual(recentDecisions(decisions).map((decision) => decision.id), ['w2', 'w1', 'old']);
  assert.equal(deferUntilKey(NOW), '2026-10-22');
});

test('정하기 패널의 값: 초안을 이어 받고, 선택지는 5개까지, 뺀 선택지를 골랐으면 고르기도 빈다, 남기면 줄', () => {
  const [item] = buildDecisionQueue({ now: NOW, blockedProjects: [blocked()], decisions: [draft({ id: 'linked', options, chosenOptionId: 'a', rationale: '일정', sourceRef: { type: 'project', id: PROJECT } })] });
  const form = deskFormFor(item);
  assert.equal(form.chosenOptionId, 'a');
  assert.equal(form.rationale, '일정');
  assert.equal(deskFormFor({ kind: 'new' }).options.length, 2, '빈 칸 두 개로 시작');
  let grown = form;
  for (let i = 0; i < 5; i += 1) grown = addOption(grown);
  assert.equal(grown.options.length, 5);
  assert.equal(removeOption(form, 'a').chosenOptionId, null);
  assert.deepEqual(outcomePreview(item, { ...form, taskTitle: '견적 다시 보내기', taskDueAt: '2026-10-16' }), [
    '결정 1건 (확정 · 오늘) — A안', '할 일 1건 · 10-16까지', '프로젝트 C 다시 진행 · 막힘 이력 1줄', '고르지 않은 선택지 1개는 결정 옆에 남음',
  ]);
  assert.deepEqual(outcomePreview(item, { ...form, chosenOptionId: null }), [], '고르기 전엔 남길 것이 없다');
  assert.deepEqual(deskContext(item).map((cell) => [cell.label, cell.value]), [
    ['막힌 이유', '범위를 어디까지로 할지'], ['목표일', '2026-10-20'], ['남은 작업과 확보 시간', '남은 12시간 · 확보 8시간'],
  ]);
});

// 서버처럼 정규화된 기록을 돌려주는 가짜 — 저장 성공은 보낸 기록을 돌려줄 때만이다(check-write-ack).
function fakeServer({ decisions = {}, fail = {} } = {}) {
  const calls = [];
  const store = structuredClone(decisions);
  const impl = async (url, init) => {
    const body = JSON.parse(init.body || '{}');
    calls.push({ url, method: init.method, body });
    const reply = (status, data) => ({ ok: status < 300, status, json: async () => data });
    if (fail[`${init.method} ${url}`]) return reply(502, { status: 'error' });
    const ctx = { workspaceId: WORKSPACE, now: '2026-10-15T03:00:00.000Z' };
    if (url === '/api/hub/decisions' && init.method === 'POST') {
      const command = normalizePmsCommand({ ...body, action: 'create_decision' }, ctx);
      assert.equal(command.ok, true, command.reason);
      store[command.record.id] = command.record;
      return reply(200, { status: 'saved', decision: command.record });
    }
    if (url === '/api/hub/decisions' && init.method === 'PATCH') {
      const command = normalizePmsCommand({ ...body, action: 'update_decision' }, ctx);
      assert.equal(command.ok, true, command.reason);
      const current = store[body.id];
      const row = { ...current, ...command.patch, meta: { ...current.meta, ...command.patch.meta } };
      store[body.id] = row;
      return reply(200, { status: 'saved', decision: row });
    }
    if (url === '/api/hub/tasks') {
      const command = normalizePmsCommand({ ...body, action: 'create_task' }, ctx);
      assert.equal(command.ok, true, command.reason);
      return reply(200, { status: 'saved', task: command.record });
    }
    if (url === '/api/hub/projects') {
      return reply(200, { status: 'saved', project: { id: body.id, workspace_id: WORKSPACE, status: 'active', meta: { delivery: { blocker: '', nextVersion: body.delivery.nextVersion } } } });
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  return { impl, calls, store };
}

test('막힌 프로젝트를 정하면: 결정(선택지·고른 것·질문) → 할 일 → 막힌 점 비우기 → 링크, 고르지 않은 선택지도 남는다', async () => {
  const [item] = buildDecisionQueue({ now: NOW, blockedProjects: [blocked()] });
  const form = { ...deskFormFor(item), options, chosenOptionId: 'a', rationale: '목표일', taskTitle: '견적 다시 보내기', taskDueAt: '2026-10-16' };
  const server = fakeServer();
  const result = await decideDeskItem(server.impl, item, form, { ids });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.unblocked, true);
  assert.deepEqual(server.calls.map((call) => `${call.method} ${call.url}`), ['POST /api/hub/decisions', 'POST /api/hub/tasks', 'PATCH /api/hub/projects', 'PATCH /api/hub/decisions']);
  const saved = server.store[ids.decisionId];
  assert.equal(saved.title, '핵심 기능만 이번에');
  assert.equal(saved.project_id, PROJECT);
  assert.deepEqual(saved.meta, {
    source: 'project-unblock', sourceRef: { type: 'project', id: PROJECT }, question: '범위를 어디까지로 할지', options, chosenOptionId: 'a',
    nextTaskId: ids.taskId, unblockedProjectId: PROJECT,
  });
  assert.equal(server.calls[1].body.signalKey, `work-blocked:${PROJECT}`);
  assert.equal(server.calls[2].body.unblockResolution, 'decision');
  assert.equal(server.calls[2].body.decisionId, ids.decisionId);

  const keep = fakeServer();
  await decideDeskItem(keep.impl, item, { ...form, taskTitle: '', clearBlocker: false }, { ids });
  assert.deepEqual(keep.calls.map((call) => call.url), ['/api/hub/decisions'], '막힘을 두면 결정만');
});

test('미정 초안을 정하면 같은 초안을 확정한다 — 새 결정을 만들지 않고, 미룬 날은 비운다. 할 일이 실패하면 다시 눌러 할 일부터', async () => {
  const stored = normalizePmsCommand({ action: 'create_decision', id: DRAFT, title: '가격 정책', question: '가격 정책', options, deferUntil: '2026-10-15', decidedAt: '' }, { workspaceId: WORKSPACE }).record;
  const [item] = buildDecisionQueue({ now: NOW, decisions: [draft({ question: '가격 정책', options, deferUntil: '2026-10-15' })] });
  const form = { ...deskFormFor(item), chosenOptionId: 'b', taskTitle: '가격표 고치기' };
  const server = fakeServer({ decisions: { [DRAFT]: stored }, fail: { 'POST /api/hub/tasks': true } });
  const partial = await decideDeskItem(server.impl, item, form, { ids });
  assert.equal(partial.stage, 'task');
  assert.match(partial.message, /^결정은 남았습니다/);
  assert.equal(server.calls[0].method, 'PATCH');
  assert.equal(server.calls[0].body.id, DRAFT);
  assert.equal(server.store[DRAFT].meta.chosenOptionId, 'b');
  assert.equal(server.store[DRAFT].meta.deferUntil, null);
  assert.ok(server.store[DRAFT].decided_at, '확정');

  const resumed = fakeServer({ decisions: server.store });
  const done = await decideDeskItem(resumed.impl, item, form, { ids, progress: partial.progress });
  assert.equal(done.ok, true);
  assert.deepEqual(resumed.calls.map((call) => `${call.method} ${call.url}`), ['POST /api/hub/tasks', 'PATCH /api/hub/decisions']);
  assert.equal(resumed.calls[0].body.decisionId, DRAFT);

  assert.equal((await decideDeskItem(server.impl, item, { ...form, chosenOptionId: null })).message, '선택지 하나를 골라 주세요.');
});

test('아직 미정으로 저장·한 번에 미루기: 결정일 없이 질문과 선택지만, 초안 없는 막힘은 미룬 날을 단 초안을 새로 만든다', async () => {
  const fresh = { key: 'new:1', kind: 'new', question: '', options: [], draft: null, project: null };
  const server = fakeServer();
  assert.equal((await saveDeskDraft(server.impl, fresh, deskFormFor(fresh), { ids })).message, '무엇을 정하는지 적어 주세요.');
  const draftSaved = await saveDeskDraft(server.impl, fresh, { ...deskFormFor(fresh), question: '연 결제 할인을 줄까', options: [{ id: 'a', title: '준다', gain: '', loss: '' }, { id: 'b', title: '', gain: '', loss: '' }] }, { ids });
  assert.equal(draftSaved.ok, true, draftSaved.message);
  assert.equal(server.store[ids.decisionId].decided_at, null);
  assert.deepEqual(server.store[ids.decisionId].meta.options, [{ id: 'a', title: '준다', gain: '', loss: '' }], '빈 선택지는 빼고 남긴다');

  const queue = buildDecisionQueue({ now: NOW, blockedProjects: [blocked()], decisions: [draft()] });
  const stored = normalizePmsCommand({ action: 'create_decision', id: DRAFT, title: '가격 정책', decidedAt: '' }, { workspaceId: WORKSPACE }).record;
  const deferring = fakeServer({ decisions: { [DRAFT]: stored } });
  const result = await deferDeskItems(deferring.impl, queue, '2026-10-22', { idsFor: () => ({ ...ids, decisionId: '77777777-7777-4777-8777-777777777777' }) });
  assert.deepEqual(result, { deferred: [`project:${PROJECT}`, `decision:${DRAFT}`], failed: [] });
  assert.deepEqual(deferring.calls.map((call) => `${call.method} ${call.url}`), ['POST /api/hub/decisions', 'PATCH /api/hub/decisions']);
  assert.equal(deferring.store['77777777-7777-4777-8777-777777777777'].meta.deferUntil, '2026-10-22');
  assert.equal(deferring.store[DRAFT].meta.deferUntil, '2026-10-22');
  assert.equal(deferring.calls.some((call) => call.url === '/api/hub/projects'), false, '미뤄도 프로젝트의 막힘은 그대로');
});

test('정하기 패널: 선택지는 라디오, 고르면 primary가 그 선택지 이름으로 하나뿐, 막힘이면 막힌 점 비우기가 켜져 있다', () => {
  const [item] = buildDecisionQueue({ now: NOW, blockedProjects: [blocked()] });
  const open = renderToStaticMarkup(React.createElement(DeskPanel, { item, form: { ...deskFormFor(item), options, chosenOptionId: 'a' }, onForm: () => {} }));
  assert.match(open, /<legend>선택지 — 하나를 고르면 그게 결정이 됩니다<\/legend>/);
  assert.equal((open.match(/type="radio"/g) || []).length, 2);
  assert.match(open, /aria-label="A안 고르기"/);
  assert.match(open, /왜 A안인가/);
  assert.equal((open.match(/hub-btn--primary/g) || []).length, 1);
  assert.match(open, /A안으로 정하기/);
  assert.match(open, /aria-checked="true" aria-label="막힌 점 비우고 진행으로"/);
  assert.match(open, /남기면/);
  assert.match(open, /data-urgent="true">막힘 · 의사결정 · 9일/);

  const unchosen = renderToStaticMarkup(React.createElement(DeskPanel, { item, form: deskFormFor(item), onForm: () => {} }));
  assert.match(unchosen, /hub-btn--primary" disabled=""[^>]*>선택지를 고르면 정할 수 있습니다/);
  assert.doesNotMatch(unchosen, /남기면/);
});

test('데스크: 큐의 첫 줄이 고른 한 건(aria-current), 미룰 것 고르기 체크박스, 최근 결정과 단축키 줄', () => {
  const queue = buildDecisionQueue({ now: NOW, blockedProjects: [blocked()], decisions: [draft()] });
  const html = renderToStaticMarkup(React.createElement(DecisionDesk, {
    queue, decisions: [draft({ id: 'w1', title: '범위를 2단계로', decidedAt: '2026-10-14T00:00:00.000Z', followups: [{ status: 'todo' }] })],
  }));
  assert.match(html, /aria-current="true"[^>]*><span class="dd-item__meta" data-urgent="true">막힘/);
  assert.match(html, /aria-label="미룰 것으로 고르기: 프로젝트 C — 범위를 어디까지로 할지"/);
  assert.match(html, /aria-label="정하기 — 프로젝트 C — 범위를 어디까지로 할지"/);
  assert.match(html, /최근 결정/);
  assert.match(html, /일지 전체 →/);
  assert.match(html, /정할 것 이동/);
  const empty = renderToStaticMarkup(React.createElement(DecisionDesk, { queue: [], decisions: [], blockedReadable: false }));
  assert.match(empty, /정할 것이 없습니다/);
  assert.match(empty, /막힌 프로젝트를 읽지 못해 미정 결정만 보입니다/);
});

test('결정 일지: 데스크는 같은 게이트 뒤의 기본 보기, 일지 전체는 ?view=journal, 머리는 정할 것 N건', () => {
  const work = read('./work.jsx');
  assert.match(work, /const view = DECISION_JOURNAL && searchParams\.get\('view'\) !== 'journal' \? 'desk' : 'journal';/);
  assert.match(work, /options=\{\[\{ key: 'desk', label: '정하기' \}, \{ key: 'journal', label: '일지 전체' \}\]\}/);
  assert.match(work, /`정할 것 \$\{deskQueue\.length\}건`/);
  assert.match(work, /blockedReadable=\{Array\.isArray\(blockedProjects\)\}/);
});

import { normalizePmsCommand } from '../../../engine/lib/pms-command.ts';
import { buildSignalOutcomeWrite } from '../../lib/check-items/outcome-input.js';
import { receiptFromRow } from '../../lib/repositories/signal-outcomes.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { appendNextVersion, unblockProject } from './unblock-actions.js';
import { toCheckItem } from '../../lib/check-items/catalog.js';

// 막힘 풀기(확인할 것 스펙 §5.2·§5.3) — 세 갈래의 저장 순서, 부분 실패를 그대로 말하기, 재시도는 남은 단계만.
const { ProjectUnblockSection, UnblockPanel } = await import(new URL('./unblock-panel.jsx', import.meta.url).href);
const { FocusCard } = await import(new URL('./check-items/focus-card.jsx', import.meta.url).href);

const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ids = { decisionId: '44444444-4444-4444-8444-444444444444', taskId: '55555555-5555-4555-8555-555555555555', decidedAt: '2026-10-01T02:00:00.000Z' };
const delivery = { deliverable: '제안서', criteria: [], blocker: '대표 승인 대기', blockerKind: 'decision', pausedAt: '2026-09-22T00:00:00Z', nextVersion: '고급 보고서', nextAction: '대표에게 묻기', blockerHistory: [{ text: '자료 대기', kind: 'material', resolution: 'resolved', resolvedAt: '2026-09-10T00:00:00Z' }] };
const project = { id: PROJECT, name: '프로젝트 C', delivery, updatedAt: '2026-10-01T01:00:00.000000+00:00' };

function fakeFetch(responses = []) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift() || { status: 200, body: { status: 'saved' } };
    const body = JSON.parse(init.body || '{}');
    if (['saved', 'duplicate'].includes(next.body?.status)) {
      const workspaceId = '33333333-3333-4333-8333-333333333333';
      if (url === '/api/hub/tasks' || url === '/api/hub/decisions' && init.method === 'POST') {
        const action = url.endsWith('/tasks') ? 'create_task' : 'create_decision';
        const normalized = normalizePmsCommand({ ...body, action }, { workspaceId });
        assert.equal(normalized.ok, true);
        next.body = { ...next.body, [action === 'create_task' ? 'task' : 'decision']: normalized.record };
      } else if (url === '/api/hub/projects') next.body = { ...next.body, project: { id: body.id, workspace_id: workspaceId, status: 'active', meta: { delivery: body.delivery } } };
      else if (url === '/api/hub/decisions') next.body = { ...next.body, decision: { id: body.id, meta: { nextTaskId: body.nextTaskId, unblockedProjectId: body.unblockedProjectId } } };
      else if (url === '/api/hub/signal-outcomes' && init.method === 'POST') {
        const checked = buildSignalOutcomeWrite(body); assert.equal(checked.ok, true);
        next.body = { ...next.body, receipt: receiptFromRow({ ...checked.row, id: body.requestId, workspace_id: workspaceId }) };
      } else if (url === '/api/hub/signal-outcomes') next.body = { ...next.body, receipt: { id: body.id, outcome: body.action === 'move' ? 'scheduled' : 'snoozed', undoneAt: body.action === 'undo' ? '2026-10-01T03:00:00Z' : null, scheduledStart: body.scheduledStart, scheduledEnd: body.scheduledEnd } };
      else if (url === '/api/hub/crm-nudges') next.body = { ...next.body, id: body.subjectId, record: { id: body.subjectId, meta: { nudges: body.action === 'snooze' ? { snoozedUntil: body.until } : {} } } };
    }
    if (next.body?.status === 'updated') next.body = { ...next.body, event: { id: body.eventId, start: { dateTime: body.startAt }, end: { dateTime: body.endAt } } };
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { impl, calls };
}

test('이유가 풀렸어요: 막힌 점을 비우고 다시 진행 — 버전 가드·갈래·메모를 같이 보낸다', async () => {
  const { impl, calls } = fakeFetch();
  const result = await unblockProject(impl, project, { branch: 'resolved', note: '대표가 메일로 승인' }, { ids });
  assert.equal(result.ok, true);
  assert.equal(result.unblocked, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/hub/projects');
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].body.expectedUpdatedAt, project.updatedAt);
  assert.equal(calls[0].body.delivery.blocker, '');
  assert.equal(calls[0].body.delivery.nextAction, '대표에게 묻기');
  assert.equal('blockerHistory' in calls[0].body.delivery, false, '이력은 서버만 쓴다');
  assert.equal(calls[0].body.deliveryEvent, 'resume');
  assert.equal(calls[0].body.unblockResolution, 'resolved');
  assert.equal(calls[0].body.unblockNote, '대표가 메일로 승인');
});

test('다음 버전으로: 뺄 것을 기존 범위 뒤에 덧붙인다, 빈 입력은 저장하지 않는다', async () => {
  assert.equal(appendNextVersion('고급 보고서', 'PDF 내보내기'), '고급 보고서\nPDF 내보내기');
  assert.equal(appendNextVersion('', ' PDF '), 'PDF');
  const empty = fakeFetch();
  assert.equal((await unblockProject(empty.impl, project, { branch: 'next-version', nextVersionText: ' ' }, { ids })).stage, 'input');
  assert.equal(empty.calls.length, 0);
  const { impl, calls } = fakeFetch();
  await unblockProject(impl, project, { branch: 'next-version', nextVersionText: 'PDF 내보내기' }, { ids });
  assert.equal(calls[0].body.delivery.nextVersion, '고급 보고서\nPDF 내보내기');
  assert.equal(calls[0].body.unblockResolution, 'next-version');
});

test('결정으로 풀기: 결정 → 할 일 → 막힘 풀기 → 결정 링크 순서', async () => {
  const { impl, calls } = fakeFetch();
  const result = await unblockProject(impl, project, {
    branch: 'decision',
    decision: { title: 'A안으로 간다', rationale: '일정 안', taskTitle: 'A안 견적 보내기', taskDueAt: '2026-10-03', clearBlocker: true },
  }, { ids, signalKey: `work-blocked:${PROJECT}` });
  assert.equal(result.ok, true);
  assert.equal(result.unblocked, true);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), ['POST /api/hub/decisions', 'POST /api/hub/tasks', 'PATCH /api/hub/projects', 'PATCH /api/hub/decisions']);
  assert.deepEqual(calls[0].body, { id: ids.decisionId, title: 'A안으로 간다', rationale: '일정 안', projectId: PROJECT, decidedAt: ids.decidedAt, source: 'project-unblock', sourceRef: { type: 'project', id: PROJECT } });
  assert.equal(calls[1].body.id, ids.taskId);
  assert.equal(calls[1].body.decisionId, ids.decisionId);
  assert.equal(calls[1].body.signalKey, `work-blocked:${PROJECT}`);
  assert.equal(calls[1].body.dueAt, '2026-10-03');
  assert.equal(calls[2].body.unblockResolution, 'decision');
  assert.equal(calls[2].body.decisionId, ids.decisionId);
  assert.deepEqual(calls[3].body, { id: ids.decisionId, nextTaskId: ids.taskId, unblockedProjectId: PROJECT });
});

test('결정으로 풀기의 부분 실패는 남은 것을 말하고, 다시 누르면 남은 단계만 한다', async () => {
  const input = { branch: 'decision', decision: { title: 'A안', taskTitle: '견적 보내기', clearBlocker: true } };

  const nothing = fakeFetch([{ status: 502, body: { status: 'error' } }]);
  const failed = await unblockProject(nothing.impl, project, input, { ids });
  assert.equal(failed.stage, 'decision');
  assert.match(failed.message, /저장 응답을 확인하지 못했습니다/);
  assert.equal(nothing.calls.length, 1);

  const taskDown = fakeFetch([{ status: 200, body: { status: 'saved' } }, { status: 502, body: { status: 'error' } }]);
  const partial = await unblockProject(taskDown.impl, project, input, { ids });
  assert.equal(partial.stage, 'task');
  assert.match(partial.message, /^결정은 남았습니다 · 할 일을 만들지 못했습니다/);
  assert.equal(partial.progress.decision, true);

  const resumed = fakeFetch([{ status: 200, body: { status: 'saved' } }, { status: 409, body: { status: 'conflict' } }]);
  const conflict = await unblockProject(resumed.impl, project, input, { ids, progress: partial.progress });
  assert.equal(resumed.calls[0].url, '/api/hub/tasks', '결정은 다시 쓰지 않는다');
  assert.equal(conflict.conflict, true);
  assert.match(conflict.message, /결정은 남았습니다 · 막힘은 아직 풀리지 않았습니다 — 프로젝트가 다른 곳에서 먼저 바뀌었습니다/);

  const onlyDecision = fakeFetch();
  const kept = await unblockProject(onlyDecision.impl, project, { branch: 'decision', decision: { title: 'A안', clearBlocker: false } }, { ids });
  assert.equal(kept.ok, true);
  assert.equal(kept.unblocked, false);
  assert.deepEqual(onlyDecision.calls.map((call) => call.url), ['/api/hub/decisions'], '막힘을 건드리지 않으면 링크도 붙일 것이 없다');
});

test('패널: 병목이 의사결정이면 결정으로 풀기를 앞에 두고 권장이라 말한다 — 이력은 글로', () => {
  const html = renderToStaticMarkup(React.createElement(UnblockPanel, { project }));
  assert.match(html, /data-lifecycle="blocked"/);
  assert.match(html, /의사결정 · \d+일째/);
  assert.match(html, /병목에 맞춘 권장 · 결정으로 풀기/);
  assert.ok(html.indexOf('결정으로 풀기</button>') < html.indexOf('이유가 풀렸어요</button>'));
  assert.match(html, /무엇을 정했나/);
  assert.match(html, /막힌 점 비우고 진행으로/);
  assert.match(html, /막힘 이력 · 1/);
  assert.match(html, /이유가 풀림 · 자료 부족/);

  const plain = renderToStaticMarkup(React.createElement(UnblockPanel, { project: { ...project, delivery: { ...delivery, blockerKind: 'customer' } } }));
  assert.doesNotMatch(plain, /병목에 맞춘 권장/);
  assert.ok(plain.indexOf('이유가 풀렸어요</button>') < plain.indexOf('결정으로 풀기</button>'));
  assert.match(plain, /한 줄 메모/);
});

test('프로젝트 상세: 막힌 점이 있을 때만 자리를 두고, 누르기 전에는 아무것도 펼치지 않는다', () => {
  assert.equal(renderToStaticMarkup(React.createElement(ProjectUnblockSection, { project: { ...project, delivery: { ...delivery, blocker: '' } } })), '');
  const html = renderToStaticMarkup(React.createElement(ProjectUnblockSection, { project }));
  assert.match(html, /대표 승인 대기/);
  assert.match(html, />막힘 풀기</);
  assert.doesNotMatch(html, /무엇을 정했나/);
});

test('확인할 것 카드: 막힌 프로젝트의 1·2가 막힘 풀기이고, 펼치면 같은 패널 · 권장은 줄 안의 글', () => {
  const item = toCheckItem({
    id: `work-blocked-${PROJECT}`, title: '프로젝트 C — 막힘', tone: 'danger', source: { from: 'Projects', ref: PROJECT },
    subject: { type: 'project', id: PROJECT, name: '프로젝트 C', blockerKind: 'decision' },
    unblock: { delivery, updatedAt: project.updatedAt },
  });
  const closed = renderToStaticMarkup(React.createElement(FocusCard, { item, panel: null }));
  assert.match(closed, /◇ 병목에 맞춘 권장 · <\/span>남는 기록 · 결정 1건/);
  assert.equal((closed.match(/ci-outcome--primary/g) || []).length, 1);

  const open = renderToStaticMarkup(React.createElement(FocusCard, { item, panel: 'unblock-decision' }));
  assert.match(open, /무엇을 정했나/);
  assert.equal((open.match(/ci-outcome--primary/g) || []).length, 0);
  assert.equal((open.match(/fx-pill-btn--primary/g) || []).length, 1);
});

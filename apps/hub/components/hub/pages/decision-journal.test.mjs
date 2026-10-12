import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { decisionDraftTarget } from '../../../lib/signal-targets.js';
import { toCheckItem } from '../../../lib/check-items/catalog.js';

// 결정 일지(확인할 것 스펙 §6) — 출처 칩, 막힘 풀림, 그래서 할 일(없으면 한 줄 만들기, 못 읽으면 모름).
const { DecisionFollowups, DecisionMeta, decisionSourceOptions } = await import(new URL('./decision-journal.jsx', import.meta.url).href);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

const unblock = { id: 'd1', title: 'A안', source: 'unblock', projectName: '프로젝트 C', unblockedProjectId: 'p1', unblockedDays: 9,
  followups: [{ id: 't1', title: 'A안 견적 보내기', status: 'done', dueAt: '2026-10-03T00:00:00Z' }] };

test('행 메타: 출처 칩 · 연결 프로젝트 · 막힘 풀림 며칠을 글로', () => {
  const html = render(DecisionMeta, { decision: unblock });
  assert.match(html, />막힘 풀기</);
  assert.match(html, /프로젝트 C/);
  assert.match(html, /막힘 풀림 · <span class="mono">9<\/span>일/);
  assert.match(render(DecisionMeta, { decision: { id: 'd2', source: 'manual' } }), />직접</);
});

test('그래서 할 일: 있으면 상태 글리프와 함께, 없으면 한 줄 만들기, 못 읽었으면 없다고 하지 않는다', () => {
  const linked = render(DecisionFollowups, { decision: unblock });
  assert.match(linked, /data-lifecycle="done"/);
  assert.match(linked, /dj-task--done/);
  assert.match(render(DecisionFollowups, { decision: { ...unblock, followups: [] } }), /한 줄로 바로 만들기/);
  assert.match(render(DecisionFollowups, { decision: { ...unblock, followups: null } }), /그래서 할 일을 읽지 못했습니다/);
  assert.equal(render(DecisionFollowups, { decision: { ...unblock, isNew: true } }), '');
});

test('출처 필터는 전체 + 일지에 있는 출처만, 개수와 함께', () => {
  const options = decisionSourceOptions([{ source: 'unblock' }, { source: 'manual' }, { source: 'manual' }]);
  assert.deepEqual(options.map((option) => [option.key, option.count]), [['all', 3], ['unblock', 1], ['manual', 2]]);
});

test('확인할 것의 결정으로 남기기는 대상 이름·출처를 채워 연다 — 프로젝트면 연결까지', () => {
  const project = toCheckItem({ id: 'w', title: '프로젝트 C — 막힘', subject: { type: 'project', id: 'p1', name: '프로젝트 C' } });
  assert.ok(project.links.some((link) => link.action === 'decision'));
  const href = decisionDraftTarget(project);
  const params = new URLSearchParams(href.split('?')[1]);
  assert.equal(href.split('?')[0], 'dashboard/work/decisions');
  assert.equal(params.get('new'), 'decision');
  assert.equal(params.get('title'), '프로젝트 C · ');
  assert.equal(params.get('sourceType'), 'project');
  assert.equal(params.get('projectId'), 'p1');
  const group = new URLSearchParams(decisionDraftTarget({ subject: { type: 'lead-group', name: '새 리드 3건' } }).split('?')[1]);
  assert.equal(group.get('sourceType'), null);
});

test('Decisions 화면은 결정 일지 — 이름·버튼·출처 저장·카드 밖 할 일 줄 (운영 게이트 뒤)', () => {
  const work = read('./work.jsx');
  // 결정 일지는 운영자 판정 전이라 lib/feature-gates.js 뒤에 있다 — 닫히면 이전 Decisions 이름·문구로 돌아간다.
  assert.match(work, /const DECISION_JOURNAL = FEATURE_GATES\.decisionJournal/);
  assert.match(work, /<h2 className="fx-page-title">\{DECISION_JOURNAL \? '결정 일지' : 'Decisions'\}<\/h2>/);
  assert.match(work, /\{DECISION_JOURNAL \? '결정 남기기' : 'Record decision'\} <Kbd>N<\/Kbd>/);
  // 입력창 안내와 카드의 확실성 라벨은 한국어 직접 라벨만(DESIGN.md §5.3) — 내부 값 Committed/Draft는 화면에 내지 않는다.
  assert.match(work, /subtitle=\{editingDecision\.decidedAt \? '확정' : '미정 · 결정일을 정하면 확정으로 바뀝니다'\}/);
  assert.doesNotMatch(work, /'미정 · Draft'|Committed로 바뀝니다/);
  assert.match(work, /decisionPrefillFromQuery\(searchParams\)/);
  assert.match(work, /sourceRef: editingDecision\.sourceRef/);
  // 할 일 입력은 role=button 카드 밖(형제)에 둔다.
  assert.match(work, /<\/div>\s*\{DECISION_JOURNAL \? <DecisionFollowups/);
  assert.match(read('../hub-nav.js'), /label: FEATURE_GATES\.decisionJournal \? '결정 일지' : 'Decisions', path: 'dashboard\/work\/decisions'/);
});

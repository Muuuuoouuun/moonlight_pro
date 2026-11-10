import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { toCheckItem } from '../../../lib/check-items/catalog.js';

const source = readFileSync(new URL('./home.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('home.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'homeSourceItems');
assert.ok(declaration);
const select = new Function(`${declaration.getText(ast)}; return homeSourceItems;`)();
const signal = type => toCheckItem({ id: type, title: '저장된 항목', subject: { type, id: 'record-id', name: '저장된 이름' },
  source: { from: 'Projects', ref: 'record-id' }, tone: 'danger' }, { gates: { decisionJournal: false, checkItemUnblock: false } });

test('Home keeps actionable source records and omits heuristic or unlinked cards without changing the shared ledger', () => {
  const project = signal('project'), risk = signal('risk');
  const rows = [null, project, risk, { title: '연결 없는 항목' }, { ...project, signalKey: null }, { ...project, outcomes: [] }];
  const before = JSON.stringify(rows), result = select(rows);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(result.length, 1);
  assert.equal(result[0].signalKey, project.signalKey);
  assert.equal(result[0].source, project.source);
  assert.equal(result[0].outcomes, project.outcomes, 'existing save/snooze actions retain their IDs and callbacks');
  assert.match(result[0].homeReason, /막힘 상태가 저장/);
  assert.equal(result[0].links.some(link => link.action === 'decision'), false);
  assert.deepEqual(select(null), []);
});

test('an elapsed contact interval remains a source reminder without a new urgency or failure judgment', () => {
  const deal = { ...signal('deal'), title: '14일째 정체', summary: '오늘 반드시 연락', meta: '분류 근거', tone: 'danger' };
  const [row] = select([deal]);
  assert.equal(row.tone, 'neutral');
  assert.equal(row.title, deal.subject.name);
  assert.match(row.homeReason, /연락 이력 기준/);
  assert.doesNotMatch(row.summary, /오늘 반드시|실패|긴급/);
  assert.equal(deal.tone, 'danger', 'other tabs keep their existing source interpretation');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { buildLeadWrite } from '../../../lib/sales-os/revenue-write.js';
import { mapLead } from '../../../lib/repositories/revenue-ledger.js';

const paths = ['customers', 'inquiries', 'revenue', 'segments', 'personal-revenue', 'deals-money', 'finance'];
const sources = Object.fromEntries(paths.map(name => [name, readFileSync(new URL(`./${name}.jsx`, import.meta.url), 'utf8')]));
const trees = Object.fromEntries(paths.map(name => [name, ts.createSourceFile(`${name}.jsx`, sources[name], ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)]));
function find(file, predicate) {
  let found;
  function visit(node) { if (predicate(node, trees[file])) found = node; ts.forEachChild(node, visit); }
  visit(trees[file]); assert.ok(found, `find actual ${file} callback`); return found;
}
function run(node, file, scope) {
  return new Function(...Object.keys(scope), `return (${node.getText(trees[file])});`)(...Object.values(scope));
}
const variable = (file, name, scope) => run(find(file, node => ts.isVariableDeclaration(node) && node.name.getText(trees[file]) === name).initializer, file, scope);
const jsxAttribute = (file, name, fragment, scope) => run(find(file, node => ts.isJsxAttribute(node) && node.name.text === name && node.getText(trees[file]).includes(fragment)).initializer.expression, file, scope);
const query = path => new URL(path, 'https://synthetic.invalid/');
const hub = readFileSync(new URL('../hub-app.jsx', import.meta.url), 'utf8');
const assertRoute = path => assert.ok(hub.includes(`'${query(path).pathname.slice(1)}':`), `${path} has a real page destination`);

for (const scopeKey of ['personal', 'classin', null]) test(`customer creation keeps its scope through the real write mapper and read projection · ${scopeKey}`, () => {
  const workspace = jsxAttribute('customers', 'workspace', 'scopeKey ===', { scopeKey });
  const payload = variable('customers', 'createPayload', {
    workspace, createId: 'synthetic-id', name: 'Synthetic customer', stage: 'New', phone: '', nextAction: '', nextActionAt: '', isImportant: false,
  });
  const { columns, metaPatch } = buildLeadWrite(payload);
  const read = mapLead({ id: 'synthetic-id', ...columns, meta: metaPatch }, new Map(), new Map());
  assert.equal(read.type, scopeKey === 'classin' ? 'company' : 'personal');
  if (scopeKey) assert.equal(read.workspace, scopeKey === 'personal' ? 'brand' : 'classin');
});

for (const org_scope of ['personal', 'classin', 'unclassified']) test(`inquiry registration link carries the source scope and encoded contact seed · ${org_scope}`, () => {
  const navigated = [];
  const row = { org_scope, contact_name: 'Synthetic & name', contact_phone: '+82 10 0000 0000' };
  jsxAttribute('inquiries', 'onClick', 'dashboard/revenue/customers?new=customer', { row, onNavigate: path => navigated.push(path) })();
  const target = query(navigated[0]); assertRoute(navigated[0]);
  assert.equal(target.searchParams.get('scope'), org_scope === 'unclassified' ? null : org_scope);
  assert.equal(target.searchParams.get('new'), 'customer');
  assert.equal(target.searchParams.get('q'), row.contact_name); assert.equal(target.searchParams.get('phone'), row.contact_phone);
});

test('customer edit, personal forecast, segment and finance actions all resolve to real scoped pages', () => {
  for (const scopeKey of ['personal', 'classin']) {
    const target = variable('customers', 'editHref', { row: { kind: 'lead', id: 'synthetic-id' }, scopeKey });
    assertRoute(target); assert.equal(query(target).searchParams.get('scope'), scopeKey);
  }
  for (const workspace of ['classin', undefined]) {
    let path;
    variable('segments', 'openLead', { workspace, onNavigate: value => { path = value; } })({ id: 'synthetic-id' });
    assertRoute(path); assert.equal(query(path).searchParams.get('lead'), 'synthetic-id');
  }
  let target;
  variable('personal-revenue', 'openDeal', { deal: { id: 'synthetic-id' }, onNavigate: value => { target = value; } })();
  assertRoute(target); assert.equal(query(target).searchParams.get('scope'), 'personal');
  jsxAttribute('finance', 'onClick', 'dashboard/agents/office-council', { onNavigate: value => { target = value; } })();
  assertRoute(target); assert.equal(query(target).searchParams.get('scope'), 'personal');
});

for (const scope of ['personal', 'classin', null]) test(`deal dock opens its linked customer in the current scope · ${scope}`, () => {
  let target;
  jsxAttribute('deals-money', 'onOpenCustomer', 'dashboard/revenue/customers?', { scope, customerKey: 'lead:synthetic-id', onNavigate: value => { target = value; } })();
  assertRoute(target); assert.equal(query(target).searchParams.get('customer'), 'lead:synthetic-id');
  assert.equal(query(target).searchParams.get('scope'), scope);
});

for (const kind of ['lead', 'deal', 'case']) test(`${kind} deep link opens again after query consumption while preserving scope and view`, () => {
  const refName = `consumed${kind[0].toUpperCase() + kind.slice(1)}Ref`, paramName = `${kind}Param`;
  const callback = find('revenue', node => ts.isCallExpression(node) && node.expression.getText(trees.revenue) === 'React.useEffect'
    && node.arguments[0].getText(trees.revenue).includes(`${refName}.current = null`)).arguments[0];
  const ref = { current: null }, opened = [], replacements = [];
  const collection = kind === 'lead' ? 'mergedLeads' : kind === 'case' ? 'mergedCases' : 'deals';
  const pathname = `/dashboard/revenue/${kind}s`;
  const invoke = (param, state = 'live') => run(callback, 'revenue', {
    [paramName]: param, [refName]: ref, [collection]: [{ id: 'synthetic-id' }], syncState: state,
    [`setEdit${kind[0].toUpperCase() + kind.slice(1)}Id`]: id => opened.push(id), pathname,
    searchParams: new URLSearchParams(`scope=personal&view=stage&${kind}=synthetic-id`), router: { replace: value => replacements.push(value) },
  })();
  invoke('synthetic-id', 'error'); assert.deepEqual(opened, []);
  invoke('synthetic-id'); invoke('synthetic-id'); assert.deepEqual(opened, ['synthetic-id']);
  assert.equal(query(replacements.at(-1)).searchParams.get('scope'), 'personal');
  assert.equal(query(replacements.at(-1)).searchParams.get('view'), 'stage');
  assert.equal(query(replacements.at(-1)).searchParams.has(kind), false);
  invoke(null); invoke('synthetic-id'); assert.deepEqual(opened, ['synthetic-id', 'synthetic-id']);
});

for (const kind of ['lead', 'case']) for (const success of [true, false]) test(`${kind} save updates shared consumers only after a persisted receipt · ${success}`, async () => {
  const reloads = [];
  const name = kind === 'lead' ? 'persistLead' : 'persistCase';
  const row = { id: 'synthetic-id', name: 'Synthetic updated record' };
  const action = variable('revenue', name, {
    [`editing${kind[0].toUpperCase() + kind.slice(1)}`]: row,
    [`edit${kind[0].toUpperCase() + kind.slice(1)}Id`]: row.id,
    saveRevenueRecord: async () => ({ ok: success, status: success ? 'saved' : 'error' }),
    reloadLedger: options => reloads.push(options), toast: { success() {}, error() {} }, notifyRevenueSaveFailure() {},
  });
  assert.equal((await action()).ok, success);
  assert.deepEqual(reloads, success ? [{ preserve: true }] : []);
});

for (const kind of ['lead', 'case']) for (const success of [true, false]) test(`${kind} deletion refreshes other consumers after the real write succeeds · ${success}`, async () => {
  const reloads = [], pending = [];
  const row = { id: 'synthetic-id' };
  let ids = new Set(), rows = [row];
  const action = variable('revenue', kind === 'lead' ? 'deleteLead' : 'deleteCase', {
    [`edit${kind[0].toUpperCase() + kind.slice(1)}Id`]: row.id,
    [`editing${kind[0].toUpperCase() + kind.slice(1)}`]: row,
    setLocalLeads: update => { rows = update(rows); }, setLocalCases: update => { rows = update(rows); },
    setDeletedLeadIds: update => { ids = update(ids); }, setDeletedCaseIds: update => { ids = update(ids); },
    hasPendingRevenueCreate: () => false,
    setDeleteNotice() {}, scheduleUndoable: (_key, callback) => pending.push(callback), cancelUndoable: () => false,
    saveRevenueRecord: async () => ({ ok: success, status: success ? 'saved' : 'error' }),
    reloadLedger: options => reloads.push(options), toast: { info() {}, error() {} },
  });
  await action();
  if (kind === 'lead') {
    assert.equal(reloads.length, 0, 'undo window must not issue a read as if deletion were persisted');
    pending.forEach(callback => callback()); await new Promise(setImmediate);
  }
  assert.deepEqual(reloads, success ? [{ preserve: true }] : []);
  assert.equal(ids.has(row.id), success, 'failed delete restores the row');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { sidebarChildren } from './hub-nav.js';

const parse = path => ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const app = parse('./hub-app.jsx');
function variable(ast, name) {
  let value;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) value = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(value, name); return value;
}
const registered = new Set(variable(app, 'PAGE_MAP').properties.map(node => node.name.text));
const parents = new Set(variable(app, 'PARENT_JUMP').properties.map(node => node.name.text));
const resolve = path => registered.has(path.split(/[?#]/)[0]) || parents.has(path.split(/[?#]/)[0]);

test('every AI deferred destination and Settings/Evolution tab resolves to a mounted shell route in every scope', () => {
  for (const scope of ['all', 'classin', 'personal']) {
    for (const anchor of ['ai', 'settings']) {
      for (const child of sidebarChildren(anchor, scope)) assert.ok(resolve(child.path), `${scope} ${child.key}: ${child.path}`);
    }
  }
});

test('all Evolution quick-command cards point to mounted destinations', () => {
  const ast = parse('./pages/evolution-settings.jsx');
  const cards = new Function(`return (${variable(ast, 'QUICK_COMMANDS').getText(ast)});`)();
  assert.equal(cards.length, 9);
  for (const card of cards) assert.ok(resolve(card.dest), `${card.slash}: ${card.dest}`);
});

test('literal navigation actions in Settings/Evolution, AI and automation screens resolve through the shell', () => {
  for (const path of ['./pages/evolution-settings.jsx', './pages/agents.jsx', './pages/automations.jsx']) {
    const ast = parse(path), targets = [];
    function visit(node) {
      if (ts.isCallExpression(node) && /(?:^|\.)onNavigate$/.test(node.expression.getText(ast)) && ts.isStringLiteral(node.arguments[0])) targets.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(targets.length, path);
    for (const target of targets) assert.ok(resolve(target), `${path}: ${target}`);
  }
});

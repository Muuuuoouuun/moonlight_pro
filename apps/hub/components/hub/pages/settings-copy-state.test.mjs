import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./evolution-settings.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('evolution-settings.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const code = ts.transpileModule(['maskFingerprint', 'CopyRow', 'KeyRow'].map(name => {
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, name); return node.getText(ast);
}).join('\n'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;

function mount(name, writeText) {
  const slots = [], writes = [];
  let cursor = 0, tree;
  const dependencies = {
    React: { ...React, useState(initial) {
      const index = cursor++; slots[index] ??= { value: initial };
      return [slots[index].value, update => { slots[index].value = typeof update === 'function' ? update(slots[index].value) : update; }];
    } },
    navigator: { clipboard: writeText ? { writeText: value => { writes.push(value); return writeText(value); } } : undefined },
    setTimeout() {}, Iconed: () => null, Badge: ({ children }) => React.createElement('span', null, children),
  };
  const Component = new Function(...Object.keys(dependencies), `${code}\nreturn ${name};`)(...Object.values(dependencies));
  const props = name === 'CopyRow' ? { value: 'https://callback.example.test/path', mono: true } : {
    kind: 'key', last: true, item: { name: '연결 키', ref: 'key-record-ref', fingerprint: '1234', scopes: 'read', created: '오늘', lastUsed: '오늘' },
  };
  function render() { cursor = 0; tree = Component(props); return tree; }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement(node)) return [];
    return [node, ...nodes(node.props.children)];
  }
  render();
  return {
    writes,
    copy: () => nodes(tree).find(node => node.type === 'button' && (node.props.title === 'Copy' || (Array.isArray(node.props.children) && node.props.children.includes('Copy')))).props.onClick(),
    html: () => renderToStaticMarkup(render()),
  };
}

for (const name of ['CopyRow', 'KeyRow']) {
  test(`${name} reports Copied only after clipboard confirmation`, async () => {
    let finish;
    const app = mount(name, () => new Promise(resolve => { finish = resolve; }));
    const pending = app.copy();
    assert.doesNotMatch(app.html(), /Copied/);
    finish(); await pending;
    assert.match(app.html(), /Copied/);
    assert.equal(app.writes.length, 1);
  });
  test(`${name} keeps failed clipboard writes visible with manual-copy text`, async () => {
    const app = mount(name, async () => { throw new Error('permission denied'); });
    await app.copy();
    assert.doesNotMatch(app.html(), /Copied/);
    assert.match(app.html(), /복사하지 못했습니다/);
    assert.match(app.html(), /직접 선택해 복사/);
    assert.match(app.html(), name === 'CopyRow' ? /https:\/\/callback\.example\.test\/path/ : /key-record-ref/);
  });
  test(`${name} treats unavailable clipboard as failure`, async () => {
    const app = mount(name);
    await app.copy();
    assert.doesNotMatch(app.html(), /Copied/);
    assert.match(app.html(), /복사하지 못했습니다/);
    assert.equal(app.writes.length, 0);
  });
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const load = file => {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
};
function compile(file, name, dependencies = {}) {
  const ast = load(file);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, name);
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { React, ...dependencies };
  return new Function(...Object.keys(deps), `${code}; return ${name};`)(...Object.values(deps));
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
const stub = () => null;
const ContentTagTrendPanel = compile('./pages/content.jsx', 'ContentTagTrendPanel', { SectionTitle: stub, Skeleton: stub, TAG_TREND_GLYPH: { new: 'NEW', up: '▲' } });
const DistributionRows = compile('./pages/daily-brief.jsx', 'DistributionRows');
const SeriesRows = compile('./pages/overview.jsx', 'SeriesRows');
const BrandActivityBars = compile('./pages/overview.jsx', 'BrandActivityBars', { BrandIcon: stub });

function valueNode(tree, value) {
  const node = nodes(tree).find(node => node.type === 'span' && node.props.children === value);
  assert.ok(node, `visible value ${value}`);
  return node;
}

test('chart values meet the 12px data floor while metadata NEW meets 10.5px', () => {
  for (const count of [0, 12, 123456789]) {
    const tag = ContentTagTrendPanel({ tagTrends: [{ tag: '긴합성태그'.repeat(5), count, trend: 'new' }], syncState: 'live' });
    assert.equal(valueNode(tag, count).props.style.fontSize, 12);
    assert.equal(valueNode(tag, 'NEW').props.style.fontSize, 10.5);
    assert.equal(valueNode(DistributionRows({ series: [{ key: 'open', label: '진행', value: count }] }), count).props.style.fontSize, 12);
    const brand = BrandActivityBars({ brands: [{ key: 'synthetic', label: '긴합성브랜드'.repeat(5), count }] });
    assert.equal(valueNode(brand, count).props.style.fontSize, 12);
    const series = SeriesRows({ series: [{ key: 'open', label: '진행', value: count, meta: '합성 금액' }] });
    const valueParent = nodes(series).find(node => node.type === 'span' && node.props.className === 'mono');
    assert.equal(valueParent.props.style.fontSize, 12);
  }
});

test('data columns grow intrinsically instead of squeezing large values into fixed 22–28px cells', () => {
  const trees = [
    ContentTagTrendPanel({ tagTrends: [{ tag: '합성', count: 123456789, trend: 'new' }], syncState: 'live' }),
    DistributionRows({ series: [{ key: 'open', label: '진행', value: 123456789 }] }),
    SeriesRows({ series: [{ key: 'open', label: '진행', value: 123456789 }] }),
    BrandActivityBars({ brands: [{ key: 'synthetic', label: '합성', count: 123456789 }] }),
  ];
  for (const tree of trees) {
    const row = nodes(tree).find(node => node.props?.style?.display === 'grid');
    assert.match(row.props.style.gridTemplateColumns, /minmax\(0, 1fr\)/);
    assert.match(row.props.style.gridTemplateColumns, /minmax\((22|24|26|28)px, max-content\)/);
    assert.match(renderToStaticMarkup(tree), /123456789/);
  }
  // This verifies the browser's intrinsic-column inputs, not measured pixel fit.
});

test('formatted money and campaign actual/target use the data floor, not the metadata scale', () => {
  const ast = load('./pages/revenue-heatmap.jsx');
  const moneyStyles = [];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'span'
      && node.children.some(child => ts.isJsxExpression(child) && /^fmtMoney\(/.test(child.expression?.getText(ast) || ''))) {
      const style = node.openingElement.attributes.properties.find(attr => attr.name?.getText(ast) === 'style');
      if (style?.initializer && ts.isJsxExpression(style.initializer)) {
        const fs = style.initializer.expression.properties.find(prop => prop.name?.getText(ast) === 'fontSize');
        moneyStyles.push(Number(fs.initializer.getText(ast)));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(moneyStyles.length, 3, 'region total and two money-value cells');
  assert.ok(moneyStyles.every(size => size >= 12), moneyStyles.join(','));
  const content = load('./pages/content.jsx');
  let actual;
  function findActual(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(content) === 'span'
      && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(content).includes('cScorecard.actual'))) actual = node;
    ts.forEachChild(node, findActual);
  }
  findActual(content);
  assert.ok(actual);
  assert.match(actual.openingElement.getText(content), /fontSize:\s*12/);
  assert.match(actual.getText(content), /cScorecard\?\.target/);
});

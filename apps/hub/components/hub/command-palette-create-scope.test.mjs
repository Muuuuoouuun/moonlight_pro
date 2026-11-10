import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./hub-command-palette.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hub-command-palette.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'CommandPalette');
const code = ts.transpileModule(node.getText(ast).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function palette(scope) {
  const visited = [];
  let closed = 0;
  const dependencies = {
    React: {
      createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(value => value != null && value !== false) } }),
      useState: initial => [initial, () => {}], useRef: current => ({ current }), useMemo: compute => compute(), useEffect() {},
    },
    NAV_TREE: [], LEGACY_TREE: [], navPathForScope: () => '',
    paletteItemKey: item => item && `${item.kind}:${item.path || item.action}:${item.label}`,
  };
  for (const name of ['Iconed', 'Button', 'Kbd', 'Skeleton', 'TruthBadge']) dependencies[name] = name;
  const Component = new Function(...Object.keys(dependencies), `${code}\nreturn CommandPalette;`)(...Object.values(dependencies));
  const tree = Component({ open: true, scope, onClose: () => { closed++; }, onNavigate: path => visited.push(path) });
  function nodes(current) {
    if (!current || typeof current !== 'object') return [];
    return [current, ...(current.props?.children || []).flatMap(nodes)];
  }
  const text = current => typeof current === 'string' ? current : current?.props?.children.map(text).join('') || '';
  return {
    visited, closed: () => closed,
    activate(label) {
      const option = nodes(tree).find(item => item.type === 'button' && item.props.role === 'option' && text(item).includes(label));
      assert.ok(option, label); option.props.onClick();
    },
  };
}

for (const scope of ['personal', 'classin', 'all']) test(`actual palette create handlers preserve ${scope} scope and close before navigating`, () => {
  const app = palette(scope);
  for (const [label, route, kind] of [
    ['New Lead', 'leads', 'lead'], ['New Deal', 'deals', 'deal'],
    ['고객사·거래처 계정 추가', 'accounts', 'account'], ['New Case', 'cases', 'case'],
  ]) {
    app.activate(label);
    assert.equal(app.visited.at(-1), `dashboard/revenue/${route}?new=${kind}${scope === 'all' ? '' : `&scope=${scope}`}`);
  }
  assert.equal(app.closed(), 4);
});

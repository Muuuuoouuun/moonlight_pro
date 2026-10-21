import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = ['hub-tokens.css', 'hub-futura.css', 'hub-depth.css'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
// A deliberately bounded cascade model for shared Button shadows and their
// inherited/local custom properties. This is selector evidence, not rendering.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .flatMap(([, selectors, body]) => selectors.split(',').map(selector => ({
    selector: selector.trim(),
    declarations: [...body.matchAll(/(?:^|;)\s*(--[\w-]+|box-shadow)\s*:\s*([^;]+)/g)].map(([, property, value]) => [property, value.trim()]),
  })))
  .filter(rule => /^\.hub-app(?=[\s.[,:]|$)/.test(rule.selector) && !/[\s>+~]/.test(rule.selector.replace(/\s+\.hub-btn[^\s]*$/, '')))
  .filter(rule => rule.declarations.length);

function matchesCompound(selector, { classes, attributes = {}, hover = false, disabled = false, active = false }) {
  const atomMatches = atom => {
    if (atom.startsWith('.')) return classes.has(atom.slice(1));
    if (atom.startsWith('[')) {
      const [, name, value] = atom.match(/^\[([\w-]+)(?:="([^"]+)")?\]$/) || [];
      assert.ok(name, `unmodeled attribute ${atom}`);
      return value === undefined ? name in attributes : attributes[name] === value;
    }
    if (atom === ':hover') return hover;
    if (atom === ':disabled') return disabled;
    if (atom === ':active') return active;
    assert.fail(`unmodeled state ${atom}`);
  };
  let matches = true;
  const rest = selector.replace(/:not\(([^)]+)\)/g, (_, atom) => { matches &&= !atomMatches(atom); return ''; });
  const atoms = rest.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || [];
  assert.equal(rest.replace(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g, ''), '', `unmodeled selector: ${selector}`);
  return matches && atoms.every(atomMatches);
}

function shadowFor(variant, { hover = false, disabled = false, depthB = false, theme = 'dark', resolve = false } = {}) {
  const root = { classes: new Set(['hub-app']), attributes: { 'data-theme': theme, ...(depthB ? { 'data-visual-system': 'depth-c' } : {}) } };
  const button = { classes: new Set(['hub-btn', `hub-btn--${variant}`]), hover, disabled };
  function cascade(target) {
    const winners = {};
    for (const rule of rules) {
      const parts = rule.selector.split(/\s+/);
      if (parts.length !== (target === root ? 1 : 2) || !matchesCompound(parts[0], root)) continue;
      if (parts.length === 2 && !matchesCompound(parts[1], target)) continue;
      // :not contributes its argument specificity, not another pseudo-class.
      const specificity = (rule.selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\()[\w-]+/g) || []).length;
      for (const [property, value] of rule.declarations) {
        if (!winners[property] || specificity >= winners[property].specificity) winners[property] = { value, specificity };
      }
    }
    return Object.fromEntries(Object.entries(winners).map(([property, winner]) => [property, winner.value]));
  }
  const inherited = cascade(root);
  const local = cascade(button);
  // Custom-property aliases on an ancestor resolve there before inheritance.
  const expand = (value, properties, depth = 0) => {
    assert.ok(depth < 12, 'no cyclic shadow aliases');
    return value?.replace(/var\((--[\w-]+)\)/g, (original, name) => properties[name] === undefined ? original : expand(properties[name], properties, depth + 1));
  };
  const properties = { ...Object.fromEntries(Object.entries(inherited).map(([name, value]) => [name, expand(value, inherited)])), ...local };
  return resolve ? expand(local['box-shadow'], properties) : local['box-shadow'];
}

test('unmarked baseline: ghost actions remain flat at rest and on hover', () => {
  for (const hover of [false, true]) for (const disabled of [false, true]) assert.equal(shadowFor('ghost', { hover, disabled }), 'none');
});

test('unmarked baseline: disabled supporting actions do not acquire hover lift', () => {
  for (const variant of ['secondary', 'outline', 'danger']) assert.equal(shadowFor(variant, { hover: true, disabled: true }), shadowFor(variant, { disabled: true }));
});

test('unmarked baseline retains its established supporting and primary shadows', () => {
  for (const variant of ['secondary', 'outline', 'danger']) {
    assert.equal(shadowFor(variant), 'var(--fx-shadow)');
    assert.equal(shadowFor(variant, { hover: true }), 'var(--fx-shadow-lift)');
  }
  assert.match(shadowFor('primary'), /inset/);
  assert.equal(shadowFor('primary', { hover: true, disabled: true }), 'none');
});

test('marked depth C: supporting actions rise, primary is ink, ghost and disabled stay flat in both themes', () => {
  for (const theme of ['dark', 'light']) {
    // 다크·라이트 각 토큰의 고유 그림자 한 겹으로 판별한다.
    const raise = theme === 'dark' ? /0 12px 26px -10px/ : /4px 4px 10px -1px/;
    const raiseHover = theme === 'dark' ? /0 16px 30px -10px/ : /6px 7px 14px -2px/;
    for (const variant of ['secondary', 'outline', 'danger']) {
      assert.match(shadowFor(variant, { theme, depthB: true, resolve: true }), raise, `${theme}/${variant}`);
      assert.match(shadowFor(variant, { theme, hover: true, depthB: true, resolve: true }), raiseHover, `${theme}/${variant}/hover`);
    }
    assert.match(shadowFor('primary', { theme, depthB: true, resolve: true }), theme === 'dark' ? /0 6px 18px -6px/ : /4px 6px 12px -3px/);
    for (const variant of ['primary', 'secondary', 'outline', 'danger', 'ghost']) for (const hover of [false, true]) {
      assert.equal(shadowFor(variant, { theme, hover, disabled: true, depthB: true }), 'none', `${theme}/${variant}/disabled`);
    }
    for (const hover of [false, true]) assert.equal(shadowFor('ghost', { theme, hover, depthB: true }), 'none');
  }
});

test('removing the dashboard marker restores the baseline even with depth CSS still loaded', () => {
  for (const theme of ['dark', 'light']) {
    assert.match(shadowFor('primary', { theme, resolve: true }), /inset/);
    assert.match(shadowFor('secondary', { theme, resolve: true }), /oklch/);
    assert.equal(shadowFor('ghost', { theme, resolve: true }), 'none');
  }
});

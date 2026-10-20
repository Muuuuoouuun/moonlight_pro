import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = ['hub-tokens.css', 'hub-futura.css'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
// Resolve only the shared Button shadow rules, in actual stylesheet order.
// This models selector matching/specificity, not viewport rendering or pixels.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .flatMap(([, selectors, body]) => selectors.split(',').map(selector => ({ selector: selector.trim(), shadow: body.match(/(?:^|;)\s*box-shadow:\s*([^;]+)/)?.[1].trim() })))
  .filter(rule => rule.shadow && /^\.hub-app \.hub-btn/.test(rule.selector));

function shadowFor(variant, { hover = false, disabled = false } = {}) {
  const classes = new Set(['hub-app', 'hub-btn', `hub-btn--${variant}`]);
  const atomMatches = atom => atom.startsWith('.') ? classes.has(atom.slice(1)) : atom === ':hover' ? hover : atom === ':disabled' ? disabled : assert.fail(`unmodeled state ${atom}`);
  let winner;
  for (const rule of rules) {
    let matches = true;
    const rest = rule.selector.replace(/:not\(([^)]+)\)/g, (_, atom) => { matches &&= !atomMatches(atom); return ''; });
    const atoms = rest.match(/\.[\w-]+|:[\w-]+/g) || [];
    assert.equal(rest.replace(/\.[\w-]+|:[\w-]+|\s/g, ''), '', `unmodeled selector: ${rule.selector}`);
    if (!matches || !atoms.every(atomMatches)) continue;
    // :not contributes its argument specificity, not an additional pseudo-class.
    const specificity = (rule.selector.match(/\.[\w-]+|:(?!not\()[\w-]+/g) || []).length;
    if (!winner || specificity >= winner.specificity) winner = { ...rule, specificity };
  }
  return winner?.shadow;
}

test('ghost actions remain flat at rest and on hover instead of inheriting raised Futura chrome', () => {
  for (const hover of [false, true]) for (const disabled of [false, true]) {
    assert.equal(shadowFor('ghost', { hover, disabled }), 'none');
  }
});

test('disabled supporting actions do not acquire hover lift', () => {
  for (const variant of ['secondary', 'outline', 'danger']) {
    assert.equal(shadowFor(variant, { hover: true, disabled: true }), shadowFor(variant, { disabled: true }));
  }
});

test('enabled supporting actions and primary hierarchy retain their established shadows', () => {
  for (const variant of ['secondary', 'outline', 'danger']) {
    assert.equal(shadowFor(variant), 'var(--fx-shadow)');
    assert.equal(shadowFor(variant, { hover: true }), 'var(--fx-shadow-lift)');
  }
  assert.match(shadowFor('primary'), /inset/);
  assert.equal(shadowFor('primary', { hover: true, disabled: true }), 'none');
});

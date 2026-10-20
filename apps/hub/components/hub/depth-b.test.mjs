import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const depth = read('hub-depth.css');
const base = read('hub-tokens.css');
const futura = read('hub-futura.css');
const checks = read('check-items/check-items.css');
const marker = '.hub-app[data-visual-system="depth-b"]';
const normalize = value => value.replace(/\s+/g, ' ').trim();
function parse(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .flatMap(([, selectors, body]) => selectors.split(',').map(selector => ({
      selector: selector.trim(),
      properties: Object.fromEntries([...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)].map(([, name, value]) => [name, normalize(value)])),
    })));
}
const cascadeRules = [parse([base, futura, checks, depth].join('\n')), parse([base, futura, depth, checks].join('\n'))];
const rules = parse(depth);
const root = rules.find(rule => rule.selector === marker).properties;
const light = rules.find(rule => rule.selector === `${marker}[data-theme="light"]`).properties;
const props = selector => rules.find(rule => rule.selector === selector)?.properties;

// Bounded shadow/transform cascade for the exact panel/navigation/control
// selectors below. At-rules are conservatively included; no pixel/render claim.
function modeled(property, classes, { theme = 'dark', hover = false, disabled = false, expanded = false, current = false, ready = false, latePageCss = false } = {}) {
  const rootAttrs = { 'data-visual-system': 'depth-b', 'data-theme': theme };
  const attrs = { ...(expanded ? { 'aria-expanded': 'true' } : {}), ...(current ? { 'aria-current': 'page' } : {}) };
  function matches(compound, isRoot = false) {
    const targetClasses = isRoot ? ['hub-app'] : classes;
    const targetAttrs = isRoot ? rootAttrs : attrs;
    let okay = true;
    function atom(value) {
      if (value.startsWith('.')) return targetClasses.includes(value.slice(1));
      if (value.startsWith('[')) {
        const [, name, match] = value.match(/^\[([\w-]+)(?:="([^"]+)")?\]$/) || [];
        return match === undefined ? name in targetAttrs : targetAttrs[name] === match;
      }
      return value === ':hover' ? hover : value === ':disabled' ? disabled : false;
    }
    compound = compound.replace(/:not\(([^)]+)\)/g, (_, value) => { okay &&= !atom(value); return ''; });
    const atoms = compound.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || [];
    return okay && atoms.length > 0 && compound.replace(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g, '') === '' && atoms.every(atom);
  }
  const inherited = { ...root, ...(theme === 'light' ? light : {}) };
  const winners = {};
  for (const rule of cascadeRules[Number(latePageCss)]) {
    let selector = rule.selector;
    if (selector.includes('[data-indicator="on"] > ')) {
      if (!ready) continue;
      selector = selector.replace('[data-indicator="on"] > ', '');
    }
    const parts = selector.split(/\s+/);
    if (parts.length !== 2 || !matches(parts[0], true) || !matches(parts[1])) continue;
    const specificity = (rule.selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\()[\w-]+/g) || []).length;
    for (const [name, value] of Object.entries(rule.properties)) if (!winners[name] || specificity >= winners[name].specificity) winners[name] = { value, specificity };
  }
  const variables = { ...inherited, ...Object.fromEntries(Object.entries(winners).map(([name, value]) => [name, value.value])) };
  function resolve(value, count = 0) {
    assert.ok(count < 12);
    return value?.replace(/var\((--[\w-]+)\)/g, (original, name) => variables[name] === undefined ? original : resolve(variables[name], count + 1));
  }
  return resolve(winners[property]?.value);
}

test('B uses the exact approved panel and selected-navigation recipes, not a new theme', () => {
  assert.equal(root['--shadow-panel'], '0 1px 0 oklch(1 0 0 / .10) inset, -4px -4px 16px oklch(1 0 0 / .025), 6px 10px 28px -10px oklch(0 0 0 / .55)');
  assert.equal(light['--shadow-panel'], '0 1px 0 oklch(1 0 0 / .8) inset, -4px -4px 14px oklch(1 0 0), 5px 9px 24px -12px oklch(0 0 0 / .17)');
  for (const [tokens, edge] of [[root, '.10'], [light, '.8']]) assert.equal(tokens['--shadow-nav'], `0 1px 0 oklch(1 0 0 / ${edge}) inset, 0 5px 16px -7px oklch(0 0 0 / .45)`);
  for (const name of ['--shadow-card', '--shadow-soft', '--fx-shadow', '--fx-shadow-lift']) assert.equal(root[name], 'var(--shadow-panel)');
});

test('all new selectors require the dashboard marker, which login never renders', () => {
  assert.ok(rules.length > 10);
  for (const rule of rules) assert.ok(rule.selector.startsWith(marker), rule.selector);
  const app = read('hub-app.jsx');
  assert.match(app, /className="hub-app" data-theme=\{theme\} data-visual-system="depth-b"/);
  assert.ok(app.indexOf('import "./hub-depth.css"') > app.indexOf('import "./hub-futura.css"'));
  assert.doesNotMatch(read('../../app/login/page.jsx'), /data-visual-system|hub-depth/);
});

test('the B layer changes only depth, flat-control hover and the existing font fallback', () => {
  const allowed = /^(--(?:shadow-[\w-]+|fx-shadow(?:-lift)?|brief-panel-shadow(?:-hover)?|font-mono)|box-shadow|transform|background)$/;
  for (const rule of rules) for (const name of Object.keys(rule.properties)) assert.match(name, allowed);
  assert.doesNotMatch(depth.replace(/\/\*[\s\S]*?\*\//g, ''), /!important|--shadow-pop\s*:|outline\s*:|transition\s*:|animation\s*:|font-size\s*:|font-weight\s*:/);
});

test('bundled SUIT follows JetBrains without changing the sans face or canonical role sizes', () => {
  assert.equal(root['--font-mono'], "'JetBrains Mono', 'SUIT Variable', 'Cascadia Code', 'Cascadia Mono', ui-monospace, 'SF Mono', Consolas, monospace");
  assert.match(base, /--font-sans:\s*'SUIT Variable'/);
  assert.match(futura, /--fx-hero:\s*44px/);
  assert.match(futura, /--fx-hero-weight:\s*300/);
  const stat = base.match(/\.hub-app \.stat\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(stat, /font-family/); // display figures inherit SUIT, not mono
  assert.match(stat, /tabular-nums lining-nums/);
});

test('Card inline shadows, Futura and Today panels share B while overlay consumers keep legacy depth', () => {
  assert.match(read('hub-primitives.jsx'), /boxShadow: 'var\(--shadow-card\)'/);
  assert.equal(props(`${marker} .daily-brief`)['--brief-panel-shadow'], 'var(--shadow-panel)');
  for (const name of ['personal-revenue-drawer', 'hub-project-portfolio-mobile-manage > div']) assert.equal(props(`${marker} .${name}`)['box-shadow'], 'var(--shadow-card-legacy)');
  assert.match(read('pages/project-direct-work.module.css'), /\.addOptions > div\s*\{[^}]*box-shadow: var\(--shadow-card-legacy, var\(--shadow-card\)\)/);
  for (const tokens of [root, light]) assert.match(tokens['--shadow-card-legacy'], /0 8px 24px/);
});

test('selected navigation retains one pill before and after indicator initialization in both themes', () => {
  for (const theme of ['dark', 'light']) {
    assert.match(modeled('box-shadow', ['hub-nav-item'], { theme, current: true }), /0 5px 16px -7px/);
    assert.equal(modeled('box-shadow', ['hub-nav-item'], { theme, current: true, ready: true }), 'none');
    assert.match(modeled('box-shadow', ['hub-nav-indicator'], { theme, ready: true }), /0 5px 16px -7px/);
    assert.match(modeled('box-shadow', ['fx-shell-card'], { theme }), /6px 10px 28px|5px 9px 24px/);
  }
});

test('pill and Check Items controls stay flat without hover lift even when page CSS loads later', () => {
  for (const latePageCss of [false, true]) for (const theme of ['dark', 'light']) for (const hover of [false, true]) for (const disabled of [false, true]) {
    for (const classes of [['fx-pill-btn'], ['fx-pill-btn', 'fx-pill-btn--primary'], ['fx-pill-btn', 'fx-pill-btn--ghost'], ['ci-outcome'], ['ci-outcome', 'ci-outcome--primary']]) {
      const state = { latePageCss, theme, hover, disabled };
      assert.equal(modeled('box-shadow', classes, state), 'none');
      assert.equal(modeled('transform', classes, state), 'none');
    }
  }
});

test('expanded Check Items keep the selection ring; selected tabs and Today links remain flat', () => {
  for (const latePageCss of [false, true]) for (const hover of [false, true]) {
    assert.equal(modeled('box-shadow', ['ci-outcome'], { expanded: true, hover, latePageCss }), 'inset 0 0 0 1px var(--accent)');
    assert.equal(modeled('box-shadow', ['fx-tab'], { current: true, hover }), 'none');
    assert.equal(modeled('box-shadow', ['daily-brief__jump'], { hover }), 'none');
    assert.equal(modeled('transform', ['daily-brief__jump'], { hover }), 'none');
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = readFileSync(new URL('./hub-tokens.css', import.meta.url), 'utf8');
const root = postcss.parse(css);
// Evaluate only root spacing declarations, respecting real media bounds,
// selector specificity and source order. This is not a browser layout engine.
function spacing(theme, width) {
  const winners = new Map();
  root.walkRules(rule => {
    let ancestor = rule.parent;
    while (ancestor) {
      if (ancestor.type === 'atrule') {
        if (ancestor.name !== 'media') return;
        const max = ancestor.params.match(/^\(max-width:\s*(\d+)px\)$/);
        if (!max || width > Number(max[1])) return;
      }
      ancestor = ancestor.parent;
    }
    for (const selector of rule.selectors) {
      const match = selector.match(/^\.hub-app(?:\[data-theme(?:="(dark|light)")?\])?$/);
      if (!match || (selector.includes('[data-theme') && !theme) || (match[1] && match[1] !== theme)) continue;
      const specificity = selector.includes('[') ? 2 : 1;
      rule.walkDecls(/^--(section-gap|card-pad)$/, declaration => {
        const old = winners.get(declaration.prop);
        if (!old || Number(Boolean(declaration.important)) > Number(Boolean(old.important))
          || (Boolean(declaration.important) === Boolean(old.important) && specificity >= old.specificity)) {
          winners.set(declaration.prop, { value: declaration.value, specificity, important: declaration.important });
        }
      });
    }
  });
  return Object.fromEntries([...winners].map(([name, winner]) => [name, winner.value]));
}

test('mobile/tablet spacing wins equally over dark, light and default theme roots', () => {
  for (const theme of [undefined, 'light', 'dark']) {
    for (const width of [390, 560]) assert.deepEqual(spacing(theme, width), { '--section-gap': '12px', '--card-pad': '14px' }, `${theme} at ${width}`);
    for (const width of [561, 720, 900]) assert.deepEqual(spacing(theme, width), { '--section-gap': '16px', '--card-pad': '16px' }, `${theme} at ${width}`);
    for (const width of [901, 1440]) assert.deepEqual(spacing(theme, width), { '--section-gap': '24px', '--card-pad': '20px' }, `${theme} at ${width}`);
  }
});

test('mobile page padding continues to consume the shared section spacing token', () => {
  const pageRules = [];
  root.walkRules(rule => {
    if (rule.selectors.includes('.hub-page') && rule.selectors.includes('.hub-page-shell')) {
      rule.walkDecls('padding', decl => pageRules.push({ value: decl.value, important: Boolean(decl.important), media: rule.parent.params }));
    }
  });
  assert.ok(pageRules.some(rule => rule.media === '(max-width: 900px)' && rule.value === 'var(--section-gap)' && rule.important));
});

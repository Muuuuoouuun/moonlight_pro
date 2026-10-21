import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Depth C (DESIGN.md §15 2026-10-21) — 패널은 바탕보다 밝은 면으로 솟고, 보조 컨트롤은 낮게 솟고,
// 입력·트랙은 눌린 홈, 현재 위치는 잉크 pill. 이 시험은 선택자·토큰 증거이지 렌더 증거가 아니다.
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const depth = read('hub-depth.css');
const tokens = read('hub-tokens.css');
const marker = '.hub-app[data-visual-system="depth-c"]';
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...strip(depth).matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) => selectors.split(',').map(selector => ({
  selector: selector.replace(/@media[^{]*$/, '').trim(),
  props: Object.fromEntries([...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)].map(([, name, value]) => [name, value.replace(/\s+/g, ' ').trim()])),
})));
// 같은 선택자가 여러 규칙에 나오면 뒤의 선언이 이긴다.
const rule = selector => { const hits = rules.filter(r => r.selector === selector); return hits.length ? Object.assign({}, ...hits.map(r => r.props)) : undefined; };
const dark = rule(marker);
const light = rule(`${marker}[data-theme="light"]`);

// oklch → 상대 휘도(WCAG). 토큰은 모두 oklch(L C h) 리터럴이다.
function luminance(value) {
  const [L, C, h] = value.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/).slice(1).map(Number);
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const contrast = (x, y) => { const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
const L = value => Number(value.match(/oklch\(([\d.]+)/)[1]);

test('every depth selector requires the dashboard marker, which login never renders', () => {
  assert.ok(rules.length > 30);
  for (const { selector } of rules) assert.ok(selector.startsWith(marker), selector);
  const app = read('hub-app.jsx');
  assert.match(app, /className="hub-app" data-theme=\{theme\} data-visual-system="depth-c"/);
  assert.ok(app.indexOf('import "./hub-depth.css"') > app.indexOf('import "./hub-futura.css"'));
  assert.doesNotMatch(read('../../app/login/page.jsx'), /data-visual-system|hub-depth/);
});

test('boxes sit one step brighter than the ground in both themes, and dark raised controls brighter still', () => {
  for (const theme of [dark, light]) assert.ok(L(theme['--surface']) - L(theme['--bg']) >= 0.035, theme['--surface']);
  // 다크의 솟은 면은 상자보다 밝아야 위쪽 빛이 묻히지 않는다(운영자 피드백 2026-10-21).
  for (const stop of dark['--raise-face'].match(/oklch\([^)]+\)/g)) assert.ok(L(stop) > L(dark['--surface']), stop);
  for (const theme of [dark, light]) for (const name of ['--shadow-panel', '--shadow-raise', '--shadow-raise-hover', '--shadow-inset', '--ink-face', '--ink-fg', '--shadow-ink', '--bg-glow']) assert.ok(theme[name], name);
  for (const name of ['--shadow-card', '--shadow-soft', '--fx-shadow', '--fx-shadow-lift']) assert.equal(dark[name], 'var(--shadow-panel)');
});

test('secondary text keeps AA on the ground and on boxes after the surfaces moved', () => {
  for (const theme of [dark, light]) for (const fg of ['--fg-muted', '--fg-dim', '--fg-faint']) for (const ground of ['--bg', '--surface']) {
    assert.ok(contrast(theme[fg], theme[ground]) >= 4.5, `${fg} on ${ground}: ${contrast(theme[fg], theme[ground]).toFixed(2)}`);
  }
});

test('the ink slide is distance-proportional, deep-decelerating, and starts in place', () => {
  for (const [name, value] of [['--dur-slide-base', '280ms'], ['--dur-slide-per-px', '0.75ms'], ['--dur-slide-max', '520ms'], ['--ease-slide', 'cubic-bezier(0.16, 1, 0.3, 1.04)']]) {
    assert.match(tokens, new RegExp(`${name}:\\s*${value.replace(/[().,]/g, '\\$&')};`), name);
  }
  // var()는 선언한 요소에서 풀리므로 시간은 JS가 --slide-dist를 싣는 영역에서 계산한다.
  assert.equal(dark['--slide-dur'], undefined);
  for (const region of ['hub-sidebar-nav', 'hub-sidebar-utilities']) assert.match(rule(`${marker} .${region}`)['--slide-dur'], /var\(--slide-dist, 0\) \* var\(--dur-slide-per-px\)/);
  assert.match(rule(`${marker} .hub-nav-indicator`).transition, /transform var\(--slide-dur\) var\(--ease-slide\)/);
  assert.doesNotMatch(rule(`${marker} .hub-nav-indicator[data-instant]`).transition, /transform/);
  assert.match(read('hub-sidebar.jsx'), /setProperty\('--slide-dist'/);
});

test('selected navigation keeps exactly one ink pill before and after the indicator is ready', () => {
  assert.equal(rule(`${marker} .hub-nav-item[aria-current="page"]`).background, 'var(--ink-face)');
  assert.equal(rule(`${marker} .hub-nav-indicator`).background, 'var(--ink-face)');
  const ready = rule(`${marker} [data-indicator="on"] > .hub-nav-item[aria-current="page"]`);
  assert.equal(ready.background, 'transparent');
  assert.equal(ready['box-shadow'], 'none');
});

test('supporting actions rise, press into a well, primary is ink, ghost and disabled stay flat', () => {
  for (const variant of ['secondary', 'outline', 'danger']) {
    assert.equal(rule(`${marker} .hub-btn--${variant}:not(:disabled)`)['box-shadow'], 'var(--shadow-raise)');
    assert.equal(rule(`${marker} .hub-btn--${variant}:active:not(:disabled)`)['box-shadow'], 'var(--shadow-inset)');
  }
  assert.equal(rule(`${marker} .hub-btn--danger:not(:disabled)`)['border-color'], 'var(--danger-line)');
  assert.equal(rule(`${marker} .hub-btn--primary:not(:disabled)`).background, 'var(--ink-face)');
  for (const flat of ['.hub-btn--ghost', '.hub-btn:disabled', '.fx-pill-btn--ghost', '.ci-outcome:disabled']) assert.equal(rule(`${marker} ${flat}`)['box-shadow'], 'none', flat);
  assert.match(rule(`${marker} .ci-outcome[aria-expanded="true"]:not(.ci-outcome--primary):not(:disabled)`)['box-shadow'], /^inset 0 0 0 1px var\(--accent\)/);
});

test('inputs and tracks are wells that keep the 3:1 control edge and the focus ring', () => {
  for (const sel of ['.hub-input', '.hub-field', '.hub-seg']) assert.equal(rule(`${marker} ${sel}`)['box-shadow'], 'var(--shadow-inset)', sel);
  assert.equal(rule(`${marker} .hub-input`)['border-color'], undefined); // --line-control 경계는 기본 규칙 그대로
  assert.match(rule(`${marker} .hub-field:focus-within`)['box-shadow'], /0 0 0 1px var\(--moon-300\)/);
  assert.doesNotMatch(strip(depth), /(?<![\w-])outline\s*:|!important|font-size\s*:|font-weight\s*:/);
});

test('the shell paints the glow; topbar and sidebar chrome moved from inline style into CSS', () => {
  assert.equal(rule(`${marker} .hub-shell`).background, 'var(--bg-glow), var(--bg)');
  assert.doesNotMatch(read('hub-sidebar.jsx'), /borderRight:/);
  assert.match(read('hub-topbar.jsx'), /className="hub-topbar" style=\{\{\s*flexShrink: 0,\s*display: 'flex'/);
  assert.match(tokens, /\.hub-topbar \{[^}]*background: var\(--surface\);[^}]*border-bottom: 1px solid var\(--line-soft\);/);
});
